// The handover quilt, and its cure. The exhibit (paper/notes/handover-quilt.json):
// two concentric-circle families of identical pitch and identical centre, one
// carrying a steep dipole field, at 1.87 pixels per member. Left: the envelope
// when the sum-or-difference choice is made from a finite difference of the
// FRACTIONAL index over one pixel with the unit unwrap — the estimator the
// shader once used for walking families, an observer with a two-pixel window,
// which aliases below two pixels per member and hands the sum character
// pockets it never earned. Right: the same envelope with the choice made from
// the closed-form gradient. Both halves are the CPU mirror of the shipped
// compositing; the left half is generated, not a resurrected shader.
//
//   node paper/tools/exp/quilt-figs.mjs

import { join } from 'node:path';
import { view, envelope, tile } from '../lib/render.mjs';
import { gradIndex } from '../lib/fields.mjs';
import { writePng } from '../lib/png.mjs';
import { FIGURES } from '../lib/instrument.mjs';

const ZOOM = 0.6234;
const V = view({ width: 640, height: 480, zoom: ZOOM, pan: { x: -285, y: 378.77 }, superSample: 1 });
const pixel = 1 / ZOOM;
const DIPOLE = '0.5 * (1 / sqrt((x - 1)^2 + y^2 + 0.0625) - 1 / sqrt((x + 1)^2 + y^2 + 0.0625))';
const ring = (extra) => ({
  kind: 'concentric',
  shape: 'circle',
  spacing: 3,
  thickness: 2,
  position: { x: -14.54, y: -4.62 },
  color: '#000000',
  ...extra,
});
const layers = [ring({ field: DIPOLE, fieldAmount: 7.47, fieldScale: 375 }), ring({})];
const opts = { taps: 36, contrast: 6, lift: 0.05 };

// The two-pixel observer: the fractional index differenced over one screen
// pixel, unit wraps rounded away — sound only while a member spans two
// pixels or more.
const fracGrad = (fam, p) => {
  const frac = (q) => {
    const i = fam.index(q);
    return i - Math.round(i);
  };
  const unwrap = (v) => v - Math.round(v);
  const f0 = frac(p);
  return {
    x: unwrap(frac({ x: p.x + pixel, y: p.y }) - f0) / pixel,
    y: unwrap(frac({ x: p.x, y: p.y + pixel }) - f0) / pixel,
  };
};
const sumWins = (a, b) => Math.hypot(a.x + b.x, a.y + b.y) < Math.hypot(a.x - b.x, a.y - b.y);
const nyquist = (p, famA, famB) => sumWins(fracGrad(famA, p), fracGrad(famB, p));
const closedForm = (p, famA, famB) => sumWins(gradIndex(famA, p), gradIndex(famB, p));

// How much of the frame the two-pixel observer hands to the sum.
let pockets = 0;
const t0 = Date.now();
const aliased = envelope(V, layers, {
  ...opts,
  decide: (p, famA, famB) => {
    const s = nyquist(p, famA, famB);
    if (s !== closedForm(p, famA, famB)) pockets += 1;
    return s;
  },
});
const clean = envelope(V, layers, { ...opts, decide: closedForm });
const strip = tile(
  [aliased, clean].map((rgb) => ({ rgb, width: V.width, height: V.height })),
  2,
  12
);
writePng(join(FIGURES, 'quilt-pair.png'), strip.rgb, strip.width, strip.height);
console.log(
  `wrote figures/quilt-pair.png (${strip.width}x${strip.height}) in ${((Date.now() - t0) / 1000).toFixed(0)}s; ` +
    `the two-pixel observer disagrees with the closed form on ${((100 * pockets) / (V.width * V.height)).toFixed(1)}% of pixels ` +
    `at ${(3 * ZOOM).toFixed(2)} px per member`
);
