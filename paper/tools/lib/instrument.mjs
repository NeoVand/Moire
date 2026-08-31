// Cost counters, applied to the solver sources instead of copied into them.
//
// Every candidate index costs exactly one `shapeRadius` call in all three
// solvers, and B0's Newton step costs one `shapeRadius` plus one `shapeGrad`.
// So "metric evaluations per pixel" is a fair, implementation-independent unit
// of work. Patching the real sources at load time means the instrumented build
// can never drift from what ships.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');
const BUILD = join(ROOT, 'paper/.build');

/** Rewrite `fn` into `fn__raw` plus a counting shim that keeps the old name. */
function countCalls(src, fn, field) {
  const decl = new RegExp(`(export )?function ${fn}\\(`);
  if (!decl.test(src)) throw new Error(`instrument: no declaration of ${fn}`);
  const patched = src.replace(decl, `function ${fn}__raw(`);
  return `${patched}
export function ${fn}(...a) {
  COUNT.${field} += 1;
  return ${fn}__raw(...a);
}
`;
}

const SOLVERS = {
  // B0: heuristic seeds, Newton polish, fixed-sample sweep of n. Pre-print.
  sweep: 'paper/tools/legacy/inverseCpuSweep.ts',
  // B1: first provable window, |delta| drift bound, no stride, cos/sin per candidate.
  window1: 'paper/tools/legacy/inverseCpuWindow1.ts',
  // B2: exact drift bound, anchored stride, carried rotation, support fast paths.
  final: 'src/gpu/inverseCpu.ts',
};

export const SOLVER_NAMES = Object.keys(SOLVERS);

/**
 * Import a solver with a live `COUNT` of metric evaluations. Returns
 * `{ ringDistance(p, offset, theta, spacing, phase, shape, sides, accept, reject), COUNT, mod }`.
 *
 * `patches` are literal `[find, replace]` pairs applied to the source before
 * loading, so an ablation disables one mechanism in the shipping solver rather
 * than reimplementing it. A patch that does not match is an error, which keeps
 * the ablations honest as the source moves.
 */
export async function loadSolver(name, patches = [], label = name) {
  const rel = SOLVERS[name];
  if (!rel) throw new Error(`instrument: unknown solver ${name}`);
  let src = readFileSync(join(ROOT, rel), 'utf8');
  for (const [find, replace] of patches) {
    if (!src.includes(find)) throw new Error(`instrument: patch missed in ${name}: ${find}`);
    src = src.replaceAll(find, replace);
  }
  src = countCalls(src, 'shapeRadius', 'metric');
  if (/function shapeGrad\(/.test(src)) src = countCalls(src, 'shapeGrad', 'grad');
  src = `export const COUNT = { metric: 0, grad: 0 };\n${src}`;

  mkdirSync(BUILD, { recursive: true });
  const out = join(BUILD, `counted.${label}.ts`);
  writeFileSync(out, src);
  const mod = await import(`${out}?v=${Date.now()}`);

  return {
    name: label,
    mod,
    COUNT: mod.COUNT,
    ringDistance: mod.ringDistanceCpu,
    /** The {r, rUp, rDown, floor} trio, for the envelope's residual sweep. Only
     * the shipping solver exports it; ablations predate the phase view. */
    ringPhase: mod.ringPhaseCpu ?? null,
    /** B0 predates the reject-above guard, so it simply ignores the extra argument. */
    accepts: { reject: mod.ringDistanceCpu.length >= 9 },
  };
}

export async function loadAllSolvers() {
  const out = {};
  for (const name of SOLVER_NAMES) out[name] = await loadSolver(name);
  return out;
}

/**
 * Single-mechanism ablations of the shipping solver, each expressed as a literal
 * edit to `src/gpu/inverseCpu.ts`.
 */
export const ABLATIONS = {
  // Anchor the strided lattice to the pixel's own window instead of to the scene.
  'pixel-anchored stride': [['Math.ceil(lo / stride) * stride', 'lo']],
  // Never stride: walk from lo and let the budget cut the tail off.
  'no stride (truncate)': [['  if (span <= RING_BUDGET) return 1;\n  return 2 ** Math.ceil(Math.log2(span / RING_BUDGET));', '  return 1;']],
  // Visit every index in the window instead of skipping proven-empty runs.
  'no Lipschitz skip': [['const safe = Math.floor((gap - bar) / slope) + 1;', 'const safe = 1;']],
  // Keep measuring after the pixel is already fully inside the stroke. The early
  // exit became a `break` rather than a `return` when the scan started tracking
  // runners-up, so that the post-loop clamp still runs; the ablation is the same
  // one either way, but the anchor had to follow.
  'no accept exit': [['if (acceptBelow > 0 && best <= acceptBelow) break;', '']],
  // Ignore the stroke's reject threshold and always resolve to a full period.
  'no reject guard': [['const guard = Math.max(rejectAbove, s * 0.75);', 'const guard = s * 0.75;']],
  // Bound the drift by |delta| instead of the support function at -delta.
  'loose drift bound': [['return shapeRadius({ x: -offset.x, y: -offset.y }, shape, sides);', 'return Math.hypot(offset.x, offset.y);']],
  // Drop the support-function fast paths, so every polygon pays atan2 + cos.
  'no support fast path': [['  if (Math.abs(n - 3) < 1e-3) return Math.max(q.x, ROOT3_2 * Math.abs(q.y) - 0.5 * q.x);\n  if (Math.abs(n - 4) < 1e-3) return Math.max(Math.abs(q.x), Math.abs(q.y));\n  if (Math.abs(n - 6) < 1e-3) {\n    const ax = Math.abs(q.x);\n    return Math.max(ax, 0.5 * ax + ROOT3_2 * Math.abs(q.y));\n  }\n', '']],
};

/** Record which indices the scan actually evaluates, for the walkthrough figure. */
export const VISIT_PATCH = [
  [
    `    const signed =
      shapeRadius({ x: radius * c - offX, y: -radius * sn - offY }, shape, sides) - ringR;`,
    `    if (globalThis.__visited) globalThis.__visited.push(n);
    const signed =
      shapeRadius({ x: radius * c - offX, y: -radius * sn - offY }, shape, sides) - ringR;`,
  ],
];

/** Shrink the budget so the stride engages in a scene sparse enough to read. */
export const BUDGET_PATCH = (n) => [['export const RING_BUDGET = 1024;', `export const RING_BUDGET = ${n};`]];

export async function loadAblation(key) {
  return loadSolver('final', ABLATIONS[key], `final--${key.replace(/[^a-z0-9]+/gi, '-')}`);
}

export const FIGURES = join(ROOT, 'paper/figures');
export const DATA = join(ROOT, 'paper/data');
mkdirSync(FIGURES, { recursive: true });
mkdirSync(DATA, { recursive: true });
