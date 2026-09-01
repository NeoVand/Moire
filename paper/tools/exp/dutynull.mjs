// Duty nulls, the first verified prediction of the counting-map theory: a
// (p,-q) station is carried by the fine layer's q-th profile harmonic, and
// an ink stroke of duty d has zero q-th harmonic exactly when q*d is an
// integer. So the (1,-2) station of a near-2:1 pair must die at duty 1/2 --
// while the (1,-1) difference beat, carried by first harmonics, peaks at
// that same width. One slider extinguishes one fringe system at the moment
// it maximizes another. Run: node paper/tools/exp/dutynull.mjs
//
// First measured 2026-09-01 (session): |(1,-2)| collapses 0.024 -> 0.0005
// at duty 0.50 (50x), |(1,-1)| peaks 0.051 there. Paper-2 plan P1: extend
// with a rendered figure and numbers.tex macros.

import { view, compose } from '../lib/render.mjs';

const V = view({ width: 2048, height: 1, zoom: 1, superSample: 1 });
const sA = 16.4;
const sB = 8;

const proj = (rgb, nu) => {
  let re = 0;
  let im = 0;
  for (let x = 0; x < V.width; x++) {
    const wx = x + 0.5 - V.width / 2;
    const v = rgb[x * 3] / 255;
    re += v * Math.cos(2 * Math.PI * nu * wx);
    im += v * Math.sin(2 * Math.PI * nu * wx);
  }
  return Math.hypot(re, im) / V.width;
};

const rows = [];
for (const tB of [1.6, 2.4, 3.2, 4.0, 4.4, 4.8, 5.6, 6.4, 7.2]) {
  const rgb = compose(V, [
    { kind: 'parallel', angle: 0, spacing: sA, thickness: 3, color: '#000000' },
    { kind: 'parallel', angle: 0, spacing: sB, thickness: tB, color: '#000000' },
  ]);
  rows.push({
    duty: tB / sB,
    station: proj(rgb, 1 / sA - 2 / sB),
    diff: proj(rgb, 1 / sA - 1 / sB),
  });
  const r = rows[rows.length - 1];
  console.log(
    `duty ${r.duty.toFixed(2)}  |(1,-2)| ${r.station.toFixed(4)}  |(1,-1)| ${r.diff.toFixed(4)}`
  );
}

// Gates: the station's amplitude at duty 1/2 sits far below its neighbours,
// and the difference beat peaks there.
const at = (d) => rows.find((r) => Math.abs(r.duty - d) < 1e-9);
const nullRatio = Math.min(at(0.3).station, at(0.7).station) / Math.max(at(0.5).station, 1e-9);
const diffPeak = rows.every((r) => r.diff <= at(0.5).diff + 1e-9);
console.log(`station null depth vs neighbours: ${nullRatio.toFixed(1)}x`);
console.log(nullRatio > 10 && diffPeak ? 'all gates pass' : 'GATE FAILURE');
process.exitCode = nullRatio > 10 && diffPeak ? 0 : 1;
