/**
 * Preset constructions: a shelf of starting points, opened from the Projects
 * panel. Each is a complete scene in the export-file shape and loads through
 * the same forgiving parser an imported JSON does, so a preset can never
 * drift from what a file of the same content would give. Thumbnails are
 * captured from the real renderer by `tests/zoo/preset-scenes.mjs` into
 * `public/presets/` — a preset's picture is the pixels it loads to.
 *
 * The parallel-line constructions lean their carriers about 32 degrees off
 * vertical: an exactly vertical hairline family beats against the screen's
 * own pixel grid, and the slant is the angle worst approximated by rational
 * pixel runs.
 */

export interface ScenePreset {
  id: string;
  name: string;
  /** One sentence for the gallery card. */
  note: string;
  scene: Record<string, unknown>;
}

const SLANT = -31.7;

// Field sources are EXPRESSIONS, not preset names: these two mirror the
// editor's Terrain and Swirl presets verbatim (src/fields/expr.ts).
const TERRAIN =
  '0.34 * sin(1.9 * x + 1.3 * y + 0.3)' +
  ' + 0.24 * sin(3.1 * x - 2.4 * y + 1.9)' +
  ' + 0.15 * sin(5 * x + 3.9 * y + 3.4)' +
  ' + 0.13 * sin(-1.3 * x + 5.8 * y + 5.1)' +
  ' + 0.09 * sin(7.4 * x - 1.35 * y + 2.2)';
const SWIRL =
  '-0.5 * log((x + 0.6)^2 + (y + 0.7)^2 + 0.0324)' +
  ' + 0.5 * log((x - 0.62)^2 + (y + 0.66)^2 + 0.0324)' +
  ' - 0.425 * log((x - 0.55)^2 + (y - 0.7)^2 + 0.0324)' +
  ' + 0.35 * log((x + 0.58)^2 + (y - 0.72)^2 + 0.0324)';

interface LayerSpec extends Record<string, unknown> {
  id: string;
  type: string;
}

function scene(layers: LayerSpec[], zoom: number, pan = { x: 0, y: 0 }): Record<string, unknown> {
  return {
    app: 'moire',
    version: 2,
    layers,
    selectedLayerId: layers[0]?.id ?? null,
    camera: { zoom, pan },
    backgroundColor: '#ffffff',
    view: {},
  };
}

export const PRESETS: ScenePreset[] = [
  {
    id: 'twin-rings',
    name: 'Twin Rings',
    note: 'Two ring families a frame apart: hyperbolae between the centers, a fan of rays beyond.',
    scene: scene(
      [
        { id: 'a', type: 'concentric-circles', spacing: 5.5, position: { x: -72, y: 0 } },
        { id: 'b', type: 'concentric-circles', spacing: 5.5, position: { x: 72, y: 0 } },
      ],
      1.73
    ),
  },
  {
    id: 'ring-trio',
    name: 'Ring Trio',
    note: 'Three ring stacks sharing a center; the beat rings themselves beat, on a slower ring no pair owns.',
    scene: scene(
      [
        { id: 'a', type: 'concentric-circles', spacing: 5 },
        { id: 'b', type: 'concentric-circles', spacing: 5.45 },
        { id: 'c', type: 'concentric-circles', spacing: 5.773 },
      ],
      2
    ),
  },
  {
    id: 'counter-spirals',
    name: 'Counter-Spirals',
    note: 'Two spirals wound opposite ways: thirty straight rays, and turning either spiral moves none of them.',
    scene: scene(
      [
        { id: 'a', type: 'curve-spiral', spacing: 5, bend: 90 },
        { id: 'b', type: 'curve-spiral', spacing: 5, bend: -60 },
      ],
      1.73
    ),
  },
  {
    id: 'nautilus-lenses',
    name: 'Nautilus Lenses',
    note: 'Two logarithmic spirals, mirror-handed. Every similarity is a phase shift to this family — rotating or rescaling either layer slides the pattern through itself — so the rosette of lenses has no characteristic scale.',
    scene: scene(
      [
        { id: 'a', type: 'curve-log', spacing: 16, bend: 48 },
        { id: 'b', type: 'curve-log', spacing: 16, bend: -48 },
      ],
      1
    ),
  },
  {
    id: 'hex-twist',
    name: 'Hexagon Twist',
    note: 'Two honeycombs at a five-degree twist: the rosette superlattice of coincidence spots.',
    scene: scene(
      [
        { id: 'a', type: 'grid-hex', spacing: 10, thickness: 2.4 },
        { id: 'b', type: 'grid-hex', spacing: 10, thickness: 2.4, rotation: 5 },
      ],
      1.13
    ),
  },
  {
    id: 'kagome-twist',
    name: 'Kagome Twist',
    note: 'A woven kagome pair at a small turn — fill the tiles to trade the lattice beat for the decoration.',
    scene: scene(
      [
        { id: 'a', type: 'tiling-periodic', tiling: 'kagome', spacing: 8, thickness: 1.5 },
        { id: 'b', type: 'tiling-periodic', tiling: 'kagome', spacing: 8, thickness: 1.5, rotation: 4 },
      ],
      1.4
    ),
  },
  {
    id: 'terrain',
    name: 'Rolling Terrain',
    note: 'A line family sliding over its twin, one of them carrying a landscape: the fringes are its contour map.',
    scene: scene(
      [
        {
          id: 'a',
          type: 'straight-lines',
          spacing: 5,
          thickness: 3,
          rotation: SLANT,
          field: { source: TERRAIN, amount: 6, scale: 300 },
        },
        { id: 'b', type: 'straight-lines', spacing: 5, thickness: 3, rotation: SLANT },
      ],
      1.13
    ),
  },
  {
    id: 'vortex-flow',
    name: 'Vortex Flow',
    note: 'Four point vortices written into one layer of a line pair; the fringes are the streamlines.',
    scene: scene(
      [
        { id: 'a', type: 'straight-lines', spacing: 5, rotation: SLANT },
        {
          id: 'b',
          type: 'straight-lines',
          spacing: 5,
          rotation: SLANT,
          field: { source: SWIRL, amount: 3.5, scale: 130 },
        },
      ],
      1.33
    ),
  },
  {
    id: 'saddle-bands',
    name: 'Saddle Bands',
    note: 'A saddle carried on a line pair: the fringes are its level sets, two families of hyperbolae.',
    scene: scene(
      [
        { id: 'a', type: 'straight-lines', spacing: 5, rotation: SLANT },
        {
          id: 'b',
          type: 'straight-lines',
          spacing: 5,
          rotation: SLANT,
          field: { source: 'x^2 - y^2', amount: 3, scale: 165 },
        },
      ],
      1.73
    ),
  },
  {
    id: 'dipole',
    name: 'Dipole',
    note: 'Two opposite charges in a line pair; the fringe interval tightens where the field steepens.',
    scene: scene(
      [
        { id: 'a', type: 'straight-lines', spacing: 5, rotation: SLANT },
        {
          id: 'b',
          type: 'straight-lines',
          spacing: 5,
          rotation: SLANT,
          field: {
            source:
              '0.5 * (1 / sqrt((x - 1)^2 + y^2 + 0.0625) - 1 / sqrt((x + 1)^2 + y^2 + 0.0625))',
            amount: 6,
            scale: 200,
          },
        },
      ],
      1.33
    ),
  },
  {
    id: 'fork',
    name: 'Fork',
    note: 'A whole turn counted five times: five fringes end at the center, and no loop around it can miss that.',
    scene: scene(
      [
        { id: 'a', type: 'straight-lines', spacing: 5, rotation: SLANT },
        {
          id: 'b',
          type: 'straight-lines',
          spacing: 5,
          rotation: SLANT,
          field: { source: 'theta / tau', amount: 5, scale: 100 },
        },
      ],
      2
    ),
  },
  {
    id: 'walking-hexagons',
    name: 'Walking Hexagons',
    note: 'One family interfering with itself: each hexagon steps and turns a little further than the last.',
    scene: scene(
      [
        {
          id: 'a',
          type: 'concentric-polygons',
          sides: 6,
          spacing: 4,
          phase: 2,
          offset: { x: 0.9, y: 0.25 },
          rotationOffset: 0.025,
        },
      ],
      1.73
    ),
  },
  {
    id: 'station-ladder',
    name: 'Station Ladder',
    note: 'Two dense pencils of rays: along the axis between them, every simple fraction owns a pocket.',
    scene: scene(
      [
        { id: 'a', type: 'radial-lines', lineCount: 64, phase: 12, thickness: 1, position: { x: -80, y: 0 } },
        { id: 'b', type: 'radial-lines', lineCount: 64, phase: 12, thickness: 1, position: { x: 80, y: 0 } },
      ],
      1
    ),
  },
  {
    id: 'fan-trio',
    name: 'Fan Trio',
    note: 'Three fans on an equilateral triangle, empty centers overlapping in a reuleaux, weaving nets of pockets between them.',
    // Centers make an equilateral triangle of side 100, mirror-symmetric
    // about the vertical axis, the on-axis fan carrying the stack's single
    // rotation — snapped to 49.95° so the mirror maps its ray set to itself
    // (the fan repeats every 0.9°). Layer rotation acts about the world
    // origin, so the rotated fan's position is R(rot) · its visual center.
    scene: scene(
      [
        {
          id: 'a',
          type: 'radial-lines',
          lineCount: 200,
          phase: 150,
          thickness: 2,
          rotation: 49.95,
          position: { x: 44.195173, y: 37.149924 },
        },
        {
          id: 'b',
          type: 'radial-lines',
          lineCount: 200,
          phase: 150,
          thickness: 2,
          position: { x: -50, y: -28.8675 },
        },
        {
          id: 'c',
          type: 'radial-lines',
          lineCount: 200,
          phase: 150,
          thickness: 2,
          position: { x: 50, y: -28.8675 },
        },
      ],
      0.62
    ),
  },
  {
    id: 'pitch-lock',
    name: 'Three to One',
    note: 'Pitches three to one at a slight twist: the fringe rides the third harmonic, one against three.',
    scene: scene(
      [
        // A third of the coarse pitch inked feeds the third harmonic the
        // beat rides; half duty would null it.
        { id: 'a', type: 'straight-lines', spacing: 15, thickness: 5, rotation: SLANT },
        { id: 'b', type: 'straight-lines', spacing: 5, thickness: 1.7, rotation: SLANT + 2 },
      ],
      1.73
    ),
  },
];
