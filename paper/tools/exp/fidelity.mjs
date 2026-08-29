// Does the solver ever drop ink the exact field contains?
//
// Sweeps the parameter space the Studio sliders can actually reach, samples
// pixels across the viewport, and compares each solver's stroke coverage
// against the exhaustive reference. Reports dropped ink (a hole) and invented
// ink separately, because only the first is a visible artifact at a glance and
// only the second is a false positive.
//
//   node paper/tools/exp/fidelity.mjs

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, loadAllSolvers } from '../lib/instrument.mjs';
import { referenceRing } from '../lib/reference.mjs';
import {
  RING_BUDGET,
  ringDrift,
  ringIndexWindow,
  shapeKappa,
} from '../../../src/gpu/inverseCpu.ts';

// Slider limits, from src/components/Studio.tsx.
const SPACINGS = [1, 2, 4, 6, 12, 30, 80];
const OFFSETS = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1.5, y: -0.75 },
  { x: 3, y: 1 },
  { x: 3, y: 3 },
  { x: 4, y: 4 },
];
const ROTS = [0, 0.004, 0.03, 0.2];
const ZOOMS = [4, 1, 0.3, 0.08];
const SHAPES = [
  { code: 1, sides: 6, name: 'circle' },
  { code: 2, sides: 4, name: 'square' },
  { code: 3, sides: 3, name: 'triangle' },
  { code: 4, sides: 6, name: 'hexagon' },
  { code: 4, sides: 5, name: 'pentagon' },
];
const THICKNESS = 2;
const W = 1200;
const H = 800;
const SAMPLES = 240;
// Past this the exhaustive reference stops being affordable, and the exact field
// is saturated anyway. Counted and reported, never silently dropped.
const REF_EVAL_CAP = 6000;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-9)));
  return t * t * (3 - 2 * t);
}

/** Deterministic low-discrepancy pixel sampling, so runs are comparable. */
function* samplePoints(zoom, count) {
  const gx = 0.7548776662466927;
  const gy = 0.5698402909980532;
  for (let i = 1; i <= count; i++) {
    const u = (i * gx) % 1;
    const v = (i * gy) % 1;
    yield { x: (u - 0.5) * (W / zoom), y: (v - 0.5) * (H / zoom) };
  }
}

const solvers = await loadAllSolvers();
const rows = [];
let skipped = 0;

for (const shape of SHAPES) {
  for (const spacing of SPACINGS) {
    for (const offset of OFFSETS) {
      for (const theta of ROTS) {
        for (const zoom of ZOOMS) {
          const hasOff = offset.x !== 0 || offset.y !== 0;
          if (!hasOff && theta === 0) continue;
          const pixel = 1 / Math.max(zoom, 0.08);
          const halfT = Math.max(THICKNESS * 0.5, pixel * 1.15);
          const aa = pixel * 0.7;
          const accept = Math.max(halfT - aa, 0);
          const reject = halfT + aa;
          const guard = Math.max(reject, spacing * 0.75);
          const drift = ringDrift(offset, shape.code, shape.sides);

          // Screen before sampling: the exhaustive reference costs one evaluation
          // per index it has to walk, and in the drift >= spacing band that is
          // unbounded. Those settings are counted, not measured.
          const rMax = Math.hypot(W / 2, H / 2) / zoom;
          const refCost =
            spacing - drift > 1e-6 ? (rMax + guard) / (spacing - drift) : Number.POSITIVE_INFINITY;
          if (refCost >= REF_EVAL_CAP) {
            skipped += 1;
            continue;
          }

          const tally = {};
          for (const name of Object.keys(solvers)) {
            tally[name] = { dropped: 0, invented: 0, sumAbs: 0, worst: 0, inWindow: 0, inDropped: 0 };
          }
          const kappa = shapeKappa(shape.code, shape.sides);
          const offLen = Math.hypot(offset.x, offset.y);
          let inked = 0;
          let refEvals = 0;
          let inEnvelope = 0;
          let n = 0;

          for (const p of samplePoints(zoom, SAMPLES)) {
            const dRef = referenceRing(
              p,
              offset,
              theta,
              spacing,
              0,
              shape.code,
              shape.sides,
              guard
            );
            refEvals += referenceRing.lastEvals;
            const aRef = 1 - smoothstep(halfT - aa, halfT + aa, dRef);
            if (aRef > 0.5) inked += 1;
            n += 1;

            // A pixel is inside the exactness envelope when the proven window fits
            // the budget, so the scan can walk every index in it at stride 1.
            const win = ringIndexWindow(
              Math.hypot(p.x, p.y),
              offLen,
              drift,
              spacing,
              0,
              kappa,
              guard
            );
            const fits = win.hi - win.lo + 1 <= RING_BUDGET;
            if (fits) inEnvelope += 1;

            for (const [name, solver] of Object.entries(solvers)) {
              const d = solver.ringDistance(
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
              const a = 1 - smoothstep(halfT - aa, halfT + aa, d);
              const delta = a - aRef;
              const t = tally[name];
              t.sumAbs += Math.abs(delta);
              if (Math.abs(delta) > t.worst) t.worst = Math.abs(delta);
              if (delta < -0.5) t.dropped += 1;
              if (delta > 0.5) t.invented += 1;
              if (fits) {
                t.inWindow += 1;
                if (delta < -0.5) t.inDropped += 1;
              }
            }
          }

          rows.push({
            shape: shape.name,
            spacing,
            offset: `${offset.x},${offset.y}`,
            offLen: Math.round(Math.hypot(offset.x, offset.y) * 1000) / 1000,
            drift: Math.round(drift * 1000) / 1000,
            theta,
            zoom,
            inkFraction: Math.round((inked / n) * 1000) / 1000,
            refEvalsPerPixel: Math.round(refEvals / n),
            envelopeFraction: Math.round((inEnvelope / n) * 1000) / 1000,
            solvers: Object.fromEntries(
              Object.entries(tally).map(([name, t]) => [
                name,
                {
                  dropped: Math.round((t.dropped / n) * 10000) / 10000,
                  invented: Math.round((t.invented / n) * 10000) / 10000,
                  meanAbs: Math.round((t.sumAbs / n) * 10000) / 10000,
                  droppedInEnvelope: t.inWindow
                    ? Math.round((t.inDropped / t.inWindow) * 10000) / 10000
                    : null,
                },
              ])
            ),
          });
        }
      }
    }
  }
}

const names = Object.keys(solvers);
// Legible settings are the ones a user would call a pattern. Once the exact field
// is more than 70% ink there is no pattern left to protect: the honest render of
// the truth is a filled rectangle.
const LEGIBLE = 0.7;
const summary = {};
for (const name of names) {
  const dropped = rows.map((r) => r.solvers[name].dropped);
  const invented = rows.map((r) => r.solvers[name].invented);
  const bad = rows.filter((r) => r.solvers[name].dropped > 0.002);
  const legible = rows.filter((r) => r.inkFraction < LEGIBLE);
  const legibleBad = legible.filter((r) => r.solvers[name].dropped > 0.002);
  const envelope = rows.filter((r) => r.solvers[name].droppedInEnvelope !== null);
  const envelopeBad = envelope.filter((r) => r.solvers[name].droppedInEnvelope > 0);
  summary[name] = {
    settings: rows.length,
    settingsWithHoles: bad.length,
    worstDropped: Math.max(...dropped),
    meanDropped: Math.round((dropped.reduce((a, b) => a + b, 0) / rows.length) * 100000) / 100000,
    worstInvented: Math.max(...invented),
    legibleSettings: legible.length,
    legibleWithHoles: legibleBad.length,
    legibleWorstDropped: legible.length ? Math.max(...legible.map((r) => r.solvers[name].dropped)) : 0,
    envelopeSettings: envelope.length,
    envelopeWithHoles: envelopeBad.length,
    envelopeWorstDropped: envelope.length
      ? Math.max(...envelope.map((r) => r.solvers[name].droppedInEnvelope))
      : 0,
    worst5: bad
      .sort((a, b) => b.solvers[name].dropped - a.solvers[name].dropped)
      .slice(0, 5)
      .map((r) => ({
        setting: `${r.shape} s=${r.spacing} off=(${r.offset}) rot=${r.theta} zoom=${r.zoom}`,
        dropped: r.solvers[name].dropped,
        inEnvelope: r.solvers[name].droppedInEnvelope,
        ink: r.inkFraction,
        window: r.refEvalsPerPixel,
      })),
    worstLegible: legibleBad
      .sort((a, b) => b.solvers[name].dropped - a.solvers[name].dropped)
      .slice(0, 5)
      .map((r) => ({
        setting: `${r.shape} s=${r.spacing} off=(${r.offset}) rot=${r.theta} zoom=${r.zoom}`,
        dropped: r.solvers[name].dropped,
        inEnvelope: r.solvers[name].droppedInEnvelope,
        ink: r.inkFraction,
        window: r.refEvalsPerPixel,
      })),
  };
}

writeFileSync(
  join(DATA, 'fidelity.json'),
  `${JSON.stringify({ config: { W, H, SAMPLES, THICKNESS, REF_EVAL_CAP }, skippedOverCap: skipped, summary, rows }, null, 2)}\n`
);

console.log(`settings compared: ${rows.length}   over reference cap (saturated): ${skipped}\n`);
for (const name of names) {
  const s = summary[name];
  console.log(
    `${name.padEnd(9)} all: holes in ${String(s.settingsWithHoles).padStart(3)}/${s.settings}, worst ${(s.worstDropped * 100).toFixed(1)}%   ` +
      `| legible: ${String(s.legibleWithHoles).padStart(3)}/${s.legibleSettings}, worst ${(s.legibleWorstDropped * 100).toFixed(1)}%   ` +
      `| in envelope: ${String(s.envelopeWithHoles).padStart(3)}/${s.envelopeSettings}, worst ${(s.envelopeWorstDropped * 100).toFixed(1)}%   ` +
      `| invented ${(s.worstInvented * 100).toFixed(1)}%`
  );
  for (const w of s.worstLegible) {
    console.log(
      `            legible ${(w.dropped * 100).toFixed(1)}%  ${w.setting}  [ink ${w.ink}, window ~${w.window}, in-envelope ${w.inEnvelope}]`
    );
  }
}
console.log(`\nwrote ${join(DATA, 'fidelity.json')}`);
