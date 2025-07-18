export interface Position {
  x: number;
  y: number;
}

export interface PatternLayer {
  id: string;
  name: string;
  category: 'lines' | 'concentric';
  type: string; // Specific pattern type within category
  visible: boolean;
  color: string;
  position: Position;
  rotation: number;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'darken' | 'lighten' | 'difference' | 'exclusion';
  locked: boolean;
  
  // Pattern-specific parameters - simplified to only what works
  parameters: {
    spacing?: number;      // Distance between elements (universal)
    thickness?: number;    // Line/stroke thickness (universal)
    phase?: number;        // Phase offset (universal)
    offsetX?: number;      // Progressive X offset for moiré effects
    offsetY?: number;      // Progressive Y offset for moiré effects
    rotationOffset?: number; // Progressive rotation offset for spiral effects
    count?: number;        // Number of elements (for shapes with limited count)
    size?: number;         // Size parameter for specific patterns
  };
}

// Pattern definitions organized by category
export interface PatternDefinition {
  id: string;
  name: string;
  category: 'lines' | 'concentric';
  icon: string; // Icon identifier
  description: string;
  defaultParameters: PatternLayer['parameters'];
  parameterConfig: {
    [key: string]: {
      label: string;
      min: number;
      max: number;
      step: number;
      unit?: string;
      description?: string;
    };
  };
}

export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  // LINES CATEGORY
  {
    id: 'straight-lines',
    name: 'Straight Lines',
    category: 'lines',
    icon: 'straight-lines',
    description: 'Parallel straight lines - the classic pattern for moiré interference',
    defaultParameters: {
      spacing: 20,
      thickness: 1,
      phase: 0,
      offsetX: 0,
    },
    parameterConfig: {
      spacing: { label: 'Line Spacing', min: 1, max: 200, step: 0.1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
      offsetX: { label: 'Progressive Offset', min: -10, max: 10, step: 0.01, unit: 'px', description: 'Creates progressive spacing changes' },
    },
  },

  // CONCENTRIC CATEGORY
  {
    id: 'concentric-circles',
    name: 'Circles',
    category: 'concentric',
    icon: 'circle',
    description: 'Concentric circular rings - perfect for stunning moiré interference',
    defaultParameters: {
      spacing: 20,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
      rotationOffset: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Start Radius', min: 0, max: 500, step: 1, unit: 'px', description: 'Radius of the innermost circle' },
      offsetX: { label: 'X Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive X displacement for moiré effects' },
      offsetY: { label: 'Y Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive Y displacement for moiré effects' },
      rotationOffset: { label: 'Rotation Offset', min: -0.2, max: 0.2, step: 0.001, unit: 'rad', description: 'Progressive rotation for spiral moiré effects' },
    },
  },
  {
    id: 'concentric-squares',
    name: 'Squares',
    category: 'concentric',
    icon: 'square',
    description: 'Concentric square rings',
    defaultParameters: {
      spacing: 25,
      thickness: 1.5,
      phase: 10,
      offsetX: 0,
      offsetY: 0,
      rotationOffset: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Start Size', min: 0, max: 500, step: 1, unit: 'px', description: 'Size of the innermost square' },
      offsetX: { label: 'X Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive X displacement for moiré effects' },
      offsetY: { label: 'Y Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive Y displacement for moiré effects' },
      rotationOffset: { label: 'Rotation Offset', min: -0.2, max: 0.2, step: 0.001, unit: 'rad', description: 'Progressive rotation for spiral moiré effects' },
    },
  },
  {
    id: 'concentric-triangles',
    name: 'Triangles',
    category: 'concentric',
    icon: 'triangle',
    description: 'Concentric triangular rings',
    defaultParameters: {
      spacing: 25,
      thickness: 1.5,
      phase: 10,
      offsetX: 0,
      offsetY: 0,
      rotationOffset: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Start Size', min: 0, max: 500, step: 1, unit: 'px', description: 'Size of the innermost triangle' },
      offsetX: { label: 'X Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive X displacement for moiré effects' },
      offsetY: { label: 'Y Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive Y displacement for moiré effects' },
      rotationOffset: { label: 'Rotation Offset', min: -0.2, max: 0.2, step: 0.001, unit: 'rad', description: 'Progressive rotation for spiral moiré effects' },
    },
  },
  {
    id: 'concentric-polygons',
    name: 'Polygons',
    category: 'concentric',
    icon: 'hexagon',
    description: 'Concentric polygon rings - customize the number of sides',
    defaultParameters: {
      spacing: 25,
      thickness: 1.5,
      phase: 10,
      offsetX: 0,
      offsetY: 0,
      rotationOffset: 0,
      count: 6, // Number of sides (hexagon by default)
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Start Size', min: 0, max: 500, step: 1, unit: 'px', description: 'Size of the innermost polygon' },
      count: { label: 'Number of Sides', min: 3, max: 20, step: 1, description: 'Triangle=3, Square=4, Pentagon=5, Hexagon=6, etc.' },
      offsetX: { label: 'X Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive X displacement for moiré effects' },
      offsetY: { label: 'Y Offset', min: -3, max: 3, step: 0.01, unit: 'px', description: 'Progressive Y displacement for moiré effects' },
      rotationOffset: { label: 'Rotation Offset', min: -0.2, max: 0.2, step: 0.001, unit: 'rad', description: 'Progressive rotation for spiral moiré effects' },
    },
  },
];

export interface MoireProject {
  id: string;
  name: string;
  layers: PatternLayer[];
  selectedLayerId: string | null;
  canvas: {
    zoom: number;
    pan: Position;
    backgroundColor: string;
  };
}

export function createDefaultProject(): MoireProject {
  const layer1: PatternLayer = {
    id: '1',
    name: 'Layer 1',
    category: 'concentric',
    type: 'concentric-circles',
    visible: true,
    color: '#000000',
    position: { x: -10, y: 20 },
    rotation: 50.0,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    parameters: {
      spacing: 6.0,
      thickness: 3.5,
      phase: 0,
      offsetX: 0,
      offsetY: -0.5,
    },
  };

  const layer2: PatternLayer = {
    id: '2',
    name: 'Layer 2',
    category: 'concentric',
    type: 'concentric-circles',
    visible: true,
    color: '#000000',
    position: { x: 10, y: -20 },
    rotation: -5.8,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    parameters: {
      spacing: 6.0,
      thickness: 3.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0.5,
    },
  };

  return {
    id: 'default',
    name: 'Untitled Project',
    layers: [layer1, layer2],
    selectedLayerId: '1',
    canvas: {
      zoom: 1,
      pan: { x: 0, y: 0 },
      backgroundColor: '#66ccff',
    },
  };
} 