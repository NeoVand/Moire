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
    radius?: number;       // For circle-based curves (cycloid, epitrochoid)
    xFunction?: string;    // Custom X function for parametric curves
    yFunction?: string;    // Custom Y function for parametric curves
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
    id: 'sine-wave-curves',
    name: 'Sine Wave',
    category: 'curves',
    icon: 'sine-wave',
    description: 'Family of sine wave curves with offset effects',
    defaultParameters: {
      count: 25,
      spacing: 40,
      amplitude: 20,
      wavelength: 80,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
    },
    parameterConfig: {
      count: { label: 'Curve Count', min: 1, max: 200, step: 1, description: 'Number of sine wave curves' },
      spacing: { label: 'Curve Spacing', min: 5, max: 500, step: 1, unit: 'px' },
      amplitude: { label: 'Wave Height', min: 1, max: 200, step: 0.5, unit: 'px' },
      wavelength: { label: 'Wave Length', min: 10, max: 1000, step: 1, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -50, max: 50, step: 0.1, unit: 'px', description: 'Progressive X displacement per curve' },
      offsetY: { label: 'Y Offset', min: -50, max: 50, step: 0.1, unit: 'px', description: 'Progressive Y displacement per curve' },
    },
  },
  {
    id: 'spiral-curves',
    name: 'Spiral',
    category: 'curves',
    icon: 'spiral',
    description: 'Family of spiral curves with radial offset and progressive effects',
    defaultParameters: {
      count: 6,
      spacing: 15,
      turns: 8,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
      size: 0,
    },
    parameterConfig: {
      count: { label: 'Spiral Count', min: 1, max: 20, step: 1, description: 'Number of spiral curves' },
      spacing: { label: 'Spiral Spacing', min: 5, max: 100, step: 1, unit: 'px', description: 'Radial distance between spirals' },
      turns: { label: 'Turns', min: 1, max: 50, step: 0.1, description: 'Number of spiral turns' },
      thickness: { label: 'Line Width', min: 0.1, max: 20, step: 0.1, unit: 'px' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
      size: { label: 'Radial Offset', min: 0, max: 200, step: 1, unit: 'px', description: 'Distance from center where spiral starts' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per spiral' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per spiral' },
    },
  },
  {
    id: 'cycloid-curves',
    name: 'Cycloid',
    category: 'curves',
    icon: 'cycloid',
    description: 'Rolling circle curves with adjustable parameters',
    defaultParameters: {
      count: 15,
      spacing: 50,
      radius: 20,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
      size: 3,
    },
    parameterConfig: {
      count: { label: 'Curve Count', min: 1, max: 50, step: 1, description: 'Number of cycloid curves' },
      spacing: { label: 'Curve Spacing', min: 10, max: 200, step: 1, unit: 'px' },
      radius: { label: 'Circle Radius', min: 5, max: 100, step: 1, unit: 'px' },
      size: { label: 'Rolling Distance', min: 0.5, max: 10, step: 0.1, description: 'How far the circle rolls' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive X displacement per curve' },
      offsetY: { label: 'Y Offset', min: -20, max: 20, step: 0.1, unit: 'px', description: 'Progressive Y displacement per curve' },
    },
  },
  {
    id: 'epitrochoid-curves',
    name: 'Epitrochoid',
    category: 'curves',
    icon: 'epitrochoid',
    description: 'Roulette curves created by circle rolling around another circle',
    defaultParameters: {
      count: 8,
      spacing: 25,
      radius: 30,
      thickness: 1.5,
      phase: 1.5,
      offsetX: 0,
      offsetY: 0,
      size: 15,
    },
    parameterConfig: {
      count: { label: 'Curve Count', min: 1, max: 30, step: 1, description: 'Number of epitrochoid curves' },
      spacing: { label: 'Curve Spacing', min: 10, max: 150, step: 1, unit: 'px' },
      radius: { label: 'Base Circle', min: 10, max: 100, step: 1, unit: 'px' },
      size: { label: 'Rolling Circle', min: 5, max: 80, step: 1, unit: 'px' },
      phase: { label: 'Point Distance', min: 0.5, max: 3, step: 0.1, description: 'Distance from rolling circle center' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      offsetX: { label: 'X Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive X displacement per curve' },
      offsetY: { label: 'Y Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive Y displacement per curve' },
    },
  },
  {
    id: 'lissajous-curves',
    name: 'Lissajous',
    category: 'curves',
    icon: 'lissajous',
    description: 'Parametric curves with harmonic motion in X and Y',
    defaultParameters: {
      count: 12,
      spacing: 30,
      amplitude: 25,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
      size: 2,
    },
    parameterConfig: {
      count: { label: 'Curve Count', min: 1, max: 40, step: 1, description: 'Number of Lissajous curves' },
      spacing: { label: 'Curve Spacing', min: 10, max: 150, step: 1, unit: 'px' },
      amplitude: { label: 'Amplitude', min: 5, max: 150, step: 1, unit: 'px' },
      size: { label: 'Frequency Ratio', min: 0.5, max: 5, step: 0.1, description: 'Y frequency / X frequency' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      offsetX: { label: 'X Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive X displacement per curve' },
      offsetY: { label: 'Y Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive Y displacement per curve' },
    },
  },
  {
    id: 'hyperbola-curves',
    name: 'Hyperbola',
    category: 'curves',
    icon: 'hyperbola',
    description: 'Hyperbolic curves with adjustable eccentricity',
    defaultParameters: {
      count: 10,
      spacing: 35,
      amplitude: 20,
      thickness: 1.5,
      phase: 1.5,
      offsetX: 0,
      offsetY: 0,
      size: 50,
    },
    parameterConfig: {
      count: { label: 'Curve Count', min: 1, max: 30, step: 1, description: 'Number of hyperbola curves' },
      spacing: { label: 'Curve Spacing', min: 10, max: 200, step: 1, unit: 'px' },
      amplitude: { label: 'Scale Factor', min: 5, max: 100, step: 1, unit: 'px' },
      phase: { label: 'Eccentricity', min: 1.1, max: 5, step: 0.1, description: 'Shape of hyperbola' },
      size: { label: 'Center Distance', min: 10, max: 200, step: 1, unit: 'px', description: 'Distance between hyperbola centers' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      offsetX: { label: 'X Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive X displacement per curve' },
      offsetY: { label: 'Y Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive Y displacement per curve' },
    },
  },
  {
    id: 'catenary-curves',
    name: 'Catenary',
    category: 'curves',
    icon: 'catenary',
    description: 'Hanging chain curves with natural droop',
    defaultParameters: {
      count: 15,
      spacing: 40,
      amplitude: 30,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
      size: 200,
    },
    parameterConfig: {
      count: { label: 'Curve Count', min: 1, max: 50, step: 1, description: 'Number of catenary curves' },
      spacing: { label: 'Curve Spacing', min: 10, max: 200, step: 1, unit: 'px' },
      amplitude: { label: 'Chain Tension', min: 5, max: 150, step: 1, unit: 'px', description: 'Lower values = more sag' },
      size: { label: 'Chain Length', min: 50, max: 500, step: 5, unit: 'px' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
      offsetX: { label: 'X Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive X displacement per curve' },
      offsetY: { label: 'Y Offset', min: -30, max: 30, step: 0.1, unit: 'px', description: 'Progressive Y displacement per curve' },
    },
  },
  {
    id: 'parametric-curves',
    name: 'Parametric',
    category: 'curves',
    icon: 'parametric',
    description: 'User-defined parametric curves using JavaScript functions',
    defaultParameters: {
      count: 10,
      spacing: 40,
      amplitude: 50,
      thickness: 1.5,
      phase: 0,
      offsetX: 0,
      offsetY: 0,
      size: 100,
      xFunction: 'return amplitude * (1 + n * 0.1) * Math.cos(t + phase);',
      yFunction: 'return amplitude * (1 + n * 0.1) * Math.sin(t + phase);',
    },
    parameterConfig: {
      count: { label: 'Curve Count', min: 1, max: 100, step: 1, description: 'Number of parametric curves (n parameter)' },
      spacing: { label: 'Resolution', min: 50, max: 2000, step: 10, description: 'Number of points per curve' },
      amplitude: { label: 'Scale Factor', min: 1, max: 200, step: 1, unit: 'px' },
      size: { label: 'Parameter Range', min: 10, max: 500, step: 5, description: 'Range of t parameter' },
      phase: { label: 'Phase Offset', min: 0, max: 360, step: 1, unit: '°' },
      thickness: { label: 'Line Width', min: 0.1, max: 15, step: 0.1, unit: 'px' },
      offsetX: { label: 'X Offset', min: -50, max: 50, step: 0.1, unit: 'px', description: 'Progressive X displacement per curve' },
      offsetY: { label: 'Y Offset', min: -50, max: 50, step: 0.1, unit: 'px', description: 'Progressive Y displacement per curve' },
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