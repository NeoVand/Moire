// The ear experiment's figures, as CSV for pgfplots: the octave null under
// four ears for hard and for softened pulses (data/ear-octave.csv), and the
// beat of beats under each observer against a first-order beat
// (data/ear-ternary.csv). Reads data/ear.json, which ear.mjs writes and
// gates; draws nothing itself, so the paper's plots are the data and not a
// picture of it. Run: node paper/tools/exp/ear-figs.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = new URL('../../data/', import.meta.url);
const ear = JSON.parse(readFileSync(new URL('ear.json', DATA), 'utf8'));

// One row per duty: the line at the beat frequency for each observer, hard
// and soft. Zero lines are floored at 1e-9 so a log axis can show them.
const floor = (v) => Math.max(v, 1e-9);
const observers = ['linear', 'square-law', 'cubic', 'square, pool, square'];
const cols = ['duty'];
for (const kind of ['hard', 'soft']) for (const o of observers) cols.push(`${kind}_${o.replace(/[^a-z]/g, '')}`);
const rows = ear.octave.duties.map((d, i) => {
  const row = [d];
  for (const kind of ['hard', 'soft']) {
    for (const o of observers) {
      const series = ear.octave[kind][o];
      row.push(series ? floor(series[i]) : 1e-9);
    }
  }
  return row.join(',');
});
writeFileSync(new URL('ear-octave.csv', DATA), [cols.join(','), ...rows].join('\n') + '\n');

// The beat of beats: each observer's 3 Hz line as a fraction of a
// first-order beat, plus the printed (multiplied) trio under a linear ear.
const b = ear.beatsOfBeats;
const tern = [
  ['square-law', b.square / b.firstOrder],
  ['cubic', b.cubic / b.firstOrder],
  ['square pool square', b.cascade / b.firstOrder],
  ['printed linear', ear.printed.ternary / ear.printed.firstOrder],
].map(([name, v], i) => `${i},${name},${floor(v)}`);
writeFileSync(new URL('ear-ternary.csv', DATA), ['index,observer,fraction', ...tern].join('\n') + '\n');
console.log(`ear-figs: ${rows.length} duties x ${observers.length} observers, ${tern.length} ternary rows`);
