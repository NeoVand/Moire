// The gradient divide, and the three families that omit it.
//
// A family given by a phase function psi has member n on {psi = n s + phi}. The
// stroke wants a *Euclidean* distance, and the phase residual is not one:
//
//   d(p) = periodicDist(psi(p) - phi, s) / |grad psi(p)|.
//
// The shipped shader applies the divide for the parabola and drops it for the
// wave, the hyperbola and the spiral. Wherever |grad psi| departs from 1 the
// stroke width is then wrong by that factor: strokes pinch where the family is
// steep and bloom where it is slack. This measures the error, in stroke widths,
// over each family's own parameter range, and renders the three worst cases.
//
//   node paper/tools/exp/gradient.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { family } from '../lib/fields.mjs';
import { view, compose, tile } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const DATA = new URL('../../data/', import.meta.url);
const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(DATA, { recursive: true });
mkdirSync(FIGS, { recursive: true });

// LAYER_DEFAULTS and the Studio slider ranges, so the sweep is over settings a
// user can actually reach rather than over adversarial ones.
const CASES = [
  {
    kind: 'wave',
    label: 'Wave',
    divides: false,
    grid: () => {
      const out = [];
      for (const bend of [2, 4, 8, 16, 24, 32]) {
        for (const frequency of [0.25, 0.5, 1, 2, 3, 4]) {
          out.push({ kind: 'wave', spacing: 16, bend, frequency });
        }
      }
      return out;
    },
  },
  {
    kind: 'parabola',
    label: 'Parabola',
    divides: true,
    grid: () => {
      const out = [];
      for (const bend of [0.5, 1, 2, 4, 8, 16]) out.push({ kind: 'parabola', spacing: 16, bend });
      return out;
    },
  },
  {
    kind: 'hyperbola',
    label: 'Hyperbola',
    divides: false,
    grid: () => [{ kind: 'hyperbola', spacing: 16, phase: 8 }],
  },
  {
    kind: 'spiral',
    label: 'Spiral',
    divides: false,
    grid: () => {
      const out = [];
      for (const bend of [8, 16, 32, 64, 128]) out.push({ kind: 'spiral', spacing: 16, bend });
      return out;
    },
  },
];

// A 1400x880 frame at zoom 1 sees roughly this much world.
const HALF_W = 700;
const HALF_H = 440;
const STEP = 6;

function sweep(cfg) {
  const fam = family(cfg);
  let worst = 1;
  let sum = 0;
  let n = 0;
  let over = 0; // fraction of frame where the stroke is off by more than 10%
  for (let y = -HALF_H; y <= HALF_H; y += STEP) {
    for (let x = -HALF_W; x <= HALF_W; x += STEP) {
      const g = fam.grad({ x, y });
      if (!Number.isFinite(g) || g > 1e4) continue;
      // The shipped code reports the phase residual, so the rendered stroke is
      // wider than intended by exactly |grad psi|.
      const factor = g;
      if (factor > worst) worst = factor;
      sum += factor;
      n += 1;
      if (factor > 1.1) over += 1;
    }
  }
  return {
    ...cfg,
    meanFactor: Math.round((sum / n) * 1000) / 1000,
    worstFactor: Math.round(worst * 1000) / 1000,
    fractionOff: Math.round((over / n) * 1000) / 1000,
  };
}

const report = [];
for (const c of CASES) {
  const rows = c.grid().map(sweep);
  const worst = rows.reduce((a, b) => (b.worstFactor > a.worstFactor ? b : a));
  const meanOff = rows.reduce((a, b) => a + b.fractionOff, 0) / rows.length;
  report.push({
    family: c.label,
    dividesByGradient: c.divides,
    settings: rows.length,
    worstFactor: worst.worstFactor,
    worstSetting: Object.fromEntries(
      Object.entries(worst).filter(([k]) => ['bend', 'frequency', 'spacing', 'phase'].includes(k))
    ),
    meanFractionOff: Math.round(meanOff * 1000) / 1000,
    rows,
  });
  console.log(
    `${c.label.padEnd(11)} divides=${String(c.divides).padEnd(6)} ` +
      `worst |grad psi| = ${worst.worstFactor.toFixed(2)}  ` +
      `(${JSON.stringify(
        Object.fromEntries(
          Object.entries(worst).filter(([k]) => ['bend', 'frequency', 'phase'].includes(k))
        )
      )})  frame off >10%: ${(meanOff * 100).toFixed(0)}%`
  );
}

writeFileSync(
  new URL('gradient.json', DATA),
  JSON.stringify({ halfWidth: HALF_W, halfHeight: HALF_H, step: STEP, families: report }, null, 2)
);

// Renders: shipped versus corrected, for the three families that drop the term.
// 300 px printed at 273 DPI. The world extent is held fixed by scaling the zoom
// with the panel, so this is resolution and not a wider view.
const GPANEL = 380;
const GSCALE = GPANEL / 300;
const V = view({ width: GPANEL, height: GPANEL, zoom: 0.62 * GSCALE, superSample: 3 });
const PANELS = [
  { name: 'wave', cfg: { kind: 'wave', spacing: 16, bend: 10, frequency: 1.5, thickness: 2.4 } },
  { name: 'hyperbola', cfg: { kind: 'hyperbola', spacing: 22, phase: 10, thickness: 2.4 } },
  { name: 'spiral', cfg: { kind: 'spiral', spacing: 18, bend: 90, thickness: 2.4 } },
];

const shipped = [];
const corrected = [];
for (const p of PANELS) {
  shipped.push({
    rgb: compose(V, [{ ...p.cfg, useGrad: false }]),
    width: V.width,
    height: V.height,
  });
  corrected.push({
    rgb: compose(V, [{ ...p.cfg, useGrad: true }]),
    width: V.width,
    height: V.height,
  });
}

const both = tile([...shipped, ...corrected], 3, Math.round(10 * GSCALE));
writePng(new URL('gradient-compare.png', FIGS).pathname, both.rgb, both.width, both.height);
console.log(`\nwrote figures/gradient-compare.png (${both.width}x${both.height})`);
console.log('wrote data/gradient.json');
