// Example scenes for the two line plots, so the curves point at pictures.
//
// Fig. "convex" (translated polygons in closed form): a walking hexagon family
// below the marginal drift, where the residual crosses zero once, and at the
// marginal drift, where every large index is equally near and the residual is
// flat forever.
//
// Fig. "saturation" (where the guarantee ends): a walking circle family at a
// benign drift, whose pattern is open, and near the marginal band, where the
// interval is enormous and the frame it certifies is already solid ink.
//
//   node paper/tools/exp/insets-plots.mjs

import { mkdirSync } from 'node:fs';
import { loadSolver } from '../lib/instrument.mjs';
import { view, compose } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const solver = await loadSolver('final');
const INK = '#14171b';
const SIZE = 300;

function walking({ shape, sides, spacing, offset, thickness, pan = { x: 0, y: 0 }, zoom = 1 }) {
  return {
    thickness,
    color: INK,
    dist: (p, halfT, aa) =>
      solver.ringDistance(
        { x: p.x + pan.x, y: p.y + pan.y },
        offset,
        0,
        spacing,
        0,
        shape,
        sides,
        Math.max(halfT - aa, 0),
        halfT + aa
      ),
    zoom,
  };
}

function thumb(name, layer) {
  const V = view({ width: SIZE, height: SIZE, zoom: layer.zoom, superSample: 2 });
  const rgb = compose(V, [layer]);
  writePng(new URL(`${name}.png`, FIGS).pathname, rgb, SIZE, SIZE);
  console.log(`wrote figures/${name}.png`);
}

const s = 14;

// Hexagons, edge-directed drift. The edge support factor is cos(pi/6)=0.866,
// so the marginal drift m = s has |delta| = s / 0.866.
const edge = { x: 0, y: 1 };
const below = 0.72 * s; // m < s: one crossing
const marginal = s / Math.cos(Math.PI / 6); // m = s: flat forever

thumb('inset-convex-cross', walking({
  shape: 4, sides: 6, spacing: s, thickness: 1.7,
  offset: { x: edge.x * below, y: edge.y * below },
  pan: { x: 0, y: 260 }, zoom: 0.55,
}));
thumb('inset-convex-flat', walking({
  shape: 4, sides: 6, spacing: s, thickness: 1.7,
  offset: { x: edge.x * marginal, y: edge.y * marginal },
  pan: { x: 0, y: 260 }, zoom: 0.55,
}));

// Circles: benign drift (open pattern, small interval) against near-marginal
// (the interval explodes and the field it certifies is already solid).
thumb('inset-saturation-open', walking({
  shape: 1, sides: 6, spacing: s, thickness: 1.7,
  offset: { x: 0, y: 0.35 * s },
  pan: { x: 0, y: 240 }, zoom: 0.55,
}));
thumb('inset-saturation-solid', walking({
  shape: 1, sides: 6, spacing: s, thickness: 1.7,
  offset: { x: 0, y: 0.985 * s },
  pan: { x: 0, y: 30 }, zoom: 0.62,
}));
