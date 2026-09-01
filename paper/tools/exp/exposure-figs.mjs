// The exposure figure: the 16.4:8 pair still, then its long exposures at rates
// (1,1), (1,2) and (2,1) — the station (2,-1) present, washed, kept, washed.
// Each exposure is the plain mean of 48 frames of the shipped compositing with
// the two phases advanced at the stated rates over one period; the exposures
// are shown with their contrast expanded sixfold about their own mean, as the
// envelope view would, and the caption says so. Carriers at the golden slope.
//
//   node paper/tools/exp/exposure-figs.mjs

import { join } from 'node:path';
import { view, compose, tile } from '../lib/render.mjs';
import { GOLDEN_CARRIER } from '../lib/fields.mjs';
import { writePng } from '../lib/png.mjs';
import { FIGURES } from '../lib/instrument.mjs';

const V = view({ width: 400, height: 300, zoom: 0.5, superSample: 2 });
const N = 48;
const sA = 16.4;
const sB = 8;
const GAIN = 6;

const frame = (t, rA, rB) =>
  compose(V, [
    { kind: 'parallel', angle: GOLDEN_CARRIER, spacing: sA, thickness: 3, phase: rA * sA * t, color: '#000000' },
    { kind: 'parallel', angle: GOLDEN_CARRIER, spacing: sB, thickness: 2.4, phase: rB * sB * t, color: '#000000' },
  ]);

const expose = (rA, rB) => {
  const acc = new Float64Array(V.width * V.height * 3);
  for (let f = 0; f < N; f += 1) {
    const rgb = frame(f / N, rA, rB);
    for (let i = 0; i < acc.length; i += 1) acc[i] += rgb[i] / N;
  }
  let mean = 0;
  for (let i = 0; i < acc.length; i += 1) mean += acc[i];
  mean /= acc.length;
  return Uint8Array.from(acc, (v) => Math.round(Math.min(255, Math.max(0, mean + (v - mean) * GAIN))));
};

const panels = [frame(0, 0, 0), expose(1, 1), expose(1, 2), expose(2, 1)].map((rgb) => ({
  rgb,
  width: V.width,
  height: V.height,
}));
const strip = tile(panels, 4, 10);
writePng(join(FIGURES, 'exposure-quad.png'), strip.rgb, strip.width, strip.height);
console.log(`wrote figures/exposure-quad.png (${strip.width}x${strip.height})`);
