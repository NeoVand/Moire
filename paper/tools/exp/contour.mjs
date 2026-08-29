// Moire as a contouring primitive.
//
// The fringe law says the light fringes of a superposition are {phi1 - phi2 in Z}.
// So to draw the level sets of a scalar field f at interval c, take any carrier
// family with phase psi and pair it with
//
//   psi' = psi - a*s*f,     a = 1/c,
//
// which gives D = phi - phi' = a f. The fringes are then {f = n c} exactly: the
// contours of f, at interval c, rendered by one distance query per family per
// pixel, with no marching squares, no contour extraction, no polylines, and the
// same antialiasing the strokes already had.
//
// The fields are not restated here. Each is compiled from the text of a Studio
// preset by src/fields/expr.ts and evaluated by src/fields/evalExpr.ts -- the
// same compiler the shader's code generator reads and the same dual-number
// evaluator the editor's live preview runs -- so every panel below is a state of
// the shipping tool: a Parallel layer, and a second Parallel layer with an
// expression in its Field editor. `a` is the Amount slider, `scale` the Extent.
// The gradient the estimator walks along is the one the evaluator returns, not a
// finite difference of it.
//
// Test. For each of the six presets, locate the measured light fringes and report
// their distance, in pixels, to the true level sets of f.
//
//   node paper/tools/exp/contour.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fieldProgram, sampleField } from '../lib/fields.mjs';
import { view, compose, envelope, fieldImage, tile, overlayLevelSets } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const DATA = new URL('../../data/', import.meta.url);
const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(DATA, { recursive: true });
mkdirSync(FIGS, { recursive: true });

/** Carrier pitch, world units. Deliberately near the pixel limit. */
const S = 5;
const INK = '#12161c';
const T = 1.4;

const CARRIER = { kind: 'parallel', angle: 0, spacing: S, phase: 0, thickness: T, color: INK };

/**
 * One preset of the Studio's field editor, encoded into a carrier's twin.
 * `amount` is the Amount slider (fringes per unit of f) and `scale` the Extent.
 */
function encoded(name, label, amount, scale) {
  const program = fieldProgram(name);
  return {
    name,
    label,
    interval: 1 / amount,
    c: 1 / amount,
    amount,
    scale,
    f: (p) => sampleField(program, p, scale).f,
    grad: (p) => {
      const w = sampleField(program, p, scale);
      return { x: w.gx, y: w.gy };
    },
    layers: [CARRIER, { ...CARRIER, field: name, fieldAmount: amount, fieldScale: scale }],
  };
}

// The control: two parallel families at slightly different pitch, which is the
// oldest moire there is. Its index difference is x*(1/s - 1/s') exactly, so the
// fringes are straight lines at a spacing we know in advance. Any displacement
// measured here is bias in the estimator, not error in the method, and it sets
// the noise floor for the six fields below.
const DETUNE = 5.5556;
const CONTROL = {
  name: 'control',
  label: 'two pitches',
  c: 1 / (1 / S - 1 / DETUNE),
  f: (p) => p.x,
  grad: () => ({ x: 1, y: 0 }),
  layers: [CARRIER, { ...CARRIER, spacing: DETUNE }],
};

// Extent and Amount per field, chosen so the contours are legible over the frame
// and the finest on-screen interval is reported alongside. The dipole is left
// deliberately over its limit: its poles are where the method visibly fails.
const FIELDS = [
  encoded('saddle', 'saddle', 3, 200),
  encoded('dipole', 'dipole potential', 8, 210),
  encoded('bumps', 'three Gaussians', 3, 220),
  encoded('swirl', 'four vortices', 1.2, 200),
  encoded('ripple', 'radial ripple', 2.4, 400),
  encoded('terrain', 'band-limited noise', 2.2, 320),
];

const V = view({ width: 620, height: 620, zoom: 1, superSample: 3 });

function measure(spec, v = V) {
  const rgb = compose(v, spec.layers);

  const W = v.width;
  const H = v.height;
  const lum = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = rgb[i * 3];

  // Both families run along y at pitches near S, so we average along x only:
  // enough to erase both carriers, with no smearing across the fringe we are
  // trying to locate. A box of one period would leave a residual ripple from the
  // *other* family, whose pitch differs; a Gaussian kills both.
  const sigma = 0.8 * S;
  const rad = Math.ceil(3 * sigma);
  const kern = [];
  for (let d = -rad; d <= rad; d++) kern.push(Math.exp((-d * d) / (2 * sigma * sigma)));
  const blur = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      let wsum = 0;
      for (let d = -rad; d <= rad; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= W) continue;
        const w = kern[d + rad];
        sum += lum[y * W + xx] * w;
        wsum += w;
      }
      blur[y * W + x] = sum / wsum;
    }
  }

  const worldOf = (x, y) => ({ x: x + 0.5 - W / 2, y: H / 2 - (y + 0.5) });
  const deviceOf = (p) => ({ x: p.x - 0.5 + W / 2, y: H / 2 - p.y - 0.5 });
  const sample = (fx, fy) => {
    if (fx < 0 || fy < 0 || fx > W - 2 || fy > H - 2) return NaN;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    return (
      blur[y0 * W + x0] * (1 - tx) * (1 - ty) +
      blur[y0 * W + x0 + 1] * tx * (1 - ty) +
      blur[(y0 + 1) * W + x0] * (1 - tx) * ty +
      blur[(y0 + 1) * W + x0 + 1] * tx * ty
    );
  };

  // Analytic, since every field ships its own gradient for the stroke-width
  // divide. Nothing here is a finite difference.
  const gradF = (p) => {
    const g = spec.grad(p);
    return { x: g.x, y: g.y, mag: Math.hypot(g.x, g.y) };
  };

  /** Walk to the nearest true level set {f = n c} by Newton steps along the normal. */
  const snapToContour = (p0) => {
    let p = { ...p0 };
    for (let it = 0; it < 24; it++) {
      const g = gradF(p);
      if (!(g.mag > 1e-9)) return null;
      const v0 = spec.f(p) / spec.c;
      const resid = (v0 - Math.round(v0)) * spec.c;
      const stepLen = resid / g.mag;
      if (Math.abs(stepLen) < 1e-5) return p;
      p = { x: p.x - (stepLen * g.x) / g.mag, y: p.y - (stepLen * g.y) / g.mag };
      if (Math.abs(p.x) > W || Math.abs(p.y) > H) return null;
    }
    return Math.abs(spec.f(p) / spec.c - Math.round(spec.f(p) / spec.c)) < 1e-3 ? p : null;
  };

  // At a point on the true contour, find the sub-pixel argmax of the fringe along
  // the contour normal. The displacement of that maximum from zero is the error.
  const offsets = [];
  const step = 0.25;
  let considered = 0;
  let resolved = 0;
  for (let y = 14; y < H - 14; y += 5) {
    for (let x = 14; x < W - 14; x += 5) {
      const q = snapToContour(worldOf(x, y));
      if (!q) continue;
      const g = gradF(q);
      if (!(g.mag > 1e-9)) continue;
      considered += 1;
      // A fringe narrower than a few carrier periods has no carrier left to beat
      // against: it is below the sampling limit of the pair, so we do not claim it.
      const fringeGap = spec.c / g.mag;
      if (fringeGap < 3 * S) continue;
      resolved += 1;
      // Skip where the fringe runs along the carrier: the x-average then removes
      // the fringe too, and there is nothing to locate.
      const nx = g.x / g.mag;
      if (Math.abs(nx) < 0.25) continue;
      const d = deviceOf(q);
      if (d.x < 6 || d.y < 6 || d.x > W - 7 || d.y > H - 7) continue;
      const ndx = nx;
      const ndy = -g.y / g.mag;

      let bestT = 0;
      let bestV = -Infinity;
      // Keep the scan short: over a long chord the fringe curves, which biases
      // the parabola fit and measures our own scan, not the render.
      const span = Math.min(0.3 * fringeGap, 3 * S);
      for (let t = -span; t <= span; t += step) {
        const v0 = sample(d.x + ndx * t, d.y + ndy * t);
        if (Number.isFinite(v0) && v0 > bestV) {
          bestV = v0;
          bestT = t;
        }
      }
      if (!Number.isFinite(bestV) || Math.abs(bestT) >= span - step) continue;
      const vm = sample(d.x + ndx * (bestT - step), d.y + ndy * (bestT - step));
      const vp = sample(d.x + ndx * (bestT + step), d.y + ndy * (bestT + step));
      const denom = vm - 2 * bestV + vp;
      const sub = Math.abs(denom) > 1e-9 ? bestT + (step * (vm - vp)) / (2 * denom) : bestT;
      if (!Number.isFinite(sub)) continue;
      offsets.push(Math.abs(sub));
    }
  }

  offsets.sort((a, b) => a - b);
  const mean = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : NaN;

  // Finest on-screen contour interval: fringe spacing where |grad f| is largest.
  let steepest = 0;
  for (let y = 8; y < H - 8; y += 3) {
    for (let x = 8; x < W - 8; x += 3) {
      steepest = Math.max(steepest, gradF(worldOf(x, y)).mag);
    }
  }

  return {
    rgb,
    stats: {
      name: spec.name,
      label: spec.label,
      field: spec.name,
      amount: spec.amount ?? null,
      extent: spec.scale ?? null,
      interval: Math.round(spec.c * 1e4) / 1e4,
      carrierPitch: S,
      probes: offsets.length,
      resolvedFrac: Math.round((resolved / Math.max(considered, 1)) * 1000) / 1000,
      meanOffsetPx: Math.round(mean * 1e4) / 1e4,
      p95OffsetPx: Math.round(offsets[Math.floor(offsets.length * 0.95)] * 1e4) / 1e4,
      maxOffsetPx: Math.round(offsets[offsets.length - 1] * 1e4) / 1e4,
      finestIntervalPx: Math.round((spec.c / Math.max(steepest, 1e-9)) * 100) / 100,
    },
  };
}

const report = (s) =>
  console.log(
    `${s.name.padEnd(9)} probes ${String(s.probes).padStart(5)}   ` +
      `resolved ${(s.resolvedFrac * 100).toFixed(0).padStart(3)}%   ` +
      `peak vs true contour: mean ${s.meanOffsetPx.toFixed(3)}px  ` +
      `p95 ${s.p95OffsetPx.toFixed(3)}px  max ${s.maxOffsetPx.toFixed(3)}px   ` +
      `finest gap ${s.finestIntervalPx}px`
  );

const control = measure(CONTROL).stats;
control.fringeSpacingPx = Math.round(CONTROL.c * 100) / 100;
control.detune = DETUNE;
report(control);
console.log(
  `  ^ estimator noise floor: two pitches ${S} and ${DETUNE}, fringes ` +
    `${control.fringeSpacingPx}px apart and straight\n`
);

const results = [];
const panels = [];
for (const spec of FIELDS) {
  const { rgb, stats } = measure(spec);
  report(stats);
  results.push(stats);

  panels.push({ rgb, width: V.width, height: V.height });
  panels.push(fieldImage(V, (p) => spec.f(p), { name: 'viridis' }));
}

writeFileSync(
  new URL('contour.json', DATA),
  JSON.stringify({ carrierPitch: S, control, fields: results }, null, 2)
);

// Figure: for each shipped field, the moire and the field it encodes.
const N = FIELDS.length;
const grid = tile(
  [...Array(N).keys()].map((i) => panels[2 * i]).concat([...Array(N).keys()].map((i) => panels[2 * i + 1])),
  N,
  9
);
writePng(new URL('contour-fields.png', FIGS).pathname, grid.rgb, grid.width, grid.height);
console.log(`\nwrote figures/contour-fields.png (${grid.width}x${grid.height})`);

// Verification figure. A coarse interval so the fringes are wide enough to read
// on paper: (a) the render, (b) the tool's envelope view of the same state, and
// (c) the render again with the true level sets of f laid over it. The curves are
// computed from f alone and drawn on an image that never saw them.
{
  const spec = encoded('saddle', 'saddle', 0.1, 50);
  const PV = view({ width: 760, height: 760, zoom: 1, superSample: 3 });
  const bare = compose(PV, spec.layers);
  const env = envelope(PV, spec.layers, { radius: 14, contrast: 3.1 });
  const withCurves = overlayLevelSets(bare, PV, (p) => spec.f(p) / spec.c, {
    color: [226, 32, 92],
    width: 1.9,
    opacity: 1,
  });
  const proof = tile(
    [
      { rgb: bare, width: PV.width, height: PV.height },
      { rgb: env, width: PV.width, height: PV.height },
      { rgb: withCurves, width: PV.width, height: PV.height },
    ],
    3,
    10
  );
  writePng(new URL('contour-proof.png', FIGS).pathname, proof.rgb, proof.width, proof.height);
  console.log(`wrote figures/contour-proof.png (${proof.width}x${proof.height})`);
}

console.log('wrote data/contour.json');
