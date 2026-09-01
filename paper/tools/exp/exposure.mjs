// Temporal selection, the second verified prediction: a long exposure of an
// animated stack IS an envelope along the rate vector r, so exactly the
// characters with k . r = 0 survive the average. The 16.4:8 pair's visible
// station is (2,-1) -- twice the coarse index minus the fine, one cycle per
// 328 world units. Animate the two phases at rates (1,1) and the station
// washes (2 - 1 = 1 != 0); animate at (1,2) and it survives untouched, at the
// static drawing's own amplitude; (2,1) washes it again. The camera's shutter
// is a tunable filter over fringe systems, and the envelope view is physics,
// not post-processing. Run: node paper/tools/exp/exposure.mjs
//
// The first cut of this script projected onto 1/sA - 2/sB, a carrier-scale
// coefficient (period 5.3 world units) rather than the station; the swap it
// measured was real, but not the fringe anyone sees. observer.mjs gates the
// slowness now.

import { writeFileSync } from 'node:fs';
import { view, compose } from '../lib/render.mjs';

const OUT = new URL('../../data/exposure.json', import.meta.url);
const V = view({ width: 3936, height: 1, zoom: 1, superSample: 1 });
const sA = 16.4;
const sB = 8;
const N = 96;
const nu = 2 / sA - 1 / sB;

const proj = (acc) => {
  let re = 0;
  let im = 0;
  for (let x = 0; x < V.width; x++) {
    const wx = x + 0.5;
    const v = acc[x] / 255;
    re += v * Math.cos(2 * Math.PI * nu * wx);
    im += v * Math.sin(2 * Math.PI * nu * wx);
  }
  return Math.hypot(re, im) / V.width;
};

const frame = (t, rA, rB) =>
  compose(V, [
    { kind: 'parallel', angle: 0, spacing: sA, thickness: 3, phase: rA * sA * t, color: '#000000' },
    { kind: 'parallel', angle: 0, spacing: sB, thickness: 2.4, phase: rB * sB * t, color: '#000000' },
  ]);

const expose = (rA, rB) => {
  const acc = new Float64Array(V.width);
  for (let f = 0; f < N; f++) {
    const rgb = frame(f / N, rA, rB);
    for (let x = 0; x < V.width; x++) acc[x] += rgb[x * 3] / N;
  }
  return proj(acc);
};

const still = (() => {
  const rgb = frame(0, 0, 0);
  const acc = new Float64Array(V.width);
  for (let x = 0; x < V.width; x++) acc[x] = rgb[x * 3];
  return proj(acc);
})();
const exposures = [
  { rates: [1, 1], station: expose(1, 1) },
  { rates: [1, 2], station: expose(1, 2) },
  { rates: [2, 1], station: expose(2, 1) },
];
console.log(`still: |(2,-1)| ${still.toFixed(4)}`);
for (const e of exposures) {
  console.log(`rates (${e.rates.join(',')}): |(2,-1)| ${e.station.toFixed(4)}  k.r = ${2 * e.rates[0] - e.rates[1]}`);
}
const keep = exposures[1].station;
const wash = Math.max(exposures[0].station, exposures[2].station);
const selectivity = keep / Math.max(wash, 1e-9);
const faithful = Math.abs(keep - still) / Math.max(still, 1e-9);
console.log(`selectivity ${selectivity.toFixed(0)}x; the preserving exposure holds the still's station to ${(faithful * 100).toFixed(2)}%`);
const ok = selectivity > 30 && faithful < 0.02;
writeFileSync(OUT, JSON.stringify({ sA, sB, period: 1 / Math.abs(nu), still, exposures, selectivity, faithful, gates: { selectivity: selectivity > 30, faithful: faithful < 0.02 } }, null, 1));
console.log(ok ? 'all gates pass' : 'GATE FAILURE');
process.exitCode = ok ? 0 : 1;
