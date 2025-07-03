export interface Position {
  x: number;
  y: number;
}

export interface PatternLayer {
  id: string;
  name: string;
  category: 'lines' | 'curves' | 'grids' | 'concentric';
  type: string; // Specific pattern type within category
  visible: boolean;
  color: string;
  position: Position;
  rotation: number;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'darken' | 'lighten' | 'difference' | 'exclusion';
  locked: boolean;
  
  // Pattern-specific parameters
  parameters: {
    spacing?: number;      // Distance between elements (universal)
    thickness?: number;    // Line/stroke thickness (universal)
    amplitude?: number;    // For waves, curves
    wavelength?: number;   // For waves, periodic patterns
    turns?: number;        // For spirals
    density?: number;      // For noise, scattered patterns
    size?: number;         // For shape-based patterns
    angle?: number;        // For directional patterns
    count?: number;        // Number of elements (for radial, concentric)
    phase?: number;        // Phase offset (universal)
    offsetX?: number;      // X offset accumulation for concentric patterns
    offsetY?: number;      // Y offset accumulation for concentric patterns
  };
}

// Pattern definitions organized by category
export interface PatternDefinition {
  id: string;
  name: string;
  category: 'lines' | 'curves' | 'grids' | 'concentric';
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
    name: 'Straight',
    category: 'lines',
    icon: 'minus',
    description: 'Parallel straight lines',
    defaultParameters: {
      spacing: 20,
      thickness: 1,
      phase: 0,
    },
    parameterConfig: {
      spacing: { label: 'Spacing', min: 2, max: 200, step: 0.5, unit: 'px' },
      thickness: { label: 'Thickness', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Phase', min: 0, max: 360, step: 1, unit: '°' },
    },
  },
  {
    id: 'radial-lines',
    name: 'Radial',
    category: 'lines',
    icon: 'star',
    description: 'Lines radiating from center',
    defaultParameters: {
      count: 24,
      thickness: 1,
      phase: 0,
    },
    parameterConfig: {
      count: { label: 'Count', min: 3, max: 100, step: 1, description: 'Number of radial lines' },
      thickness: { label: 'Thickness', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Phase', min: 0, max: 360, step: 1, unit: '°' },
    },
  },

  // CURVES CATEGORY
  {
    id: 'sine-waves',
    name: 'Sine Waves',
    category: 'curves',
    icon: 'wave',
    description: 'Smooth sine wave curves',
    defaultParameters: {
      spacing: 40,
      amplitude: 20,
      wavelength: 80,
      thickness: 1.5,
      phase: 0,
    },
    parameterConfig: {
      spacing: { label: 'Line Spacing', min: 5, max: 500, step: 1, unit: 'px' },
      amplitude: { label: 'Wave Height', min: 1, max: 200, step: 0.5, unit: 'px' },
      wavelength: { label: 'Wave Length', min: 10, max: 1000, step: 1, unit: 'px' },
      thickness: { label: 'Thickness', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Phase', min: 0, max: 360, step: 1, unit: '°' },
    },
  },
  {
    id: 'spiral',
    name: 'Spiral',
    category: 'curves',
    icon: 'spiral',
    description: 'Logarithmic spiral curve',
    defaultParameters: {
      turns: 8,
      spacing: 5,
      thickness: 1.5,
      phase: 0,
    },
    parameterConfig: {
      turns: { label: 'Turns', min: 1, max: 100, step: 0.1, description: 'Number of spiral turns' },
      spacing: { label: 'Turn Spacing', min: 0.5, max: 50, step: 0.1, unit: 'px' },
      thickness: { label: 'Thickness', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Phase', min: 0, max: 360, step: 1, unit: '°' },
    },
  },

  // GRIDS CATEGORY
  {
    id: 'rectangular-grid',
    name: 'Rectangular',
    category: 'grids',
    icon: 'grid',
    description: 'Square or rectangular grid pattern',
    defaultParameters: {
      spacing: 30,
      thickness: 1,
      phase: 0,
    },
    parameterConfig: {
      spacing: { label: 'Grid Size', min: 2, max: 500, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Offset', min: 0, max: 100, step: 1, unit: '%' },
    },
  },
  {
    id: 'hexagonal-grid',
    name: 'Hexagonal',
    category: 'grids',
    icon: 'hexagon',
    description: 'Honeycomb hexagonal grid pattern',
    defaultParameters: {
      spacing: 40,
      thickness: 1,
      phase: 0,
    },
    parameterConfig: {
      spacing: { label: 'Hex Size', min: 5, max: 500, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Rotation', min: 0, max: 60, step: 1, unit: '°' },
    },
  },
  {
    id: 'triangular-grid',
    name: 'Triangular',
    category: 'grids',
    icon: 'triangle',
    description: 'Triangular tessellation pattern',
    defaultParameters: {
      spacing: 35,
      thickness: 1,
      phase: 0,
    },
    parameterConfig: {
      spacing: { label: 'Triangle Size', min: 5, max: 500, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Orientation', min: 0, max: 180, step: 1, unit: '°' },
    },
  },

  // CONCENTRIC CATEGORY
  {
    id: 'concentric-triangles',
    name: 'Triangles',
    category: 'concentric',
    icon: 'triangle',
    description: 'Concentric triangular rings',
    defaultParameters: {
      spacing: 25,
      thickness: 1.5,
      count: 10,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Rotation', min: 0, max: 120, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
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
      count: 12,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Start Size', min: 0, max: 500, step: 1, unit: 'px' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
    },
  },
  {
    id: 'concentric-rhombus',
    name: 'Rhombus',
    category: 'concentric',
    icon: 'rhombus',
    description: 'Concentric rhombus rings with adjustable aspect ratio',
    defaultParameters: {
      spacing: 24,
      thickness: 1.5,
      count: 10,
      phase: 1.5,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Aspect Ratio', min: 0.1, max: 10, step: 0.1, description: 'Width to height ratio' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
    },
  },
  {
    id: 'concentric-pentagons',
    name: 'Pentagons',
    category: 'concentric',
    icon: 'pentagon',
    description: 'Concentric pentagonal rings',
    defaultParameters: {
      spacing: 24,
      thickness: 1.5,
      count: 8,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Rotation', min: 0, max: 72, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
    },
  },
  {
    id: 'concentric-hexagons',
    name: 'Hexagons',
    category: 'concentric',
    icon: 'hexagon',
    description: 'Concentric hexagonal rings',
    defaultParameters: {
      spacing: 22,
      thickness: 1.5,
      count: 10,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Rotation', min: 0, max: 60, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
    },
  },
  {
    id: 'concentric-circles',
    name: 'Circles',
    category: 'concentric',
    icon: 'circle',
    description: 'Concentric circular rings',
    defaultParameters: {
      spacing: 20,
      thickness: 1.5,
      count: 15,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Start Radius', min: 0, max: 500, step: 1, unit: 'px' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
    },
  },
  {
    id: 'concentric-ellipses',
    name: 'Ellipses',
    category: 'concentric',
    icon: 'ellipse',
    description: 'Concentric elliptical rings',
    defaultParameters: {
      spacing: 18,
      thickness: 1.5,
      count: 12,
      phase: 1.5,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Aspect Ratio', min: 0.1, max: 10, step: 0.1, description: 'Width to height ratio' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
    },
  },
  {
    id: 'concentric-stars-5',
    name: '5-Point Stars',
    category: 'concentric',
    icon: 'star5',
    description: 'Concentric 5-pointed star rings',
    defaultParameters: {
      spacing: 22,
      thickness: 1.5,
      count: 8,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      spacing: { label: 'Ring Spacing', min: 1, max: 100, step: 0.5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      count: { label: 'Ring Count', min: 2, max: 200, step: 1 },
      phase: { label: 'Rotation', min: 0, max: 72, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per ring' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per ring' },
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
  const defaultLayer: PatternLayer = {
    id: '1',
    name: 'Layer 1',
    category: 'lines',
    type: 'straight-lines',
    visible: true,
    color: '#000000',
    position: { x: 0, y: 0 },
    rotation: 0,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    parameters: {
      spacing: 20,
      thickness: 1,
      phase: 0,
    },
  };

  return {
    id: 'default',
    name: 'Untitled Project',
    layers: [defaultLayer],
    selectedLayerId: '1',
    canvas: {
      zoom: 1,
      pan: { x: 0, y: 0 },
      backgroundColor: '#ffffff',
    },
  };
} 