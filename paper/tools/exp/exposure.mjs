// Temporal selection, the second verified prediction: a long exposure of an
// animated stack IS an envelope along the rate vector r, so exactly the
// characters with k . r = 0 survive the average. Animate a near-2:1 pair's
// phases at rates (1,1) and the (1,-1) difference survives while the (1,-2)
// station washes; animate at (2,1) and they swap. The camera's shutter is a
// tunable filter over fringe systems, and the envelope view is physics, not
// post-processing. Run: node paper/tools/exp/exposure.mjs
//
// First measured 2026-09-01 (session): 400:1 selectivity swap. Paper-2 plan
// P1: extend with the two-exposure figure and numbers.tex macros.

import { view, compose } from '../lib/render.mjs';

const V = view({ width: 2048, height: 1, zoom: 1, superSample: 1 });
const sA = 16.4;
const sB = 8;
const N = 96;

const proj = (acc, nu) => {
  let re = 0;
  let im = 0;
  for (let x = 0; x < V.width; x++) {
    const wx = x + 0.5 - V.width / 2;
    const v = acc[x] / 255;
    re += v * Math.cos(2 * Math.PI * nu * wx);
    im += v * Math.sin(2 * Math.PI * nu * wx);
  }
  return Math.hypot(re, im) / V.width;
};

const expose = (rA, rB) => {
  const acc = new Float64Array(V.width);
  for (let f = 0; f < N; f++) {
    const t = f / N;
    const rgb = compose(V, [
      {
        kind: 'parallel',
        angle: 0,
        spacing: sA,
        thickness: 3,
        phase: rA * sA * t,
        color: '#000000',
      },
      {
        kind: 'parallel',
        angle: 0,
        spacing: sB,
        thickness: 2.4,
        phase: rB * sB * t,
        color: '#000000',
      },
    ]);
    for (let x = 0; x < V.width; x++) acc[x] += rgb[x * 3] / N;
  }
  return {
    station: proj(acc, 1 / sA - 2 / sB),
    diff: proj(acc, 1 / sA - 1 / sB),
  };
};

const diag = expose(1, 1);
const dev = expose(2, 1);
console.log(
  `rates (1,1): |(1,-2)| ${diag.station.toFixed(4)}  |(1,-1)| ${diag.diff.toFixed(4)}`
);
console.log(
  `rates (2,1): |(1,-2)| ${dev.station.toFixed(4)}  |(1,-1)| ${dev.diff.toFixed(4)}`
);
const sel1 = diag.diff / Math.max(diag.station, 1e-9);
const sel2 = dev.station / Math.max(dev.diff, 1e-9);
console.log(`selectivity: ${sel1.toFixed(0)}x toward (1,-1), then ${sel2.toFixed(0)}x toward (1,-2)`);
console.log(sel1 > 30 && sel2 > 30 ? 'all gates pass' : 'GATE FAILURE');
process.exitCode = sel1 > 30 && sel2 > 30 ? 0 : 1;
