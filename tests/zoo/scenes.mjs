/**
 * The scene zoo: one canonical construction per cell of the feature × layer
 * class matrix the renderer has to get right. Every case is a complete scene
 * file — the same JSON the app saves — so a failing case can be dragged
 * straight into the app to look at.
 *
 * Layers are written out in full rather than leaning on the app's defaults:
 * a golden must not shift because a default did.
 *
 * `coords` is the number of index coordinates each layer contributes to the
 * joint torus — 1 for a scalar family, 2 for a lattice, 5 one day for a
 * Penrose layer. Nothing consumes it yet; it is the schema's commitment that
 * a case knows its own K before the IndexBundle restructure and the tiling
 * layers arrive.
 */

/** Every field of a layer, explicit. Override what a case is about. */
function layer(id, over = {}) {
  return {
    id,
    name: id,
    type: 'straight-lines',
    visible: true,
    color: '#000000',
    rotation: 0,
    opacity: 1,
    spacing: 12,
    thickness: 2,
    phase: 0,
    position: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotationOffset: 0,
    sides: 6,
    vertexSize: 2.5,
    drawEdges: true,
    tileFill: 0,
    lineCount: 8,
    bend: 0,
    frequency: 1,
    field: { source: '', amount: 3, scale: 200 },
    ...over,
    ...(over.position ? { position: { x: 0, y: 0, ...over.position } } : {}),
    ...(over.field ? { field: { source: '', amount: 3, scale: 200, ...over.field } } : {}),
  };
}

/** Every field of the view state, explicit, defaults matching the app's. */
function view(over = {}) {
  return {
    envelope: false,
    envelopeContrast: 3,
    envelopeTaps: 24,
    envelopeSweep: 1,
    envelopeLift: 0,
    envelopeMask: 0,
    envelopeContours: false,
    contourWidth: 1.6,
    contourBands: 0.4,
    ratio: false,
    ratioBlend: 1,
    ratioThreshold: 0.25,
    ...over,
  };
}

function scene(layers, viewState, zoom = 1) {
  return {
    app: 'moire',
    version: 1,
    layers,
    selectedLayerId: layers[0].id,
    camera: { zoom, pan: { x: 0, y: 0 } },
    backgroundColor: '#ffffff',
    view: viewState,
  };
}

const ENVELOPE = { envelope: true };
const CONTOURS = { envelope: true, envelopeContours: true };

/** A pair of straight-line families at a small twist — the hydrogen atom. */
const linesPair = () => [
  layer('a', { type: 'straight-lines' }),
  layer('b', { type: 'straight-lines', rotation: 4 }),
];

const ringsPair = () => [
  layer('a', { type: 'concentric-circles', spacing: 8, position: { x: -22 } }),
  layer('b', { type: 'concentric-circles', spacing: 8, position: { x: 22 } }),
];

const gridTwist = () => [
  layer('a', { type: 'grid-square', spacing: 16 }),
  layer('b', { type: 'grid-square', spacing: 16, rotation: 4 }),
];

/** The two-grid dipole-field construction from the first contours-on-lattices
 * bug report, verbatim — the seed the zoo grew from. */
const gridDipole = () => [
  layer('a', {
    type: 'grid-square',
    spacing: 6,
    thickness: 3.5,
    field: {
      source: '0.5 * (1 / sqrt((x - 1)^2 + y^2 + 0.0625) - 1 / sqrt((x + 1)^2 + y^2 + 0.0625))',
      amount: 4.5,
      scale: 356,
    },
  }),
  layer('b', { type: 'grid-square', spacing: 6, thickness: 3.5 }),
];

const GAUSS = 'exp(-((x)^2 + (y)^2) / 2)';

export const VIEWPORT = { width: 960, height: 720 };
export const CAPTURE = { width: 640, height: 480 };

/** How much of the frame may disagree with the golden before a case fails. */
export const MAX_DIFF_RATIO = 0.0005;

/** One layer per catalogue tiling, drawn plainly — the shader's segment walk
 * against the CPU catalogue the unit tests pin. */
const TILING_IDS = [
  'kagome',
  'truncated-trihex',
  'snub-trihex',
  'truncated-square',
  'truncated-hex',
  'rhombitrihex',
  'snub-square',
  'elongated-triangular',
];

const tilingCases = TILING_IDS.flatMap((id) => [
  {
    name: `tiling-${id}`,
    coords: [2],
    note: `the ${id} tiling alone: edges and vertices, no beat`,
    scene: scene(
      [layer('a', { type: 'tiling-periodic', tiling: id, spacing: 26, thickness: 2 })],
      view()
    ),
  },
]);

export const cases = [
  ...tilingCases,
  {
    name: 'tiling-kagome-filled',
    coords: [2],
    note:
      'kagome with the faces inked inward — the hexagons clear the inset and ' +
      'the triangles do not, which is what makes one tiling look unlike another',
    scene: scene(
      [
        layer('a', {
          type: 'tiling-periodic',
          tiling: 'kagome',
          spacing: 30,
          thickness: 1.5,
          vertexSize: 0,
          tileFill: 0.45,
        }),
      ],
      view()
    ),
  },
  {
    name: 'tiling-octagon-pair-filled',
    coords: [2, 2],
    note: 'two filled truncated-square tilings at 6 degrees — the moire of the faces, not of hairlines',
    scene: scene(
      [
        layer('a', {
          type: 'tiling-periodic',
          tiling: 'truncated-square',
          spacing: 30,
          thickness: 1.5,
          vertexSize: 0,
          tileFill: 0.45,
        }),
        layer('b', {
          type: 'tiling-periodic',
          tiling: 'truncated-square',
          spacing: 30,
          thickness: 1.5,
          vertexSize: 0,
          tileFill: 0.45,
          rotation: 6,
        }),
      ],
      view()
    ),
  },
  {
    name: 'grid-hex-filled',
    coords: [2],
    note: 'fill on a closed-form grid: the honeycomb inked inward, no catalogue table involved',
    scene: scene(
      [layer('a', { type: 'grid-hex', spacing: 18, thickness: 1.5, vertexSize: 0, tileFill: 0.5 })],
      view()
    ),
  },
  {
    name: 'tiling-kagome-twist-contours',
    coords: [2, 2],
    note: 'two kagome tilings at 5 degrees — a catalogue tiling is a lattice, so the twist machinery applies unchanged',
    scene: scene(
      [
        layer('a', { type: 'tiling-periodic', tiling: 'kagome', spacing: 22, thickness: 2 }),
        layer('b', {
          type: 'tiling-periodic',
          tiling: 'kagome',
          spacing: 22,
          thickness: 2,
          rotation: 5,
        }),
      ],
      view(CONTOURS)
    ),
  },
  {
    name: 'tiling-octagon-ring-envelope',
    coords: [2, 1],
    note: 'the truncated-square tiling against a ring family — a tiling beats a scalar like any lattice',
    scene: scene(
      [
        layer('a', { type: 'tiling-periodic', tiling: 'truncated-square', spacing: 20, thickness: 2 }),
        layer('b', { type: 'concentric-circles', spacing: 19, thickness: 2 }),
      ],
      view(ENVELOPE)
    ),
  },
  // ---- scalar pairs: the four view modes on the simplest stack ----
  {
    name: 'lines-pair',
    coords: [1, 1],
    note: 'two line families at 4°, plain composite',
    scene: scene(linesPair(), view()),
  },
  {
    name: 'lines-pair-envelope',
    coords: [1, 1],
    note: 'the same pair enveloped: broad diagonal fringes, carrier gone',
    scene: scene(linesPair(), view(ENVELOPE)),
  },
  {
    name: 'lines-pair-contours',
    coords: [1, 1],
    note: 'contours at integer D over the envelope',
    scene: scene(linesPair(), view(CONTOURS)),
  },
  {
    name: 'lines-pair-ratio',
    coords: [1, 1],
    note: 'the heterodyne ratio map of the pair',
    scene: scene(linesPair(), view({ ratio: true })),
  },
  {
    name: 'lines-pair-mask',
    coords: [1, 1],
    note: 'envelope with the regime mask most of the way up',
    scene: scene(linesPair(), view({ ...ENVELOPE, envelopeMask: 0.85 })),
  },
  {
    name: 'lines-trio-contours',
    coords: [1, 1, 1],
    note: 'three families at 0/3/9° — the third joins the character scan',
    scene: scene(
      [
        layer('a', { type: 'straight-lines' }),
        layer('b', { type: 'straight-lines', rotation: 3 }),
        layer('c', { type: 'straight-lines', rotation: 9 }),
      ],
      view(CONTOURS)
    ),
  },

  // ---- concentric and radial scalars ----
  {
    name: 'rings-pair-envelope',
    coords: [1, 1],
    note: 'two ring families off-centre: the two-centre fringe system',
    scene: scene(ringsPair(), view(ENVELOPE)),
  },
  {
    name: 'rings-pair-contours',
    coords: [1, 1],
    note: 'the character-hills skeleton: contours of D between ring centres',
    scene: scene(ringsPair(), view(CONTOURS)),
  },
  {
    name: 'rings-pair-contours-zoom2',
    coords: [1, 1],
    note: 'the same skeleton at scene zoom 2 — guards the capture framing math',
    scene: scene(ringsPair(), view(CONTOURS), 2),
  },
  {
    name: 'squares-pair-contours',
    coords: [1, 1],
    note: 'square rings at a 10° twist — piecewise index fields with corners',
    scene: scene(
      [
        layer('a', { type: 'concentric-squares', spacing: 10 }),
        layer('b', { type: 'concentric-squares', spacing: 10, rotation: 10 }),
      ],
      view(CONTOURS)
    ),
  },
  {
    name: 'hexrot-spiral-envelope',
    coords: [1, 1],
    note:
      'two concentric-hexagon families, one rotating 0.02 rad per ring — past ' +
      'the fold radius spacing/θ = 300 the family branches, and the phase trio ' +
      'must report adjacent branches, not index neighbours (the sector-hash bug)',
    scene: scene(
      [
        layer('a', { type: 'concentric-polygons', spacing: 6, thickness: 3.5, sides: 6 }),
        layer('b', {
          type: 'concentric-polygons',
          spacing: 6,
          thickness: 3.5,
          sides: 6,
          rotationOffset: 0.02,
        }),
      ],
      view(ENVELOPE),
      0.5
    ),
  },
  {
    name: 'radial-pair-contours',
    coords: [1, 1],
    note: 'two radial fans off-centre — the sector-count scalar under contours',
    scene: scene(
      [
        layer('a', { type: 'radial-lines', lineCount: 48, position: { x: -25 } }),
        layer('b', { type: 'radial-lines', lineCount: 48, position: { x: 25 } }),
      ],
      view(CONTOURS)
    ),
  },
  {
    name: 'line-ring-contours',
    coords: [1, 1],
    note: 'mixed classes: a line family against a ring family',
    scene: scene(
      [
        layer('a', { type: 'straight-lines', spacing: 9 }),
        layer('b', { type: 'concentric-circles', spacing: 9 }),
      ],
      view(CONTOURS)
    ),
  },

  // A sum-beat region inside a difference-beat frame: two equal-pitch ring
  // families. The sum character wins around the midpoint (the elliptic eye)
  // and the difference everywhere else, so the envelope must hand one sweep
  // schedule over to the other. The guarded artifact is the hard-edged disc
  // of carrier hash that a per-pixel schedule switch paints around the eye:
  // devW must fade the deviated schedule out as its winner leaves the fringe
  // regime, so the eye closes into the ray fan with no rim.
  {
    name: 'rings-sum-handover',
    coords: [1, 1],
    note: 'equal-pitch rings — the sum eye must fade into the ray fan seamlessly',
    scene: scene(
      [
        layer('a', { type: 'concentric-circles', spacing: 8, position: { x: -40 } }),
        layer('b', { type: 'concentric-circles', spacing: 8, position: { x: 40 } }),
      ],
      view(ENVELOPE)
    ),
  },
  // Three dense radial fans: the local pitch ratio between each pair sweeps
  // the rationals, so in-regime higher-order stations dot the whole frame.
  // Each such winner used to engage a full schedule deviation on the mere
  // thr/2 margin, painting hard-edged thumbs of foreign texture over the
  // envelope while the render ran smoothly across them (the user's
  // three-fan artifact). The deviation margin now scales with the winner's
  // amplitude weight, so these pockets ride the diagonal; only decisive
  // winners (a global 3:1 pair) still deviate.
  {
    name: 'fan-trio-envelope',
    coords: [1, 1, 1],
    note: 'three dense fans — marginal station winners must not deviate the sweep',
    scene: scene(
      [
        layer('a', {
          type: 'radial-lines',
          lineCount: 200,
          thickness: 2,
          phase: 150,
          position: { x: 57.7, y: 0 },
        }),
        layer('b', {
          type: 'radial-lines',
          lineCount: 200,
          thickness: 2,
          phase: 150,
          rotation: 50,
          position: { x: 20, y: 50 },
          offset: { x: 0, y: -0.5 },
        }),
        layer('c', {
          type: 'radial-lines',
          lineCount: 200,
          thickness: 2,
          phase: 150,
          position: { x: -28.9, y: -50 },
        }),
      ],
      view({ envelope: true, envelopeContrast: 1.5, envelopeTaps: 58, envelopeSweep: 1.3 }),
      0.8
    ),
  },
  // Two walking families under the envelope: both layers' index fields exist
  // only as search output, so the scan's gradients ride dFdx and the winner
  // used to flip per quad along the fold-sector boundaries — hard stippled
  // edges between smooth fringe regions. The schedule handover has to keep
  // those boundaries soft.
  {
    name: 'walk-pair-envelope',
    coords: [1, 1],
    note: 'two walking circle families — schedule boundaries must not stipple',
    scene: scene(
      [
        layer('a', {
          type: 'concentric-circles',
          spacing: 8,
          offset: { x: 2.4, y: 0.6 },
          rotationOffset: 0.015,
          position: { x: -20 },
        }),
        layer('b', {
          type: 'concentric-circles',
          spacing: 8,
          offset: { x: -2.2, y: -0.5 },
          rotationOffset: -0.012,
          position: { x: 20 },
        }),
      ],
      view(ENVELOPE)
    ),
  },
  // ---- higher-order beats: the reduction scan's reason to exist ----
  // Line families at a 3:1 pitch ratio and a 2° twist. The visible fringe is
  // the (3,-1) character, which no |k| <= 2 enumeration contains: the capped
  // scan held a phantom (2,-1) schedule and washed the true fringe out of
  // the envelope, declared "no fringe" in the ratio map while fringes stood
  // in the render, and drew no contour. The per-pixel Gauss reduction finds
  // (3,-1) exactly; these three views each guard one consumer of the winner.
  {
    name: 'pitch-3to1-envelope',
    coords: [1, 1],
    note: 'lines at 3:1 pitch — the (3,-1) fringe must survive the average',
    scene: scene(
      [
        layer('a', { type: 'straight-lines', spacing: 15, thickness: 3 }),
        layer('b', { type: 'straight-lines', spacing: 5, thickness: 2, rotation: 2 }),
      ],
      view(ENVELOPE)
    ),
  },
  {
    name: 'pitch-3to1-contours',
    coords: [1, 1],
    note: 'lines at 3:1 pitch — contours must draw the (3,-1) skeleton',
    scene: scene(
      [
        layer('a', { type: 'straight-lines', spacing: 15, thickness: 3 }),
        layer('b', { type: 'straight-lines', spacing: 5, thickness: 2, rotation: 2 }),
      ],
      view(CONTOURS)
    ),
  },
  {
    name: 'pitch-3to1-ratio',
    coords: [1, 1],
    note: 'lines at 3:1 pitch — the map must darken along the (3,-1) beat',
    scene: scene(
      [
        layer('a', { type: 'straight-lines', spacing: 15, thickness: 3 }),
        layer('b', { type: 'straight-lines', spacing: 5, thickness: 2, rotation: 2 }),
      ],
      view({ ratio: true })
    ),
  },
  // The deep end of the ladder: 5:2 pitch, a 1° twist, and thicknesses that
  // keep the fifth and second harmonics strong (duty 0.12 and 0.25 — a duty
  // of 1/2 on layer b would null the second harmonic and the beat with it).
  // The winner is (5,-2): reduction reaches it in two steps. The physical
  // mean here carries a second, faster beat — (2,-1) at fifty units, forced
  // by the ratio itself — and a one-character sweep must wash it; the
  // contrast and tap dials are raised so the held (5,-2) fringe is legible
  // in the golden over the rate-5 schedule's sampling residue.
  {
    name: 'pitch-5to2-envelope',
    coords: [1, 1],
    note: 'lines at 5:2 pitch — the (5,-2) fringe must survive the average',
    scene: scene(
      [
        layer('a', { type: 'straight-lines', spacing: 25, thickness: 3 }),
        layer('b', { type: 'straight-lines', spacing: 10, thickness: 2.5, rotation: 1 }),
      ],
      view({ envelope: true, envelopeContrast: 6, envelopeTaps: 48 })
    ),
  },
  // Ring families at 3:1 pitch with offset centres: the local gradient pair,
  // and with it the (3,-1) merit, varies over the frame, so this map golden
  // guards the per-pixel-ness of the reduction — a global character choice
  // (or the old cap) cannot reproduce its structure.
  {
    name: 'rings-3to1-ratio',
    coords: [1, 1],
    note: 'offset ring families at 3:1 — the map structure is per-pixel reduction',
    scene: scene(
      [
        layer('a', { type: 'concentric-circles', spacing: 7.5, thickness: 2, position: { x: -40 } }),
        layer('b', { type: 'concentric-circles', spacing: 2.5, thickness: 1.2, position: { x: 40 } }),
      ],
      view({ ratio: true })
    ),
  },

  // ---- curves ----
  {
    name: 'wave-pair-envelope',
    coords: [1, 1],
    note: 'two wave families at 5° — bent index fields enveloped',
    scene: scene(
      [
        layer('a', { type: 'curve-wave', spacing: 16, bend: 8 }),
        layer('b', { type: 'curve-wave', spacing: 16, bend: 8, rotation: 5 }),
      ],
      view(ENVELOPE)
    ),
  },
  {
    name: 'spiral-ring-envelope',
    coords: [1, 1],
    note: 'a spiral against rings — unequal index gradients everywhere',
    scene: scene(
      [
        layer('a', { type: 'curve-spiral', spacing: 16, bend: 32 }),
        layer('b', { type: 'concentric-circles', spacing: 16 }),
      ],
      view(ENVELOPE)
    ),
  },

  // ---- fields on scalars ----
  {
    name: 'line-field-envelope',
    coords: [1, 1],
    note: 'a Gaussian-warped line family against a plain twin, enveloped',
    scene: scene(
      [
        layer('a', { type: 'straight-lines', field: { source: GAUSS, amount: 5, scale: 180 } }),
        layer('b', { type: 'straight-lines' }),
      ],
      view(ENVELOPE)
    ),
  },
  // A circle-valued field mints a defect: theta/tau at amount 5 is a
  // charge-5 fork — five extra members fan out of the origin, and the
  // fringe field against the plain twin is five fringes ENDING at the
  // defect, which no exact (single-valued) field can draw. The winding is
  // what paper/tools/exp/defects.mjs counts; these two goldens pin the
  // drawing (the fork grating) and the envelope (fringes that end).
  {
    name: 'line-fork-render',
    coords: [1, 1],
    note: 'theta/tau at amount 5 — the charge-5 fork grating, plain render',
    scene: scene(
      [
        layer('a', {
          type: 'straight-lines',
          field: { source: 'theta / tau', amount: 5, scale: 200 },
        }),
        layer('b', { type: 'straight-lines' }),
      ],
      view()
    ),
  },
  {
    name: 'line-fork-envelope',
    coords: [1, 1],
    note: 'the fork pair enveloped — five fringes ending at the defect',
    scene: scene(
      [
        layer('a', {
          type: 'straight-lines',
          field: { source: 'theta / tau', amount: 5, scale: 200 },
        }),
        layer('b', { type: 'straight-lines' }),
      ],
      view(ENVELOPE)
    ),
  },
  {
    name: 'line-field-contours',
    coords: [1, 1],
    note: 'the warped pair under contours — level sets of the field itself',
    scene: scene(
      [
        layer('a', { type: 'straight-lines', field: { source: GAUSS, amount: 5, scale: 180 } }),
        layer('b', { type: 'straight-lines' }),
      ],
      view(CONTOURS)
    ),
  },

  // ---- lattices ----
  {
    name: 'grid-twist-envelope',
    coords: [2, 2],
    note: 'the square-lattice twist pair — both slow characters survive the sweep',
    scene: scene(gridTwist(), view(ENVELOPE)),
  },
  {
    name: 'grid-twist-contours',
    coords: [2, 2],
    note: 'contours on the twist pair — the class the first lattice-contours bug hid in',
    scene: scene(gridTwist(), view(CONTOURS)),
  },
  {
    name: 'grid-hex-twist-contours',
    coords: [2, 2],
    note: 'hex lattices at 3° — three families, two generators, under contours',
    scene: scene(
      [
        layer('a', { type: 'grid-hex', spacing: 16 }),
        layer('b', { type: 'grid-hex', spacing: 16, rotation: 3 }),
      ],
      view(CONTOURS)
    ),
  },
  {
    name: 'grid-tri-line-contours',
    coords: [2, 1],
    note:
      'a triangle lattice against a scalar partner — the line family is set ' +
      'parallel to a lattice edge family (pitch (√3/2)·16 ≈ 13.86 at 30°) so a ' +
      'real slow beat exists for the contour channel to draw',
    scene: scene(
      [
        layer('a', { type: 'grid-triangle', spacing: 16 }),
        layer('b', { type: 'straight-lines', spacing: 13, rotation: 30 }),
      ],
      view(CONTOURS)
    ),
  },
  {
    name: 'grid-trio-twist-contours',
    coords: [2, 2, 2],
    note: 'three square lattices at 0/2.5/5° — the third joins the lockstep sweep',
    scene: scene(
      [
        layer('a', { type: 'grid-square', spacing: 16 }),
        layer('b', { type: 'grid-square', spacing: 16, rotation: 2.5 }),
        layer('c', { type: 'grid-square', spacing: 16, rotation: 5 }),
      ],
      view(CONTOURS)
    ),
  },
  {
    name: 'grid-field-envelope',
    coords: [2, 2],
    note: 'the dipole-field grid pair from the bug report, enveloped',
    scene: scene(gridDipole(), view({ ...ENVELOPE, envelopeContrast: 4.1 })),
  },
  {
    name: 'grid-field-contours',
    coords: [2, 2],
    note: 'the same pair under contours — the fix that seeded this zoo',
    scene: scene(
      gridDipole(),
      view({ ...CONTOURS, envelopeContrast: 4.1, contourWidth: 3.2 })
    ),
  },

  // ---- degenerate stacks and ranking ----
  {
    name: 'single-ring-envelope',
    coords: [1],
    note: 'one scalar family alone — the A == B envelope fallback',
    scene: scene([layer('a', { type: 'concentric-circles', spacing: 8 })], view(ENVELOPE)),
  },
  {
    name: 'single-grid-envelope',
    coords: [2],
    note: 'one lattice alone — the sweep washes it to its cell mean',
    scene: scene([layer('a', { type: 'grid-square', spacing: 16 })], view(ENVELOPE)),
  },
  {
    name: 'grid-lines-ratio',
    coords: [2, 1, 1],
    note: 'ratio view over a grid and two scalars — the ranking must skip the grid',
    scene: scene(
      [
        layer('a', { type: 'grid-square', spacing: 16 }),
        layer('b', { type: 'straight-lines' }),
        layer('c', { type: 'straight-lines', rotation: 4 }),
      ],
      view({ ratio: true })
    ),
  },
  {
    name: 'grid-ring-ratio',
    coords: [2, 1],
    note:
      'the eta map of a ring family over a square lattice — dark lobes where a ' +
      'grid family matches the local ring direction and pitch; the measurement ' +
      'reads lattice ink families, so one scalar plus a lattice is a map',
    scene: scene(
      [
        layer('a', { type: 'grid-square', spacing: 16 }),
        layer('b', { type: 'concentric-circles', spacing: 15 }),
      ],
      view({ ratio: true })
    ),
  },
  {
    name: 'grid-twist-ratio',
    coords: [2, 2],
    note:
      'the eta map of a square-lattice twist pair — matched dual-ring families ' +
      'beat slowly everywhere, so the map reads uniformly deep in the fringe regime',
    scene: scene(gridTwist(), view({ ratio: true })),
  },
];
