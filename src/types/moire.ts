export interface Position {
  x: number;
  y: number;
}

export interface PatternLayer {
  id: string;
  name: string;
  category: 'lines' | 'curves' | 'tiles' | 'concentric';
  type: string; // Specific pattern type within category
  visible: boolean;
  color: string;
  fillColor?: string; // Optional fill color for tiles
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
  category: 'lines' | 'curves' | 'tiles' | 'concentric';
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
    icon: 'straight-lines',
    description: 'Parallel straight lines with progressive spacing',
    defaultParameters: {
      spacing: 20,
      thickness: 1,
      phase: 0,
      offsetX: 0,
      count: 50,
      size: 800,
    },
    parameterConfig: {
      count: { label: 'Line Count', min: 1, max: 1000, step: 1, description: 'Maximum number of lines to draw' },
      spacing: { label: 'Line Spacing', min: 0, max: 100, step: 0.01, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.01, max: 50, step: 0.01, unit: 'px' },
      size: { label: 'Line Length', min: 10, max: 4000, step: 1, unit: 'px', description: 'Length of each line' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 0.01, unit: '°' },
      offsetX: { label: 'Spacing Offset', min: 0, max: 10, step: 0.01, unit: 'px', description: 'Progressive spacing increase per line' },
    },
  },
  {
    id: 'radial-lines',
    name: 'Radial',
    category: 'lines',
    icon: 'radial-lines',
    description: 'Lines radiating from center with adjustable span and offset',
    defaultParameters: {
      count: 24,
      thickness: 1,
      phase: 0,
      offsetX: 0,
      offsetY: 360,
      spacing: 0,
    },
    parameterConfig: {
      count: { label: 'Line Count', min: 3, max: 360, step: 1, description: 'Number of radial lines' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Angular Offset', min: 0, max: 360, step: 1, unit: '°' },
      spacing: { label: 'Radial Offset', min: 0, max: 200, step: 0.5, unit: 'px', description: 'Distance from center where lines start' },
      offsetY: { label: 'Angular Span', min: 10, max: 360, step: 1, unit: '°', description: 'Angular range covered by lines' },
    },
  },
  {
    id: 'sine-wave-lines',
    name: 'Sine Wave',
    category: 'lines',
    icon: 'sine-wave',
    description: 'Horizontal sine wave lines',
    defaultParameters: {
      count: 30,
      spacing: 30,
      amplitude: 15,
      wavelength: 60,
      thickness: 1.5,
      phase: 0,
      size: 800,
    },
    parameterConfig: {
      count: { label: 'Line Count', min: 1, max: 1000, step: 1, description: 'Maximum number of lines to draw' },
      spacing: { label: 'Line Spacing', min: 5, max: 300, step: 1, unit: 'px' },
      amplitude: { label: 'Wave Height', min: 1, max: 150, step: 0.5, unit: 'px' },
      wavelength: { label: 'Wave Length', min: 10, max: 500, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      size: { label: 'Line Length', min: 10, max: 4000, step: 1, unit: 'px', description: 'Length of each line' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
    },
  },
  {
    id: 'sawtooth-wave-lines',
    name: 'Sawtooth Wave',
    category: 'lines',
    icon: 'sawtooth-wave',
    description: 'Horizontal sawtooth wave lines',
    defaultParameters: {
      count: 30,
      spacing: 30,
      amplitude: 15,
      wavelength: 60,
      thickness: 1.5,
      phase: 0,
      size: 800,
    },
    parameterConfig: {
      count: { label: 'Line Count', min: 1, max: 1000, step: 1, description: 'Maximum number of lines to draw' },
      spacing: { label: 'Line Spacing', min: 5, max: 300, step: 1, unit: 'px' },
      amplitude: { label: 'Wave Height', min: 1, max: 150, step: 0.5, unit: 'px' },
      wavelength: { label: 'Wave Length', min: 10, max: 500, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      size: { label: 'Line Length', min: 10, max: 4000, step: 1, unit: 'px', description: 'Length of each line' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
    },
  },
  {
    id: 'square-wave-lines',
    name: 'Square Wave',
    category: 'lines',
    icon: 'square-wave',
    description: 'Horizontal square wave lines',
    defaultParameters: {
      count: 30,
      spacing: 30,
      amplitude: 15,
      wavelength: 60,
      thickness: 1.5,
      phase: 0,
      size: 800,
    },
    parameterConfig: {
      count: { label: 'Line Count', min: 1, max: 1000, step: 1, description: 'Maximum number of lines to draw' },
      spacing: { label: 'Line Spacing', min: 5, max: 300, step: 1, unit: 'px' },
      amplitude: { label: 'Wave Height', min: 1, max: 150, step: 0.5, unit: 'px' },
      wavelength: { label: 'Wave Length', min: 10, max: 500, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      size: { label: 'Line Length', min: 10, max: 4000, step: 1, unit: 'px', description: 'Length of each line' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
    },
  },
  {
    id: 'triangle-wave-lines',
    name: 'Triangle Wave',
    category: 'lines',
    icon: 'triangle-wave',
    description: 'Horizontal triangle wave lines',
    defaultParameters: {
      count: 30,
      spacing: 30,
      amplitude: 15,
      wavelength: 60,
      thickness: 1.5,
      phase: 0,
      size: 800,
    },
    parameterConfig: {
      count: { label: 'Line Count', min: 1, max: 1000, step: 1, description: 'Maximum number of lines to draw' },
      spacing: { label: 'Line Spacing', min: 5, max: 300, step: 1, unit: 'px' },
      amplitude: { label: 'Wave Height', min: 1, max: 150, step: 0.5, unit: 'px' },
      wavelength: { label: 'Wave Length', min: 10, max: 500, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      size: { label: 'Line Length', min: 10, max: 4000, step: 1, unit: 'px', description: 'Length of each line' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
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

  // TILES CATEGORY
  {
    id: 'triangular-tiling',
    name: 'Triangular',
    category: 'tiles',
    icon: 'triangle',
    description: 'Triangular tessellation tiling',
    defaultParameters: {
      size: 40,
      spacing: 10,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      size: { label: 'Tile Size', min: 5, max: 150, step: 1, unit: 'px', description: 'Size of individual tiles' },
      spacing: { label: 'Gap Size', min: 0, max: 50, step: 0.5, unit: 'px', description: 'Space between tiles' },
      thickness: { label: 'Stroke Width', min: 0.1, max: 10, step: 0.1, unit: 'px' },
      phase: { label: 'Rotation', min: 0, max: 360, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Horizontal shift per row' },
      offsetY: { label: 'Y Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Vertical shift per column' },
    },
  },
  {
    id: 'square-tiling',
    name: 'Square',
    category: 'tiles',
    icon: 'square',
    description: 'Square grid tiling pattern',
    defaultParameters: {
      size: 40,
      spacing: 10,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      size: { label: 'Tile Size', min: 5, max: 150, step: 1, unit: 'px', description: 'Size of individual tiles' },
      spacing: { label: 'Gap Size', min: 0, max: 50, step: 0.5, unit: 'px', description: 'Space between tiles' },
      thickness: { label: 'Stroke Width', min: 0.1, max: 10, step: 0.1, unit: 'px' },
      phase: { label: 'Rotation', min: 0, max: 45, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Horizontal shift per row' },
      offsetY: { label: 'Y Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Vertical shift per column' },
    },
  },
  {
    id: 'rhombus-tiling',
    name: 'Rhombus',
    category: 'tiles',
    icon: 'rhombus',
    description: 'Diamond-shaped rhombus tiling',
    defaultParameters: {
      size: 40,
      spacing: 10,
      thickness: 1.5,
      phase: 1.5,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      size: { label: 'Tile Size', min: 5, max: 150, step: 1, unit: 'px', description: 'Size of individual tiles' },
      spacing: { label: 'Gap Size', min: 0, max: 50, step: 0.5, unit: 'px', description: 'Space between tiles' },
      thickness: { label: 'Stroke Width', min: 0.1, max: 10, step: 0.1, unit: 'px' },
      phase: { label: 'Aspect Ratio', min: 0.5, max: 3, step: 0.1, description: 'Width to height ratio' },
      offsetX: { label: 'X Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Horizontal shift per row' },
      offsetY: { label: 'Y Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Vertical shift per column' },
    },
  },
  {
    id: 'hexagonal-tiling',
    name: 'Hexagonal',
    category: 'tiles',
    icon: 'hexagon',
    description: 'Honeycomb hexagonal tiling',
    defaultParameters: {
      size: 40,
      spacing: 10,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      size: { label: 'Tile Size', min: 5, max: 150, step: 1, unit: 'px', description: 'Size of individual tiles' },
      spacing: { label: 'Gap Size', min: 0, max: 50, step: 0.5, unit: 'px', description: 'Space between tiles' },
      thickness: { label: 'Stroke Width', min: 0.1, max: 10, step: 0.1, unit: 'px' },
      phase: { label: 'Rotation', min: 0, max: 60, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Horizontal shift per row' },
      offsetY: { label: 'Y Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Vertical shift per column' },
    },
  },
  {
    id: 'circle-packing',
    name: 'Circle Packing',
    category: 'tiles',
    icon: 'circle',
    description: 'Hexagonal circle packing pattern',
    defaultParameters: {
      size: 40,
      spacing: 10,
      thickness: 1.5,
      phase: 0.8,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      size: { label: 'Grid Size', min: 5, max: 150, step: 1, unit: 'px', description: 'Size of grid cells' },
      spacing: { label: 'Gap Size', min: 0, max: 50, step: 0.5, unit: 'px', description: 'Space between circles' },
      thickness: { label: 'Stroke Width', min: 0.1, max: 10, step: 0.1, unit: 'px' },
      phase: { label: 'Circle Size', min: 0.1, max: 1, step: 0.05, description: 'Circle size relative to grid cell' },
      offsetX: { label: 'X Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Horizontal shift per row' },
      offsetY: { label: 'Y Offset', min: -50, max: 50, step: 0.5, unit: 'px', description: 'Vertical shift per column' },
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
      count: 160,
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
      count: 160,
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