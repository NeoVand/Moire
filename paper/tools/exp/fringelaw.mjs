// The fringe law, in five panels: two families, their superposition, the unit level
// sets of the index difference laid over that superposition, and the heterodyne
// ratio that says where a fringe can exist at all.
//
// The pair is deliberately one whose visibility varies over the frame: two circle
// families about different centres. Their index gradients are the two radial
// directions, which agree far from both centres and disagree between them, so broad
// fringes form outside and a rosette forms inside -- and the ratio map says which
// is which before anything is drawn. The fringes themselves are the hyperbolae
// confocal with the two centres, since D is a difference of two distances.
//
//   node paper/tools/exp/fringelaw.mjs

import { mkdirSync } from 'node:fs';
import { family } from '../lib/fields.mjs';
import { view, compose, envelope, fieldImage, tile, overlayLevelSets } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const S = 10;
const INK = '#15181c';
// The frame is 300 world units wide either way; the panel is 420 px so the figure
// survives print.
// Thickness is set so the stroke floor lands where it would at zoom 1, and so that
// the two strokes together span about a third of a period: by Eq. (tent) that is
// what makes the fringe a broad band rather than a narrow line on a saturated
// field, which is the same trade the theorem's saturation paragraph describes.
const THICK = 3.6;
const V = view({ width: 420, height: 420, zoom: 1.4, superSample: 3 });

const CFG_CIRCLES = { kind: 'concentric', shape: 'circle', spacing: S, position: { x: -17, y: 0 } };
const CFG_LINES = {
  kind: 'concentric',
  shape: 'circle',
  spacing: S * 1.04,
  position: { x: 17, y: 0 },
};

const famC = family(CFG_CIRCLES);
const famL = family(CFG_LINES);

const circles = compose(V, [{ ...CFG_CIRCLES, thickness: THICK, color: INK }]);
const lines = compose(V, [{ ...CFG_LINES, thickness: THICK, color: INK }]);
const both = compose(V, [
  { ...CFG_CIRCLES, thickness: THICK, color: INK },
  { ...CFG_LINES, thickness: THICK, color: INK },
]);

/** D = phi1 - phi2, the index difference. Its unit level sets are the fringes. */
const D = (p) => famC.index(p) - famL.index(p);

/** Numerical gradient of an index field, as a vector. */
function gradOf(fn, p, h = 0.3) {
  return {
    x: (fn({ x: p.x + h, y: p.y }) - fn({ x: p.x - h, y: p.y })) / (2 * h),
    y: (fn({ x: p.x, y: p.y + h }) - fn({ x: p.x, y: p.y - h })) / (2 * h),
  };
}

/** Heterodyne ratio r = |grad D| / |mean grad|. Small means a broad fringe. */
const ratio = (p) => {
  const g1 = gradOf((q) => famC.index(q), p);
  const g2 = gradOf((q) => famL.index(q), p);
  const dx = g1.x - g2.x;
  const dy = g1.y - g2.y;
  const mx = 0.5 * (g1.x + g2.x);
  const my = 0.5 * (g1.y + g2.y);
  const mean = Math.hypot(mx, my);
  return mean < 1e-9 ? 4 : Math.hypot(dx, dy) / mean;
};

// The theorem is about the mean ink over one period of the phase the two families
// share, so we show exactly that: the tool's envelope view, which averages over
// that phase and not over the image. What survives is the fringe field. The
// predicted unit level sets of D go over it, computed from the two index fields
// alone and never from the picture, and drawn only where the theory claims a
// fringe exists -- outside that region D still has level sets, but they are closer
// together than the carrier and there is nothing for them to describe.
const fringeField = envelope(V, [
  { ...CFG_CIRCLES, thickness: THICK, color: INK },
  { ...CFG_LINES, thickness: THICK, color: INK },
], { contrast: 2.2 });
const withLevels = overlayLevelSets(fringeField, V, D, {
  color: [214, 20, 84],
  width: 2.4,
  opacity: 1,
  mask: (p) => ratio(p) <= 0.25,
});

const ratioPanel = fieldImage(V, (p) => Math.min(ratio(p), 0.5), {
  name: 'viridis',
  lo: 0,
  hi: 0.5,
});

const strip = tile(
  [
    { rgb: circles, width: V.width, height: V.height },
    { rgb: lines, width: V.width, height: V.height },
    { rgb: both, width: V.width, height: V.height },
    { rgb: withLevels, width: V.width, height: V.height },
    { rgb: ratioPanel.rgb, width: V.width, height: V.height },
  ],
  5,
  9
);
writePng(new URL('fringe-law.png', FIGS).pathname, strip.rgb, strip.width, strip.height);
console.log(`wrote figures/fringe-law.png (${strip.width}x${strip.height})`);
console.log(`heterodyne ratio over frame: min ${ratioPanel.min.toFixed(3)} max ${ratioPanel.max.toFixed(3)}`);
