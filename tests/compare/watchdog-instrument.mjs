// Test-only loop instrumentation. Never use the resulting shader for timing or
// image-quality claims: an exhausted invocation returns an interrupted result.
export const WATCHDOG_PREFIX = 'moireDiagnosticWatchdog';

function tokensOf(source) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) { i++; continue; }
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i + 2); i = end < 0 ? source.length : end; continue;
    }
    if (source.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < source.length && depth) {
        if (source.startsWith('/*', i)) { depth++; i += 2; }
        else if (source.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error('Unterminated WGSL block comment.');
      continue;
    }
    if (source[i] === '"' || source[i] === "'") throw new Error('Unexpected quoted text in WGSL; refusing an unaudited transform.');
    const start = i;
    if (/[A-Za-z_0-9]/.test(source[i])) while (i < source.length && /[A-Za-z_0-9]/.test(source[i])) i++;
    else i++;
    tokens.push({ text: source.slice(start, i), start, end: i });
  }
  return tokens;
}

export function findWgslLoops(source) {
  const tokens = tokensOf(source), stack = [], matching = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].text;
    if (t === '(' || t === '{' || t === '[') stack.push(i);
    if (t === ')' || t === '}' || t === ']') {
      const open = stack.pop();
      if (open === undefined || ({ ')': '(', '}': '{', ']': '[' })[t] !== tokens[open].text) throw new Error('Unbalanced WGSL delimiters.');
      matching.set(open, i);
    }
  }
  if (stack.length) throw new Error('Unbalanced WGSL delimiters.');
  const loops = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], kind = token.text;
    if (kind !== 'loop' && kind !== 'for' && kind !== 'while') continue;
    let body = i + 1;
    if (kind === 'for') {
      if (tokens[body]?.text !== '(') throw new Error('WGSL for header is not recognized.');
      body = matching.get(body) + 1;
    } else if (kind === 'while') {
      while (body < tokens.length && tokens[body].text !== '{') {
        if (tokens[body].text === ';' || tokens[body].text === '}') throw new Error('WGSL while header is not recognized.');
        if (tokens[body].text === '(' || tokens[body].text === '[') body = matching.get(body);
        body++;
      }
    }
    if (tokens[body]?.text !== '{') throw new Error(`WGSL ${kind} body is not recognized.`);
    const prefix = source.slice(0, token.start), line = prefix.split('\n').length;
    loops.push({ kind, line, column: token.start - prefix.lastIndexOf('\n'), bodyStart: tokens[body].end });
  }
  return loops;
}

function guardFor(limit) {
  return `if (${WATCHDOG_PREFIX}Fuel >= ${limit}u) { ${WATCHDOG_PREFIX}Exhausted = true; break; } ${WATCHDOG_PREFIX}Fuel += 1u;`;
}

export function auditWgslWatchdog(source, limit, expectedLoopCount) {
  const loops = findWgslLoops(source), guard = guardFor(limit);
  const uncovered = loops.filter(loop => !source.slice(loop.bodyStart).trimStart().startsWith(guard));
  if (loops.length !== expectedLoopCount || uncovered.length) throw new Error(`Incomplete watchdog instrumentation: ${loops.length}/${expectedLoopCount} loops, ${uncovered.length} uncovered.`);
  return { limit, loopCount: loops.length, uncovered: 0 };
}

export function instrumentWgslWatchdog(source, { limit = 16384 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 32768) throw new Error('Watchdog limit must be an integer from 1 to 32768.');
  if (source.includes(WATCHDOG_PREFIX)) throw new Error('Watchdog identifiers are already present.');
  const loops = findWgslLoops(source), guard = guardFor(limit);
  let code = source;
  for (const loop of [...loops].reverse()) code = code.slice(0, loop.bodyStart) + `\n  ${guard}\n` + code.slice(loop.bodyStart);
  code = `var<private> ${WATCHDOG_PREFIX}Fuel: u32 = 0u;\nvar<private> ${WATCHDOG_PREFIX}Exhausted: bool = false;\n${code}`;
  return { code, audit: { ...auditWgslWatchdog(code, limit, loops.length), loops } };
}
