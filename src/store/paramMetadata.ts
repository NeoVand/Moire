import type { PatternLayer } from '../types/moire';

export interface ParamDescriptor {
  path: string;
  label: string;
  /** Ranges and steps are in display units. Animator endpoints are stored units. */
  min: number;
  max: number;
  step: number;
  unit?: string;
  quantize?: 'int';
  display?: number;
  /** A verified visual period, in stored units. Only whole-layer rotation and wave phase. */
  period?: number;
}

type Knob = Omit<ParamDescriptor, 'path'>;
const knob = (label: string, min: number, max: number, step: number, extra: Partial<Knob> = {}): Knob =>
  ({ label, min, max, step, ...extra });

const VIEW: Record<string, Knob> = {
  envelopeContrast: knob('Contrast', 1, 12, 0.1),
  envelopeSweep: knob('Sweep', 0, 3, 0.05),
  envelopeLift: knob('Exposure', -0.5, 0.5, 0.01),
  envelopeTaps: knob('Quality', 4, 64, 1, { unit: ' taps', quantize: 'int' }),
  envelopeMask: knob('Mask', 0, 1, 0.05),
  contourWidth: knob('Width', 0.5, 4, 0.1, { unit: ' px' }),
  contourBands: knob('Bands', 0, 1, 0.05),
  ratioBlend: knob('Overlay', 0.2, 1, 0.01),
  ratioThreshold: knob('Threshold', 0.05, 0.6, 0.01),
};

const LAYER: Record<string, Knob> = {
  thickness: knob('Thickness', 0.01, 20, 0.01),
  spacing: knob('Spacing', 1, 120, 0.1),
  lineCount: knob('Count', 2, 360, 1, { quantize: 'int' }),
  frequency: knob('Frequency', 0.1, 8, 0.01),
  'position.x': knob('X', -400, 400, 0.1),
  'position.y': knob('Y', -400, 400, 0.1),
  rotation: knob('Rotation', -180, 180, 0.1, { unit: '°', period: 360 }),
  'scale.x': knob('Scale X', 0.2, 5, 0.01),
  'scale.y': knob('Scale Y', 0.2, 5, 0.01),
  vertexSize: knob('Vertices', 0, 16, 0.1),
  tileFill: knob('Fill', 0, 1, 0.01),
  'offset.x': knob('Offset X', -4, 4, 0.01),
  'offset.y': knob('Offset Y', -4, 4, 0.01),
  rotationOffset: knob('Rot offset', -0.2, 0.2, 0.001, { unit: ' rad' }),
  sides: knob('Sides', 3, 16, 1, { quantize: 'int' }),
  opacity: knob('Opacity', 0, 1, 0.01),
  'field.soften': knob('Edges', 0, 4, 0.1),
};

/**
 * Document metadata must also exist before a layer's controls have ever mounted.
 * Mounted controls can supply their exact presentation in params.ts; these
 * fallbacks keep saved motions editable when their owning panel is closed.
 */
export function describeParam(path: string, layers: PatternLayer[]): ParamDescriptor | undefined {
  const [owner, id, ...rest] = path.split('.');
  if (owner === 'view') return VIEW[id] ? { path, ...VIEW[id] } : undefined;
  if (owner === 'camera') {
    const key = [id, ...rest].join('.');
    const d = key === 'zoom' ? knob('Zoom', 0.1, 10, 0.01)
      : key === 'pan.x' ? knob('Pan X', -400, 400, 0.1)
        : key === 'pan.y' ? knob('Pan Y', -400, 400, 0.1) : undefined;
    return d ? { path, ...d } : undefined;
  }
  if (owner !== 'layer') return undefined;
  const layer = layers.find((l) => l.id === id);
  if (!layer) return undefined;
  const key = rest.join('.');
  let d = LAYER[key];
  if (key === 'phase') {
    d = layer.type === 'curve-wave'
      ? knob('Phase', 0, 360, 0.1, { unit: '°', display: 180 / Math.PI, period: Math.PI * 2 })
      : layer.type.startsWith('concentric-') || layer.type === 'radial-lines'
        ? knob('Start', 0, 400, 1)
        : knob('Phase', 0, Math.max(layer.spacing, 1), 1);
  } else if (key === 'bend') {
    d = layer.type === 'curve-wave' ? knob('Amplitude', 0, 80, 0.1)
      : layer.type === 'curve-parabola' ? knob('Bend', -8, 8, 0.01)
        : knob('Pitch', -80, 80, 0.1);
  } else if (key === 'offset.x' && layer.type === 'straight-lines') {
    d = knob('Progressive', -8, 8, 0.01);
  } else if (key === 'field.amount') {
    d = layer.field?.image ? knob('Shift', 0, 2, 0.05) : knob('Amount', -40, 40, 0.1);
  } else if (key === 'field.scale') {
    d = knob('Extent', 8, layer.field?.image ? 2400 : 600, 1);
  }
  return d ? { path, ...d } : undefined;
}

export function displayValue(value: number, desc: ParamDescriptor): number {
  return value * (desc.display ?? 1);
}

export function storedValue(value: number, desc: ParamDescriptor): number {
  const raw = value / (desc.display ?? 1);
  return desc.quantize === 'int' ? Math.round(raw) : raw;
}

/** A small move from the current pose, in stored units, with no forced sign flip. */
export function suggestedInterval(value: number, desc: ParamDescriptor): { from: number; to: number } {
  const from = displayValue(value, desc);
  const distance = Math.min((desc.max - desc.min) * 0.05,
    Math.max(desc.step * 10, Math.abs(from) * 0.25));
  const direction = desc.period || from + distance <= desc.max ? 1 : -1;
  const to = desc.period ? from + distance
    : Math.min(desc.max, Math.max(desc.min, from + direction * distance));
  return { from: value, to: storedValue(to, desc) };
}
