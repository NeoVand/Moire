// Where does the budget actually bind, and what does the exact field look like
// there?
//
// Any partial scan takes a min over a subset of the indices, so its answer is an
// upper bound on the true distance and its ink is a *lower* bound on the true
// ink. That makes "the field is already saturated" a claim we can establish
// cheaply and safely, even in the band where the exhaustive reference is
// unaffordable.
//
//   node paper/tools/exp/saturation.mjs

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, loadSolver } from '../lib/instrument.mjs';
import {
  RING_BUDGET,
  ringDrift,
  ringIndexWindow,
  shapeKappa,
} from '../../../src/gpu/inverseCpu.ts';

const W = 1200;
const H = 800;
const SAMPLES = 512;
const THICKNESS = 1.5;

const SHAPES = [
  { code: 1, sides: 6, name: 'circle' },
  { code: 2, sides: 4, name: 'square' },
  { code: 3, sides: 3, name: 'triangle' },
  { code: 4, sides: 6, name: 'hexagon' },
  { code: 4, sides: 5, name: 'pentagon' },
  { code: 4, sides: 9, name: 'nonagon' },
];
const SPACINGS = [1, 1.5, 2, 3, 4, 6, 9, 14, 20, 30, 45, 70, 120];
const OFFSETS = [];
for (const x of [0, 0.5, 1, 2, 3, 4]) for (const y of [0, 1, 2.5, 4]) OFFSETS.push({ x, y });
const ROTS = [0, 0.002, 0.01, 0.05, 0.2];
const ZOOMS = [8, 2, 1, 0.4, 0.15, 0.08];

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

const final = await loadSolver('final');
const rows = [];

for (const shape of SHAPES) {
  const kappa = shapeKappa(shape.code, shape.sides);
  for (const spacing of SPACINGS) {
    for (const offset of OFFSETS) {
      const offLen = Math.hypot(offset.x, offset.y);
      const drift = ringDrift(offset, shape.code, shape.sides);
      for (const theta of ROTS) {
        if (offLen === 0 && theta === 0) continue;
        for (const zoom of ZOOMS) {
          const pixel = 1 / Math.max(zoom, 0.08);
          const halfT = Math.max(THICKNESS * 0.5, pixel * 1.15);
          const aa = pixel * 0.7;
          const accept = Math.max(halfT - aa, 0);
          const reject = halfT + aa;
          const guard = Math.max(reject, spacing * 0.75);

          const spans = [];
          let inked = 0;
          let n = 0;
          for (const p of samplePoints(zoom, SAMPLES)) {
            const win = ringIndexWindow(
              Math.hypot(p.x, p.y),
              offLen,
              drift,
              spacing,
              0,
              kappa,
              guard
            );
            spans.push(win.hi - win.lo + 1);
            const d = final.ringDistance(
              p,
              offset,
              theta,
              spacing,
              0,
              shape.code,
              shape.sides,
              accept,
              reject
            );
            if (1 - smoothstep(halfT - aa, halfT + aa, d) > 0.5) inked += 1;
            n += 1;
          }
          spans.sort((a, b) => a - b);
          const median = spans[spans.length >> 1];
          const p90 = spans[Math.floor(spans.length * 0.9)];
          rows.push({
            shape: shape.name,
            spacing,
            offLen: Math.round(offLen * 1000) / 1000,
            drift: Math.round(drift * 1000) / 1000,
            driftRatio: Math.round((drift / spacing) * 1000) / 1000,
            theta,
            zoom,
            spanMedian: median,
            spanP90: p90,
            fits: p90 <= RING_BUDGET ? 1 : 0,
            // Lower bound: a partial scan can only miss ink, never invent it.
            inkAtLeast: Math.round((inked / n) * 1000) / 1000,
          });
        }
      }
    }
  }
}

const strided = rows.filter((r) => !r.fits);
const fitting = rows.filter((r) => r.fits);
const minInkWhenStrided = strided.length ? Math.min(...strided.map((r) => r.inkAtLeast)) : null;

const csv = [
  'spanMedian,spanP90,inkAtLeast,fits,driftRatio,spacing,zoom,theta,shape',
  ...rows.map(
    (r) =>
      `${r.spanMedian},${r.spanP90},${r.inkAtLeast},${r.fits},${r.driftRatio},${r.spacing},${r.zoom},${r.theta},${r.shape}`
  ),
].join('\n');
writeFileSync(join(DATA, 'saturation-sweep.csv'), `${csv}\n`);

const summary = {
  budget: RING_BUDGET,
  settings: rows.length,
  fitting: fitting.length,
  strided: strided.length,
  minInkWhenStrided,
  medianInkWhenStrided: strided.length
    ? strided.map((r) => r.inkAtLeast).sort((a, b) => a - b)[strided.length >> 1]
    : null,
  strideBelowHalfInk: strided.filter((r) => r.inkAtLeast < 0.5).length,
  worstFittingSpan: Math.max(...fitting.map((r) => r.spanP90)),
  // Every strided setting has drift within this factor of the spacing.
  driftRatioRangeWhenStrided: strided.length
    ? [Math.min(...strided.map((r) => r.driftRatio)), Math.max(...strided.map((r) => r.driftRatio))]
    : null,
};
writeFileSync(join(DATA, 'saturation.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`settings: ${summary.settings}`);
console.log(`  window fits budget ${RING_BUDGET}: ${summary.fitting}  (widest fitting span ${summary.worstFittingSpan})`);
console.log(`  strided:                           ${summary.strided}`);
console.log(`  least ink in any strided setting:   ${minInkWhenStrided}  (median ${summary.medianInkWhenStrided})`);
console.log(`  strided settings under 50% ink:     ${summary.strideBelowHalfInk}`);
console.log(`  drift / spacing when strided:       ${JSON.stringify(summary.driftRatioRangeWhenStrided)}`);
console.log(`\nwrote ${join(DATA, 'saturation-sweep.csv')} and saturation.json`);
