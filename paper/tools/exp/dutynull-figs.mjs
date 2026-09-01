// The duty-null figure. Two data files for pgfplots, straight from
// dutynull.json (no second measurement): the measured station amplitudes on
// the duty grid, and the hard-ink law |sin(q pi d) / q pi| times the fine
// stroke's first harmonic, densely sampled so its cusps at the nulls survive.
// Plus a render triple of the 2:1 pair at coarse duty 0.35, 0.5 and 0.65,
// shown as the station's own envelope: by Law II the average over one period
// at rates (1,2) is exactly E[I | (2,-1)], the long exposure that keeps the
// station and nothing faster, expanded sixfold about its mean as the envelope
// view would — present, extinguished, present. A raw render carries the same
// station at four percent modulation, which no page can show. Carriers at the
// golden slope. Run dutynull.mjs first.
//
//   node paper/tools/exp/dutynull-figs.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { view, compose, tile } from '../lib/render.mjs';
import { GOLDEN_CARRIER } from '../lib/fields.mjs';
import { writePng } from '../lib/png.mjs';
import { FIGURES, DATA } from '../lib/instrument.mjs';

const d = JSON.parse(readFileSync(join(DATA, 'dutynull.json'), 'utf8'));
if (d.two.rows.length !== d.three.rows.length) throw new Error('the two sweeps share a duty grid');
const lines = ['duty,two,three'];
d.two.rows.forEach((r, i) => {
  const t = d.three.rows[i];
  if (Math.abs(t.duty - r.duty) > 1e-9) throw new Error('duty grids differ');
  lines.push([r.duty, r.station, t.station].map((v) => v.toFixed(6)).join(','));
});
writeFileSync(join(DATA, 'dutynull-curve.csv'), lines.join('\n') + '\n');

const sB = 8;
const tB = 2.4;
const fine = Math.abs(Math.sin((Math.PI * tB) / sB) / Math.PI);
const law = ['duty,two,three'];
for (let i = 0; i <= 240; i += 1) {
  const duty = 0.18 + (0.64 * i) / 240;
  const at = (q) => Math.abs(Math.sin(q * Math.PI * duty) / (q * Math.PI)) * fine;
  law.push([duty, at(2), at(3)].map((v) => v.toFixed(6)).join(','));
}
writeFileSync(join(DATA, 'dutynull-law.csv'), law.join('\n') + '\n');
console.log(`wrote data/dutynull-curve.csv (${d.two.rows.length} duties) and data/dutynull-law.csv`);

const V = view({ width: 400, height: 300, zoom: 0.5, superSample: 2 });
const N = 48;
const GAIN = 6;
const sA = 16.4;
const stationEnvelope = (duty) => {
  const acc = new Float64Array(V.width * V.height * 3);
  for (let f = 0; f < N; f += 1) {
    const t = f / N;
    const rgb = compose(V, [
      { kind: 'parallel', angle: GOLDEN_CARRIER, spacing: sA, thickness: duty * sA, phase: sA * t, color: '#000000' },
      { kind: 'parallel', angle: GOLDEN_CARRIER, spacing: sB, thickness: tB, phase: 2 * sB * t, color: '#000000' },
    ]);
    for (let i = 0; i < acc.length; i += 1) acc[i] += rgb[i] / N;
  }
  let mean = 0;
  for (let i = 0; i < acc.length; i += 1) mean += acc[i];
  mean /= acc.length;
  return Uint8Array.from(acc, (v) => Math.round(Math.min(255, Math.max(0, mean + (v - mean) * GAIN))));
};
const panels = [0.35, 0.5, 0.65].map((duty) => ({ rgb: stationEnvelope(duty), width: V.width, height: V.height }));
const strip = tile(panels, 3, 10);
writePng(join(FIGURES, 'dutynull-triple.png'), strip.rgb, strip.width, strip.height);
console.log(`wrote figures/dutynull-triple.png (${strip.width}x${strip.height})`);
