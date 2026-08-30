import type { TilingId } from '../gpu/tilings';

export type PatternType =
  | 'straight-lines'
  | 'radial-lines'
  | 'concentric-circles'
  | 'concentric-squares'
  | 'concentric-triangles'
  | 'concentric-polygons'
  | 'grid-square'
  | 'grid-hex'
  | 'grid-triangle'
  | 'curve-wave'
  | 'curve-parabola'
  | 'curve-hyperbola'
  | 'curve-spiral'
  | 'tiling-periodic';

/**
 * A field displaces a layer's index by `fieldAmount * f(q)` members. The fringes
 * a modulated layer makes against an unmodulated twin are then the level sets of
 * `f` at interval `1 / fieldAmount`, which is the tool's contouring control:
 * encoded fields, streamlines, shadow moiré.
 *
 * The expression is the field. Presets in `src/fields/expr.ts` are starting
 * points that compile through the same path as anything typed by hand, and an
 * empty source means the layer carries no field.
 */
export interface FieldSpec {
  /** An expression in `x`, `y`, `r`, `theta`. Empty means no field. */
  source: string;
  /** Fringes per unit of field: the contour interval is its reciprocal. */
  amount: number;
  /** Field extent in world units. The field is O(1) inside it. */
  scale: number;
  /**
   * Muted, not removed: the expression stays compiled into the material and only
   * the amount uniform goes to zero, so A/B-ing a field is instant. Absent means
   * on, so older layers need no migration.
   */
  enabled?: boolean;
}

export const FIELD_NONE: FieldSpec = { source: '', amount: 3, scale: 200 };

/**
 * Every family carries a field. The index displacement is the shared language:
 * the level-set families spend it on phase, the radial fan on a rotation, and a
 * lattice on a translation along one of its generators.
 */
export function hasField(layer: Pick<PatternLayer, 'field'>): boolean {
  return (
    layer.field.enabled !== false &&
    layer.field.source.trim().length > 0 &&
    layer.field.amount !== 0
  );
}

/**
 * Quadrature nodes for the envelope view's phase average. The integrand is
 * periodic with period one, so a uniform grid is exact but for harmonics above
 * this count, and the integrand is a composite of trapezoids.
 */
export const ENVELOPE_TAPS = 24;

export interface Vec2 {
  x: number;
  y: number;
}

export interface PatternLayer {
  id: string;
  name: string;
  type: PatternType;
  visible: boolean;
  color: string;
  position: Vec2;
  /** Layer pose, degrees. */
  rotation: number;
  opacity: number;
  spacing: number;
  thickness: number;
  /** Concentric / radial Start. Parallel / curve shift. */
  phase: number;
  offset: Vec2;
  /** Per-ring rotation, radians. Always present. */
  rotationOffset: number;
  sides: number;
  /** Lattice vertex disk radius. 0 hides vertices. */
  vertexSize: number;
  /** Lattice edges. Grids have no offset. */
  drawEdges: boolean;
  /**
   * Ink the faces, inward from their edges. 0 is off; 1 is solid. In between
   * it is an inset, so a face fills only once its incircle exceeds the inset —
   * which is what separates a tiling's big faces from its small ones, and is
   * the whole reason two different tilings look like two different patterns
   * rather than the same fringe system twice.
   */
  tileFill: number;
  /** Lattice stretch in layer space. 1 is unstretched. */
  scale: Vec2;
  /** Distinct lines through the origin. Radial lines only. */
  lineCount: number;
  /** Wave amplitude, parabola sag, or spiral pitch (radius per turn). Curves only. */
  bend: number;
  /** Wave oscillation rate. 1 is one cycle per 32 world units. */
  frequency: number;
  /** Which catalogue tiling, for `tiling-periodic`. Stored by name so
   * reordering the catalogue cannot repaint an existing scene. */
  tiling: TilingId;
  /** Scalar field displacing the layer's index. */
  field: FieldSpec;
}

export interface CameraState {
  zoom: number;
  pan: Vec2;
}

export interface MoireProject {
  layers: PatternLayer[];
  selectedLayerId: string | null;
  camera: CameraState;
  backgroundColor: string;
}

export type PatternFamily = 'lines' | 'concentric' | 'grid' | 'curves';

export const PATTERN_META: {
  id: PatternType;
  label: string;
  family: PatternFamily;
}[] = [
  { id: 'straight-lines', label: 'Parallel', family: 'lines' },
  { id: 'radial-lines', label: 'Radial', family: 'lines' },
  { id: 'concentric-circles', label: 'Circle', family: 'concentric' },
  { id: 'concentric-squares', label: 'Square', family: 'concentric' },
  { id: 'concentric-triangles', label: 'Triangle', family: 'concentric' },
  { id: 'concentric-polygons', label: 'Hexagon', family: 'concentric' },
  { id: 'grid-square', label: 'Square', family: 'grid' },
  { id: 'grid-hex', label: 'Hexagon', family: 'grid' },
  { id: 'grid-triangle', label: 'Triangle', family: 'grid' },
  { id: 'tiling-periodic', label: 'Tiling', family: 'grid' },
  { id: 'curve-wave', label: 'Wave', family: 'curves' },
  { id: 'curve-parabola', label: 'Parabola', family: 'curves' },
  { id: 'curve-hyperbola', label: 'Hyperbola', family: 'curves' },
  { id: 'curve-spiral', label: 'Spiral', family: 'curves' },
];

export const PATTERN_FAMILIES: {
  id: PatternFamily;
  label: string;
  types: PatternType[];
}[] = [
  { id: 'lines', label: 'Lines', types: ['straight-lines', 'radial-lines'] },
  {
    id: 'concentric',
    label: 'Concentric',
    types: [
      'concentric-circles',
      'concentric-squares',
      'concentric-triangles',
      'concentric-polygons',
    ],
  },
  {
    id: 'grid',
    label: 'Tiling',
    types: ['grid-square', 'grid-hex', 'grid-triangle', 'tiling-periodic'],
  },
  {
    id: 'curves',
    label: 'Curves',
    types: ['curve-wave', 'curve-parabola', 'curve-hyperbola', 'curve-spiral'],
  },
];

export function familyOf(type: PatternType): PatternFamily {
  return PATTERN_META.find((item) => item.id === type)?.family ?? 'concentric';
}

export function isConcentric(type: PatternType): boolean {
  return (
    type === 'concentric-circles' ||
    type === 'concentric-squares' ||
    type === 'concentric-triangles' ||
    type === 'concentric-polygons'
  );
}

/** Regular-polygon side count used when easing concentric shapes. Circle is a many-gon. */
export function concentricSideCount(type: PatternType, sides: number): number {
  if (type === 'concentric-circles') return 64;
  if (type === 'concentric-squares') return 4;
  if (type === 'concentric-triangles') return 3;
  if (type === 'concentric-polygons') return Math.max(3, sides);
  return Math.max(3, sides);
}

export function mixInvN(n0: number, n1: number, t: number): number {
  return 1 / ((1 - t) / Math.max(n0, 1e-4) + t / Math.max(n1, 1e-4));
}

/**
 * A lattice: members indexed by a PAIR of integers rather than a scalar phase.
 * The three regular grids and every catalogue tiling alike — which is what
 * makes them one family. Everything that branches on "is this a lattice"
 * (the envelope's cell average, the character scan's ranking, the contour
 * overlay's generator matching) asks this.
 */
export function isGrid(type: PatternType): boolean {
  return (
    type === 'grid-square' ||
    type === 'grid-hex' ||
    type === 'grid-triangle' ||
    type === 'tiling-periodic'
  );
}

/** A lattice whose decoration comes from the tiling catalogue. */
export function isTiling(type: PatternType): boolean {
  return type === 'tiling-periodic';
}

export function isLines(type: PatternType): boolean {
  return type === 'straight-lines' || type === 'radial-lines';
}

export function isRadialLines(type: PatternType): boolean {
  return type === 'radial-lines';
}

export function isCurves(type: PatternType): boolean {
  return (
    type === 'curve-wave' ||
    type === 'curve-parabola' ||
    type === 'curve-hyperbola' ||
    type === 'curve-spiral'
  );
}

export function defaultBend(type: PatternType): number {
  if (type === 'curve-wave') return 8;
  if (type === 'curve-parabola') return 1;
  if (type === 'curve-spiral') return 32;
  return 0;
}

export function defaultCurveSpacing(type: PatternType): number {
  void type;
  return 16;
}

export function createLayer(
  partial: Partial<PatternLayer> & Pick<PatternLayer, 'id' | 'name'>
): PatternLayer {
  // `field` needs no exclusion from the spread: the literal below overrides it.
  const { position, offset, scale, ...rest } = partial;
  return {
    type: 'concentric-circles',
    visible: true,
    color: '#000000',
    rotation: 0,
    opacity: 1,
    spacing: 20,
    thickness: 1.5,
    phase: 0,
    rotationOffset: 0,
    sides: 6,
    vertexSize: 2.5,
    drawEdges: true,
    tileFill: 0,
    lineCount: 8,
    bend: 0,
    frequency: 1,
    tiling: 'kagome',
    ...rest,
    field: { ...FIELD_NONE, ...partial.field },
    position: { x: 0, y: 0, ...position },
    offset: { x: 0, y: 0, ...offset },
    scale: { x: 1, y: 1, ...scale },
  };
}

export function createDefaultProject(): MoireProject {
  return {
    selectedLayerId: '1',
    camera: { zoom: 1, pan: { x: 0, y: 0 } },
    backgroundColor: '#ffffff',
    layers: [
      createLayer({
        id: '1',
        name: 'Layer 1',
        type: 'concentric-circles',
        position: { x: 20, y: 50 },
        rotation: 50,
        spacing: 6,
        thickness: 3.5,
        offset: { x: 0, y: -0.5 },
        rotationOffset: 0,
      }),
      createLayer({
        id: '2',
        name: 'Layer 2',
        type: 'concentric-circles',
        position: { x: 10, y: -20 },
        rotation: -5.8,
        spacing: 6,
        thickness: 3.5,
        offset: { x: 0, y: 0.5 },
        rotationOffset: 0,
      }),
    ],
  };
}

/** Two coincident default concentric layers. The intro eases from here into the preset. */
export function createIntroRestProject(): MoireProject {
  const preset = createDefaultProject();
  return {
    ...preset,
    layers: preset.layers.map((layer) =>
      createLayer({
        id: layer.id,
        name: layer.name,
        type: 'concentric-circles',
        color: layer.color,
        visible: layer.visible,
      })
    ),
  };
}

export const MAX_LAYERS = 12;

export const LAYER_DEFAULTS = {
  opacity: 1,
  positionX: 0,
  positionY: 0,
  rotation: 0,
  spacing: 20,
  spacingLines: 16,
  thickness: 1.5,
  phase: 0,
  offsetX: 0,
  offsetY: 0,
  rotationOffset: 0,
  sides: 6,
  vertexSize: 2.5,
  tileFill: 0,
  spacingGrid: 16,
  scaleX: 1,
  scaleY: 1,
  lineCount: 8,
  bend: 0,
  bendWave: 8,
  bendParabola: 1,
  bendSpiral: 32,
  frequency: 1,
  fieldAmount: FIELD_NONE.amount,
  fieldScale: FIELD_NONE.scale,
} as const;
