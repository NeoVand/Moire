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
  'running-bond',
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
