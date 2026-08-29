// The teaser: five compositions in a row, left to right in order of how much the
// classical theory can say about them.
//
//   1. two combs at a small angle          -- the 1874 picture, spectral theory exact
//   2. two circle families, displaced      -- Oster's rings, still periodic-ish
//   3. one walking triangle family         -- no global index field, needs the solver
//   4. two counter-rotating spirals        -- no lattice anywhere, closed-form index
//   5. a carrier and a phase-shifted copy  -- the difference chosen to be a flow
//
// Every panel is the field model of Section 3 evaluated per pixel by the same code
// the paper describes; panel 3 goes through the shipped walking solver.
//
//   node paper/tools/exp/teaser.mjs

import { mkdirSync } from 'node:fs';
import { compose, tile, view } from '../lib/render.mjs';
import { loadSolver } from '../lib/instrument.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const SHAPE_CODE = { circle: 1, square: 2, triangle: 3, polygon: 4 };

// One ink for both families in every panel. The fringe law is a statement about
// total coverage, so a single ink is what it is a statement about: where the two
// families coincide the ink halves and the panel goes pale, and that pale set is
// the fringe. Two hues would only dilute it.
const INK = '#14171b';
const T = 1.5;

// Rendered at 1.5 device pixels per world unit so a 1.5-unit stroke lands on 2.25
// pixels: about a third of a point at the printed panel width of 1.36 in, which is
// the finest hairline that survives offset printing. Panels carry sixty members
// across rather than thirty, so the beat has room to be a beat.
const V = view({ width: 620, height: 956, zoom: 1.5, superSample: 3 });

// ---------------------------------------------------------------- 1. two combs
// Equal pitch, three and a half degrees apart. Fringe spacing is s/(2 sin(t/2)),
// here 108 world units, so three broad bands cross the panel nearly perpendicular
// to the lines: the oldest moire there is, and the one case where
// nineteenth-century theory is exact.
const combs = compose(V, [
  { kind: 'parallel', spacing: 6.5, angle: 0.44, thickness: T, color: INK },
  { kind: 'parallel', spacing: 6.5, angle: 0.5, thickness: T, color: INK },
]);

// ------------------------------------------------------------ 2. two ring sets
// Concentric circles about two centres. The fringes are confocal hyperbolae --
// level sets of the difference of the two radii, which is exactly Theorem 1. The
// separation sets how many branches cross the frame: 2*90/8, about twenty-two.
const rings = compose(V, [
  { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: -90, y: 0 }, thickness: T, color: INK },
  { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 90, y: 0 }, thickness: T, color: INK },
]);

// --------------------------------------------------- 3. one walking triangle set
// Member n is turned by n*theta and pushed by n*delta. There is no closed-form
// index field, and no partner layer either: the family interferes with itself
// where its own members run near-tangent, which the two-grating theory has no
// statement about. Distances come from the solver of Section 6.
const solver = await loadSolver('final');
const WALK = {
  offset: { x: 1.2, y: 0 },
  rotationOffset: 0.03,
  spacing: 3.5,
  phase: 2,
  shape: 'triangle',
  position: { x: 0, y: 0 },
};
const walking = compose(V, [
  {
    thickness: T,
    color: INK,
    dist: (p, halfT, aa) =>
      solver.ringDistance(
        { x: p.x - WALK.position.x, y: p.y - WALK.position.y },
        WALK.offset,
        WALK.rotationOffset,
        WALK.spacing,
        WALK.phase,
        SHAPE_CODE[WALK.shape],
        6,
        Math.max(halfT - aa, 0),
        halfT + aa
      ),
  },
]);

// ---------------------------------------------------------- 4. mirrored spirals
// One Archimedean spiral and its reflection. Both have closed-form index fields,
// neither is a geometric transform of a periodic layer, so Fourier moire theory
// does not reach them -- but the difference of the two indices does.
// Arm rise per turn is M*s with M = round(bend/s), so the eighteen starts here
// keep an open spiral at a fine pitch. The index difference is -M*arg(p)/pi, which
// is why the fringes are radial: thirty-six spokes, and no lattice anywhere.
const mirrorY = (q) => ({ x: q.x, y: -q.y });
const SPIRAL = { kind: 'spiral', spacing: 5, bend: 90, thickness: T };
const spirals = compose(V, [
  { ...SPIRAL, color: INK },
  { ...SPIRAL, warp: mirrorY, color: INK },
]);

// --------------------------------------------------------------- 5. a chosen field
// Same construction, run backwards: pick the field you want the fringes to be, and
// subtract it from one carrier's phase. The Studio's `swirl` is the stream function
// of four point vortices, so the fringes here are streamlines of that flow.
// Nothing was integrated and no curve was traced -- and this is a Field setting on
// an ordinary Parallel layer, not a closure written for the figure.
const CARRIER = { kind: 'parallel', angle: 0, spacing: 5, thickness: T, color: INK };
const flow = compose(V, [
  CARRIER,
  { ...CARRIER, field: 'swirl', fieldAmount: 3.5, fieldScale: 155 },
]);

const panels = [combs, rings, walking, spirals, flow].map((rgb) => ({
  rgb,
  width: V.width,
  height: V.height,
}));
const strip = tile(panels, 5, 21, 255);
writePng(new URL('teaser.png', FIGS).pathname, strip.rgb, strip.width, strip.height);
console.log(`wrote figures/teaser.png (${strip.width}x${strip.height})`);
