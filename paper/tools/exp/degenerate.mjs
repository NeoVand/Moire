// The band the budget cannot cover.
//
// Outside the envelope the exhaustive reference is unaffordable, so the
// comparison is against the same solver with the budget raised to 131072, which
// walks every index inside the span cap at stride 1. That is exact for every
// setting the UI can express except the exact-marginal drift == spacing line,
// where the window is genuinely unbounded.
//
//   node paper/tools/exp/degenerate.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUDGET_PATCH, DATA, loadSolver } from '../lib/instrument.mjs';
import { ringDrift, ringIndexWindow, shapeKappa } from '../../../src/gpu/inverseCpu.ts';

const W = 1200;
const H = 800;
const SAMPLES = 160;
const THICKNESS = 1.5;
const SHAPE_CODE = { circle: 1, square: 2, triangle: 3, hexagon: 4, pentagon: 4, nonagon: 4 };
const SHAPE_SIDES = { circle: 6, square: 4, triangle: 3, hexagon: 6, pentagon: 5, nonagon: 9 };

const final = await loadSolver('final');
const deep = await loadSolver('final', BUDGET_PATCH(131072), 'deep');

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-9)));
  return t * t * (3 - 2 * t);
}

function* samplePoints(zoom, count) {
  const gx = 0.7548776662466927;
  const gy = 0.5698402909980532;
  for (let i = 1; i <= count; i++) {
    yield { x: (((i * gx) % 1) - 0.5) * (W / zoom), y: (((i * gy) % 1) - 0.5) * (H / zoom) };
  }
}

// Reconstruct the strided settings from the envelope sweep, then take a
// stratified sample: every low-ink case, plus a slice of the saturated ones.
const lines = readFileSync(join(DATA, 'saturation-sweep.csv'), 'utf8').trim().split('\n');
const head = lines[0].split(',');
const all = lines.slice(1).map((l) => {
  const parts = l.split(',');
  return Object.fromEntries(parts.map((v, i) => [head[i], Number.isNaN(+v) ? v : +v]));
});
const strided = all.filter((r) => !r.fits);
const lowInk = strided.filter((r) => r.inkAtLeast < 0.35);
const saturated = strided.filter((r) => r.inkAtLeast >= 0.35).filter((_, i) => i % 37 === 0);
const chosen = [...lowInk.filter((_, i) => i % 3 === 0), ...saturated];

const rows = [];
for (const r of chosen) {
  const shape = SHAPE_CODE[r.shape];
  const sides = SHAPE_SIDES[r.shape];
  // The sweep recorded drift/spacing, not the offset itself; any offset with that
  // support value behaves identically in the bound, so pick one along +x.
  const targetDrift = r.driftRatio * r.spacing;
  const unit = ringDrift({ x: 1, y: 0 }, shape, sides);
  const offset = { x: targetDrift / Math.max(unit, 1e-6), y: 0 };
  const drift = ringDrift(offset, shape, sides);
  const kappa = shapeKappa(shape, sides);
  const pixel = 1 / Math.max(r.zoom, 0.08);
  const halfT = Math.max(THICKNESS * 0.5, pixel * 1.15);
  const aa = pixel * 0.7;
  const accept = Math.max(halfT - aa, 0);
  const reject = halfT + aa;
  const guard = Math.max(reject, r.spacing * 0.75);

  let dropped = 0;
  let invented = 0;
  let inkDeep = 0;
  let n = 0;
  let evals = 0;
  let capped = 0;
  for (const p of samplePoints(r.zoom, SAMPLES)) {
    const win = ringIndexWindow(
      Math.hypot(p.x, p.y),
      Math.hypot(offset.x, offset.y),
      drift,
      r.spacing,
      0,
      kappa,
      guard
    );
    if (win.hi - win.lo + 1 >= 65536) capped += 1;
    const args = [p, offset, r.theta, r.spacing, 0, shape, sides, accept, reject];
    deep.COUNT.metric = 0;
    const dDeep = deep.ringDistance(...args);
    evals += deep.COUNT.metric;
    const dFin = final.ringDistance(...args);
    const aDeep = 1 - smoothstep(halfT - aa, halfT + aa, dDeep);
    const aFin = 1 - smoothstep(halfT - aa, halfT + aa, dFin);
    if (aDeep > 0.5) inkDeep += 1;
    if (aFin - aDeep < -0.5) dropped += 1;
    if (aFin - aDeep > 0.5) invented += 1;
    n += 1;
  }
  rows.push({
    setting: `${r.shape} s=${r.spacing} drift/s=${r.driftRatio} rot=${r.theta} zoom=${r.zoom}`,
    spanP90: r.spanP90,
    inkDeep: Math.round((inkDeep / n) * 1000) / 1000,
    dropped: Math.round((dropped / n) * 10000) / 10000,
    invented: Math.round((invented / n) * 10000) / 10000,
    deepEvalsPerPixel: Math.round(evals / n),
    fractionAtSpanCap: Math.round((capped / n) * 100) / 100,
  });
}

const worst = [...rows].sort((a, b) => b.dropped - a.dropped);
const legible = rows.filter((r) => r.inkDeep < 0.5);
const summary = {
  settingsChecked: rows.length,
  withAnyDrop: rows.filter((r) => r.dropped > 0).length,
  worstDropped: Math.max(...rows.map((r) => r.dropped)),
  meanDropped: Math.round((rows.reduce((a, b) => a + b.dropped, 0) / rows.length) * 100000) / 100000,
  worstInvented: Math.max(...rows.map((r) => r.invented)),
  legibleSettings: legible.length,
  legibleWorstDropped: legible.length ? Math.max(...legible.map((r) => r.dropped)) : 0,
  medianInkDeep: [...rows].map((r) => r.inkDeep).sort((a, b) => a - b)[rows.length >> 1],
  worst8: worst.slice(0, 8),
};
writeFileSync(join(DATA, 'degenerate.json'), `${JSON.stringify({ summary, rows }, null, 2)}\n`);

console.log(`strided settings checked against the deep scan: ${summary.settingsChecked}`);
console.log(`  settings where budget 1024 drops any ink: ${summary.withAnyDrop}`);
console.log(`  worst dropped ${(summary.worstDropped * 100).toFixed(1)}%   mean ${(summary.meanDropped * 100).toFixed(3)}%   invented ${(summary.worstInvented * 100).toFixed(1)}%`);
console.log(`  median exact ink here: ${summary.medianInkDeep}`);
console.log(`  of the ${summary.legibleSettings} settings under 50% ink, worst dropped ${(summary.legibleWorstDropped * 100).toFixed(1)}%`);
for (const w of summary.worst8) {
  console.log(`    ${(w.dropped * 100).toFixed(1)}%  ${w.setting}  [span ${w.spanP90}, ink ${w.inkDeep}, deep ${w.deepEvalsPerPixel} ev/px]`);
}
console.log(`\nwrote ${join(DATA, 'degenerate.json')}`);
