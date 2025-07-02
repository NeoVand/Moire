export interface PatternLayer {
  id: string;
  name: string;
  type: 'lines' | 'circles' | 'radial' | 'dots' | 'checkerboard' | 'hexagonal';
  rotation: number;
  frequency: number;
  phase: number;
  position: { x: number; y: number }; // Translation/offset controls
  thickness: number; // Line/stroke thickness
  fillMode: 'stroke' | 'fill' | 'both'; // How to render the pattern
  color: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface Resolution {
  label: string;
  width: number;
  height: number;
}

export interface MoireProject {
  id: string;
  name: string;
  layers: PatternLayer[];
  selectedLayerId: string | null;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
    zoom: number; // Zoom level for display
    pan: { x: number; y: number }; // Pan position
  };
}

export interface ControlsState {
  activeLayer: PatternLayer | null;
  isAnimating: boolean;
  animationSpeed: number;
}

export const createDefaultLayer = (id: string, type: PatternLayer['type'] = 'lines'): PatternLayer => ({
  id,
  name: `Layer ${id}`,
  type,
  rotation: 0,
  frequency: 20,
  phase: 0,
  position: { x: 0, y: 0 }, // Default center position
  thickness: 1,
  fillMode: 'stroke',
  color: '#000000',
  opacity: 1,
  visible: true,
  locked: false,
});

export const createDefaultProject = (): MoireProject => ({
  id: 'default',
  name: 'Untitled Pattern',
  layers: [
    createDefaultLayer('1', 'lines'),
    { ...createDefaultLayer('2', 'lines'), rotation: 5 }, // Slight rotation for Moiré effect
  ],
  selectedLayerId: '1',
  canvas: {
    width: 800,
    height: 600,
    backgroundColor: '#f8f9fa', // Light gray that works in both themes
    zoom: 1, // 100% zoom
    pan: { x: 0, y: 0 },
  },
}); 