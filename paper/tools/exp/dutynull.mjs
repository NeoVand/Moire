// Duty nulls, the first verified prediction of the counting-map theory. A
// p:q pair's visible station is the character (q,-p) -- q times the coarse
// index minus p times the fine -- carried by the coarse family's q-th
// profile harmonic and the fine family's p-th, and a stroke of duty d has no
// q-th harmonic exactly when q d is an integer. So the 2:1 pair's station
// dies when the COARSE stroke fills half its pitch, and the 3:1 pair's dies
// at a third and at two thirds: one slider, the coarse thickness, switches a
// fringe system off at a rational duty and back on either side of it.
// Fringe spectroscopy in reverse -- find the null, read the duty.
//
// The pairs are 16.4:8 and 24.6:8, whose stations both beat at exactly one
// cycle per 328 world units (2/16.4 - 1/8 = 3/24.6 - 1/8 = -1/328), so a
// strip of 3936 = 12 x 328 world units holds a whole number of every period
// in the drawing and the projection is an exact Fourier coefficient. The
// first cut of this script projected onto 1/sA - 2/sB, a carrier-scale
// coefficient of the same drawing (period 5.3) rather than the station
// (period 328) -- the null it found was real, the fringe was not;
// observer.mjs gates the slowness now. Run: node paper/tools/exp/dutynull.mjs

import { writeFileSync } from 'node:fs';
import { view, compose } from '../lib/render.mjs';

const OUT = new URL('../../data/dutynull.json', import.meta.url);
const V = view({ width: 3936, height: 1, zoom: 1, superSample: 1 });
const sB = 8;
const tB = 2.4;

const proj = (rgb, nu) => {
  let re = 0;
  let im = 0;
  for (let x = 0; x < V.width; x++) {
    const wx = x + 0.5;
    const v = rgb[x * 3] / 255;
    re += v * Math.cos(2 * Math.PI * nu * wx);
    im += v * Math.sin(2 * Math.PI * nu * wx);
  }
  return Math.hypot(re, im) / V.width;
};

const sweep = (sA, q) => {
  const nu = q / sA - 1 / sB;
  const rows = [];
  for (const duty of [0.2, 0.25, 0.3, 1 / 3, 0.4, 0.45, 0.5, 0.55, 0.6, 2 / 3, 0.7, 0.75, 0.8]) {
    const rgb = compose(V, [
      { kind: 'parallel', angle: 0, spacing: sA, thickness: duty * sA, color: '#000000' },
      { kind: 'parallel', angle: 0, spacing: sB, thickness: tB, color: '#000000' },
    ]);
    // The hard-ink prediction: |sin(q pi d) / (q pi)| times the fine stroke's
    // first harmonic, |sin(pi tB/sB) / pi|.
    const predicted = Math.abs(Math.sin(q * Math.PI * duty) / (q * Math.PI)) * Math.abs(Math.sin(Math.PI * tB / sB) / Math.PI);
    rows.push({ duty, station: proj(rgb, nu), predicted });
    const r = rows[rows.length - 1];
    console.log(
      `${q}:1 pair, coarse duty ${duty.toFixed(3)}  |(${q},-1)| ${r.station.toFixed(4)}  (hard-ink ${r.predicted.toFixed(4)})`
    );
  }
  return { sA, q, period: 1 / Math.abs(nu), rows };
};

const at = (rows, d) => rows.find((r) => Math.abs(r.duty - d) < 1e-9);
const depth = (rows, d, lo, hi) => Math.min(at(rows, lo).station, at(rows, hi).station) / Math.max(at(rows, d).station, 1e-9);

const two = sweep(16.4, 2);
const three = sweep(24.6, 3);
const nulls = [
  { pair: '2:1', duty: 0.5, depth: depth(two.rows, 0.5, 0.4, 0.6) },
  { pair: '3:1', duty: 1 / 3, depth: depth(three.rows, 1 / 3, 0.25, 0.4) },
  { pair: '3:1', duty: 2 / 3, depth: depth(three.rows, 2 / 3, 0.6, 0.75) },
];
for (const n of nulls) console.log(`${n.pair} station null at duty ${n.duty.toFixed(3)}: ${n.depth.toFixed(1)}x below its neighbours`);
// The station of a 2:1 pair must survive at every other duty tested, so the
// null is a null and not a dead channel.
const alive = two.rows.filter((r) => Math.abs(r.duty - 0.5) > 1e-9).every((r) => r.station > 0.005);
const ok = nulls.every((n) => n.depth > 10) && alive;
writeFileSync(OUT, JSON.stringify({ two, three, nulls, gates: { nullDepth: nulls.every((n) => n.depth > 10), alive } }, null, 1));
console.log(ok ? 'all gates pass' : 'GATE FAILURE');
process.exitCode = ok ? 0 : 1;
