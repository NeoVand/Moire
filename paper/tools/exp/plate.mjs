// The thirteen families, each drawn alone, then each superposed with a slightly
// perturbed copy of itself so its fringe system is visible. This is the catalog
// plate: it is the only figure in the paper that shows what a layer *is* rather
// than what two of them do.
//
// One PNG per family, each a vertical pair (alone above, beating below), so the
// document can set the grid and the labels in type rather than in pixels.
//
//   node paper/tools/exp/plate.mjs

import { mkdirSync } from 'node:fs';
import { view, compose, tile } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const INK = '#15181c';
// 500 world units across at 720 px, printed at ~1.35 in: 533 dpi, and 2.2 device
// pixels of stroke. The world extent is twice what a screen-sized view would show
// on purpose. A beat is only visible if several of its periods fit in the frame,
// and at 250 units most of these pairs had room for one and a half. Doubling the
// extent at doubled resolution keeps the printed stroke weight and the printed
// pitch identical while putting twice as many members, and twice as many fringes,
// inside each panel.
const SIDE = 720;
const WORLD = 500;
const V = view({ width: SIDE, height: SIDE, zoom: SIDE / WORLD, superSample: 3 });
const THICK = 1.5;

/**
 * The thirteen. `turn` is the rotation, in degrees, given to the second copy in
 * the superposition row; families whose fringes come from a pitch difference
 * instead get `detune`, a multiplier on spacing.
 *
 * Pitches are unchanged from the screen-sized view, so the wider frame simply
 * shows more members. The four shape parameters that are not lengths -- wave
 * frequency, parabola bend, the radial hole and the hyperbola's innermost level --
 * are rescaled with the frame instead, so each family keeps its silhouette.
 */
const FAMILIES = [
  { slug: 'parallel', label: 'parallel', turn: 4, cfg: { kind: 'parallel', spacing: 9, angle: Math.PI / 2 } },
  { slug: 'radial', label: 'radial', turn: 5, cfg: { kind: 'radial', lineCount: 24, spacing: 1, phase: 40 } },
  { slug: 'circles', label: 'circles', detune: 1.06, cfg: { kind: 'concentric', shape: 'circle', spacing: 10 } },
  { slug: 'squares', label: 'squares', detune: 1.06, cfg: { kind: 'concentric', shape: 'square', spacing: 10 } },
  { slug: 'triangles', label: 'triangles', detune: 1.06, cfg: { kind: 'concentric', shape: 'triangle', spacing: 10 } },
  { slug: 'hexagons', label: 'hexagons', detune: 1.06, cfg: { kind: 'concentric', shape: 'hexagon', spacing: 10 } },
  { slug: 'grid-square', label: 'square lattice', turn: 5, cfg: { kind: 'lattice', lattice: 'square', spacing: 20 } },
  { slug: 'grid-hex', label: 'hex lattice', turn: 5, cfg: { kind: 'lattice', lattice: 'hex', spacing: 14 } },
  { slug: 'grid-triangle', label: 'triangle lattice', turn: 5, cfg: { kind: 'lattice', lattice: 'triangle', spacing: 22 } },
  { slug: 'wave', label: 'wave', turn: 3, cfg: { kind: 'wave', spacing: 11, bend: 10, frequency: 0.7 } },
  { slug: 'parabola', label: 'parabola', turn: 3, cfg: { kind: 'parabola', spacing: 12, bend: 0.3 } },
  { slug: 'hyperbola', label: 'hyperbola', turn: 4, cfg: { kind: 'hyperbola', spacing: 13, phase: 16 } },
  { slug: 'spiral', label: 'spiral', detune: 1.05, cfg: { kind: 'spiral', spacing: 11, bend: 80 } },
];

for (const f of FAMILIES) {
  const base = { ...f.cfg, thickness: THICK, color: INK };
  const second = { ...base };
  if (f.turn) second.rotation = f.turn;
  if (f.detune) second.spacing = base.spacing * f.detune;

  const panels = [
    { rgb: compose(V, [base]), width: V.width, height: V.height },
    { rgb: compose(V, [base, second]), width: V.width, height: V.height },
  ];
  // A white gutter, not grey: the panels sit on a white page and the document
  // draws the hairline frames, so the image must not carry a second one.
  const pair = tile(panels, 1, Math.round(SIDE * 0.035), 255);
  const name = `plate-${f.slug}.png`;
  writePng(new URL(name, FIGS).pathname, pair.rgb, pair.width, pair.height);
  console.log(`wrote figures/${name} (${pair.width}x${pair.height})`);
}

console.log(
  FAMILIES.map((f, i) => `${i + 1}. ${f.label} (${f.turn ? `turn ${f.turn}\u00b0` : `detune ${f.detune}`})`).join('\n'),
);
