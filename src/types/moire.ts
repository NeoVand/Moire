export type PatternType =
  | 'straight-lines'
  | 'concentric-circles'
  | 'concentric-squares'
  | 'concentric-triangles'
  | 'concentric-polygons'
  | 'grid-square'
  | 'grid-hex'
  | 'grid-triangle';

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
  phase: number;
  offset: Vec2;
  /** Per-ring rotation, radians. Always present. */
  rotationOffset: number;
  sides: number;
  /** Lattice vertex disk radius. 0 hides vertices. */
  vertexSize: number;
  /** Lattice edges. Grids have no offset. */
  drawEdges: boolean;
  /** Lattice stretch in layer space. 1 is unstretched. */
  scale: Vec2;
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

export type PatternFamily = 'lines' | 'circles' | 'polygon' | 'grid';

export const PATTERN_META: {
  id: PatternType;
  label: string;
  family: PatternFamily;
}[] = [
  { id: 'straight-lines', label: 'Lines', family: 'lines' },
  { id: 'concentric-circles', label: 'Circles', family: 'circles' },
  { id: 'concentric-squares', label: 'Square', family: 'polygon' },
  { id: 'concentric-triangles', label: 'Triangle', family: 'polygon' },
  { id: 'concentric-polygons', label: 'Hexagon', family: 'polygon' },
  { id: 'grid-square', label: 'Square', family: 'grid' },
  { id: 'grid-hex', label: 'Hexagon', family: 'grid' },
  { id: 'grid-triangle', label: 'Triangle', family: 'grid' },
];

export const PATTERN_FAMILIES: {
  id: PatternFamily;
  label: string;
  types: PatternType[];
}[] = [
  { id: 'lines', label: 'Lines', types: ['straight-lines'] },
  { id: 'circles', label: 'Circles', types: ['concentric-circles'] },
  { id: 'polygon', label: 'Polygon', types: ['concentric-squares', 'concentric-triangles', 'concentric-polygons'] },
  { id: 'grid', label: 'Grid', types: ['grid-square', 'grid-hex', 'grid-triangle'] },
];

export function familyOf(type: PatternType): PatternFamily {
  return PATTERN_META.find((item) => item.id === type)?.family ?? 'circles';
}

export function isConcentric(type: PatternType): boolean {
  return (
    type === 'concentric-circles' ||
    type === 'concentric-squares' ||
    type === 'concentric-triangles' ||
    type === 'concentric-polygons'
  );
}

export function isGrid(type: PatternType): boolean {
  return type === 'grid-square' || type === 'grid-hex' || type === 'grid-triangle';
}

export function createLayer(
  partial: Partial<PatternLayer> & Pick<PatternLayer, 'id' | 'name'>
): PatternLayer {
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
    ...rest,
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
        position: { x: -10, y: 20 },
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
  spacingGrid: 16,
  scaleX: 1,
  scaleY: 1,
} as const;
