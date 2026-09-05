import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';

export const PRODUCTION_KERNEL = 'demo/ours-kernel.wgsl.js';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function option(argv, name) {
  const matches = argv.filter(arg => arg === name || arg.startsWith(`${name}=`));
  if (matches.length > 1) throw new Error(`Duplicate ${name} option.`);
  if (!matches.length) return null;
  if (!matches[0].startsWith(`${name}=`) || !matches[0].slice(name.length + 1)) {
    throw new Error(`Use ${name}=<value>.`);
  }
  return matches[0].slice(name.length + 1);
}

function moduleExports(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const exports = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ImportExpression', 'ExportAllDeclaration'].includes(node.type)
        || (node.type === 'ExportNamedDeclaration' && node.source)
        || (node.type === 'MetaProperty' && node.meta.name === 'import')) {
      throw new Error('A candidate must be a self-contained ESM module: imports, re-exports from other modules, and import.meta are unsupported.');
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') exports.add('default');
    if (node.type !== 'ExportNamedDeclaration') continue;
    for (const specifier of node.specifiers) exports.add(specifier.exported.name ?? specifier.exported.value);
    const declaration = node.declaration;
    if (declaration?.id) exports.add(declaration.id.name);
    for (const item of declaration?.declarations ?? []) {
      // Our modules export named constants/functions. Reject ambiguous patterns
      // instead of guessing which binding supplies the shader text.
      if (item.id.type !== 'Identifier') throw new Error('Destructured candidate exports are unsupported.');
      exports.add(item.id.name);
    }
  }
  const selected = exports.has('OURS_KERNEL_CORE') ? 'OURS_KERNEL_CORE' : 'OURS_KERNEL';
  if (!exports.has(selected)) throw new Error('Candidate must export OURS_KERNEL_CORE or OURS_KERNEL.');
  return { selected, names: [...exports].sort() };
}

/**
 * Freeze one committed self-contained JavaScript kernel for this test server.
 * No flags returns no plugin: the normal working-tree module remains in use.
 * readSource() returns raw module text, not evaluated WGSL. verify() checks the
 * evidence bytes and production module; runners separately check their harness.
 */
export function createCandidateSource({ root, argv = process.argv.slice(2), evidencePath }) {
  // Vite canonicalizes symlinked roots (including macOS /var -> /private/var).
  // Match its resolved absolute module ID, not the caller's path spelling.
  root = fs.realpathSync(root);
  const requestedRef = option(argv, '--kernel-ref');
  const modulePath = option(argv, '--kernel-path');
  if ((requestedRef === null) !== (modulePath === null)) {
    throw new Error('Use --kernel-ref and --kernel-path together.');
  }
  const target = path.join(root, PRODUCTION_KERNEL);
  const productionBytes = fs.readFileSync(target);
  const productionSha256 = sha256(productionBytes);
  if (requestedRef === null) {
    return {
      plugins: [],
      metadata: Object.freeze({ mode: 'working-tree', modulePath: PRODUCTION_KERNEL,
        sha256: productionSha256, selectedExport: 'OURS_KERNEL', snapshot: null }),
      readSource: () => productionBytes.toString('utf8'),
      verify: () => {
        const after = sha256(fs.readFileSync(target));
        return { valid: after === productionSha256, productionUnchanged: after === productionSha256,
          productionSha256Before: productionSha256, productionSha256After: after };
      },
    };
  }
  if (!evidencePath) throw new Error('An evidencePath is required for an immutable candidate.');
  if (fs.existsSync(evidencePath)) throw new Error('Candidate evidence report already exists; choose a fresh path.');
  if (requestedRef.startsWith('-') || /[\0\r\n]/.test(requestedRef)) throw new Error('Invalid kernel ref.');
  if (path.posix.isAbsolute(modulePath) || /[\\:\x00-\x1f]/.test(modulePath)
      || modulePath.startsWith('-') || modulePath.split('/').some(part => !part || part === '.' || part === '..')
      || !/\.(?:mjs|js)$/.test(modulePath)) {
    throw new Error('Kernel path must be a normalized repository-relative .js or .mjs path.');
  }
  const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  let commit, entry, bytes;
  try {
    commit = git(['rev-parse', '--verify', '--end-of-options', `${requestedRef}^{commit}`]).toString('utf8').trim();
    entry = git(['ls-tree', '-z', commit, '--', modulePath]).toString('utf8');
    const match = /^(100644|100755) blob ([0-9a-f]+)\t([^\0]+)\0$/.exec(entry);
    if (!match || match[3] !== modulePath) throw new Error('Candidate path is missing, a symlink, or not a regular Git blob.');
    const size = Number(git(['cat-file', '-s', match[2]]).toString('utf8'));
    if (!Number.isSafeInteger(size) || size > 2 * 1024 * 1024) throw new Error('Candidate module exceeds the 2 MiB limit.');
    bytes = git(['cat-file', 'blob', match[2]]);
    entry = { mode: match[1], blob: match[2] };
  } catch (error) {
    throw new Error(`Cannot freeze kernel ${requestedRef}:${modulePath}: ${error.message}`, { cause: error });
  }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const exports = moduleExports(source);
  const digest = sha256(bytes);
  const virtual = `virtual:moire-candidate-${digest}`;
  const virtualId = `\0${virtual}`;
  const wrapper = `export * from ${JSON.stringify(virtual)};\n`
    + `export { ${exports.selected} as OURS_KERNEL } from ${JSON.stringify(virtual)};\n`
    + (exports.names.includes('default') ? `export { default } from ${JSON.stringify(virtual)};\n` : '');
  const directory = `${path.resolve(evidencePath)}.kernel`;
  // Exclusive creation prevents two runs from silently sharing or replacing an
  // evidence package. The plugin serves the captured bytes, never these files.
  fs.mkdirSync(directory);
  const snapshot = path.join(directory, 'source.mjs');
  const adapter = path.join(directory, 'adapter.mjs');
  const metadata = Object.freeze({ mode: 'immutable-git-candidate', requestedRef, commit,
    modulePath, gitBlob: entry.blob, gitMode: entry.mode, sha256: digest, byteLength: bytes.length,
    selectedExport: exports.selected, exports: exports.names, productionModule: PRODUCTION_KERNEL,
    productionSha256Before: productionSha256,
    snapshot: path.relative(path.dirname(path.resolve(evidencePath)), snapshot),
    adapter: path.relative(path.dirname(path.resolve(evidencePath)), adapter), adapterSha256: sha256(wrapper),
    workCounterShim: false,
    attribution: 'sha256 identifies the exact Git module bytes. sourceHashes in the runner identify live harness files, not the selected candidate. No working candidate file or dependency is loaded.' });
  const selection = JSON.stringify(metadata, null, 2) + '\n';
  fs.writeFileSync(snapshot, bytes, { flag: 'wx', mode: 0o444 });
  fs.writeFileSync(adapter, wrapper, { flag: 'wx', mode: 0o444 });
  fs.writeFileSync(path.join(directory, 'selection.json'), selection, { flag: 'wx', mode: 0o444 });
  const plugin = {
    name: 'moire-immutable-kernel-candidate', enforce: 'pre',
    resolveId(id) { return id === virtual ? virtualId : null; },
    load(id) {
      if (id === virtualId) return source;
      // Match the one resolved absolute production module, never basenames or
      // other demo modules. Vite may append a cache-busting query to this ID.
      if (id.split('?')[0] === target) return wrapper;
      return null;
    },
  };
  return {
    plugins: [plugin], metadata, readSource: () => source,
    verify() {
      const productionAfter = sha256(fs.readFileSync(target));
      const snapshotUnchanged = sha256(fs.readFileSync(snapshot)) === digest
        && sha256(fs.readFileSync(adapter)) === metadata.adapterSha256
        && fs.readFileSync(path.join(directory, 'selection.json'), 'utf8') === selection;
      return { valid: productionAfter === productionSha256 && snapshotUnchanged,
        productionUnchanged: productionAfter === productionSha256, snapshotUnchanged,
        productionSha256Before: productionSha256, productionSha256After: productionAfter };
    },
  };
}

export function assertCandidateUnchanged(candidate) {
  const result = candidate.verify();
  assert.ok(result.valid, `Candidate snapshot or production kernel changed during the run: ${JSON.stringify(result)}`);
  return result;
}
