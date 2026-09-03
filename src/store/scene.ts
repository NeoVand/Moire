import type { CameraState, PatternLayer, PatternType, Vec2 } from '../types/moire';
import { FIELD_NONE, MAX_LAYERS, PATTERN_META, createLayer } from '../types/moire';
import { TILING_IDS, type TilingId } from '../gpu/tilings';
import type { ViewState } from './project';
import {
  MOTION_NONE,
  createAnimator,
  createTiming,
  type Animator,
  type MotionDoc,
  type MotionEase,
  type MotionMode,
  type Timing,
} from '../types/motion';

/**
 * The scene file: everything a construction is, nothing the session is. A JSON
 * of the layers and the view settings round-trips a picture exactly — made for
 * sharing a construction with someone else (or a bug report) rather than
 * re-describing sliders. Parsing is forgiving about missing fields, which land
 * on the same defaults a fresh layer gets, and strict about shape: an unknown
 * layer type is an error, not a guess.
 */

export interface SceneData {
  layers: PatternLayer[];
  selectedLayerId: string | null;
  camera: CameraState;
  backgroundColor: string;
  view: Partial<ViewState>;
  /** Absent in a version-1 file, which simply has no motion in it. */
  motion?: MotionDoc;
}

// 2 added `motion`. Version-1 files load unchanged: a scene without motion is a
// scene whose knobs do not move, which is exactly what it was.
const SCENE_VERSION = 2;
const TYPES = new Set<PatternType>(PATTERN_META.map((m) => m.id));
const TILINGS = new Set<string>(TILING_IDS);

export function serializeScene(scene: SceneData): string {
  return JSON.stringify(
    {
      app: 'moire',
      version: SCENE_VERSION,
      layers: scene.layers,
      selectedLayerId: scene.selectedLayerId,
      camera: scene.camera,
      backgroundColor: scene.backgroundColor,
      view: scene.view,
      motion: scene.motion ?? MOTION_NONE,
    },
    null,
    2
  );
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function vec2(v: unknown, fallback: Vec2): Vec2 {
  const p = v as Partial<Vec2> | undefined;
  return { x: num(p?.x, fallback.x), y: num(p?.y, fallback.y) };
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function parseLayer(raw: unknown, index: number): PatternLayer {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Layer ${index + 1} is not an object.`);
  }
  const r = raw as Record<string, unknown>;
  const type = r.type as PatternType;
  if (!TYPES.has(type)) {
    throw new Error(`Layer ${index + 1} has unknown type "${String(r.type)}".`);
  }
  const base = createLayer({
    id: str(r.id, `import-${index + 1}`),
    name: str(r.name, `Layer ${index + 1}`),
    type,
  });
  const field = (r.field ?? {}) as Record<string, unknown>;
  return {
    ...base,
    visible: bool(r.visible, base.visible),
    color: str(r.color, base.color),
    position: vec2(r.position, base.position),
    rotation: num(r.rotation, base.rotation),
    opacity: num(r.opacity, base.opacity),
    spacing: num(r.spacing, base.spacing),
    thickness: num(r.thickness, base.thickness),
    phase: num(r.phase, base.phase),
    offset: vec2(r.offset, base.offset),
    rotationOffset: num(r.rotationOffset, base.rotationOffset),
    sides: num(r.sides, base.sides),
    vertexSize: num(r.vertexSize, base.vertexSize),
    drawEdges: bool(r.drawEdges, base.drawEdges),
    tileFill: num(r.tileFill, base.tileFill),
    scale: vec2(r.scale, base.scale),
    lineCount: num(r.lineCount, base.lineCount),
    bend: num(r.bend, base.bend),
    frequency: num(r.frequency, base.frequency),
    // An unknown tiling name is a forward-compatible scene, not a broken one:
    // it lands on the default rather than failing the whole load.
    tiling: TILINGS.has(String(r.tiling)) ? (r.tiling as TilingId) : base.tiling,
    field: {
      source: str(field.source, FIELD_NONE.source),
      amount: num(field.amount, FIELD_NONE.amount),
      scale: num(field.scale, FIELD_NONE.scale),
      ...(typeof field.enabled === 'boolean' ? { enabled: field.enabled } : {}),
      ...(typeof field.image === 'string' && field.image.startsWith('data:image/')
        ? { image: field.image }
        : {}),
    },
  };
}

const MODES = new Set<MotionMode>(['loop', 'bounce', 'once']);
const EASES = new Set<MotionEase>(['linear', 'in', 'out', 'inOut']);

function mode(v: unknown, fallback: MotionMode): MotionMode {
  return MODES.has(v as MotionMode) ? (v as MotionMode) : fallback;
}
function ease(v: unknown, fallback: MotionEase): MotionEase {
  return EASES.has(v as MotionEase) ? (v as MotionEase) : fallback;
}

/**
 * Motion, forgivingly. An animator whose path names a layer the file does not
 * contain is dropped rather than kept as something the motion list would show
 * and nothing would move -- the same reasoning as taking a layer's animators
 * with the layer. Anything else missing lands on a default.
 */
function parseMotion(raw: unknown, layerIds: Set<string>): MotionDoc {
  if (typeof raw !== 'object' || raw === null) return MOTION_NONE;
  const r = raw as Record<string, unknown>;

  const timings: Timing[] = (Array.isArray(r.timings) ? r.timings : [])
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map((t) =>
      createTiming({
        id: str(t.id, ''),
        name: str(t.name, 'Timing'),
        delay: num(t.delay, 0),
        period: num(t.period, 6),
        mode: mode(t.mode, 'bounce'),
        ease: ease(t.ease, 'inOut'),
      })
    );
  const timingIds = new Set(timings.map((t) => t.id));

  const animators: Animator[] = (Array.isArray(r.animators) ? r.animators : [])
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a) => {
      const path = str(a.path, '');
      const owner = path.startsWith('layer.') ? path.split('.')[1] : null;
      if (!path || (owner !== null && !layerIds.has(owner))) return null;
      const linked = str(a.timing, '');
      return createAnimator(path, {
        id: str(a.id, ''),
        from: num(a.from, 0),
        to: num(a.to, 1),
        timing: timingIds.has(linked) ? linked : null,
        delay: num(a.delay, 0),
        period: num(a.period, 6),
        mode: mode(a.mode, 'bounce'),
        ease: ease(a.ease, 'inOut'),
        phase: num(a.phase, 0),
        hold: bool(a.hold, false),
        enabled: bool(a.enabled, true),
      });
    })
    .filter((a): a is Animator => a !== null);

  return { timings, animators, playOnLoad: bool(r.playOnLoad, false) };
}

const VIEW_KEYS: (keyof ViewState)[] = [
  'envelope',
  'envelopeContrast',
  'envelopeTaps',
  'envelopeSweep',
  'envelopeLift',
  'envelopeMask',
  'envelopeSquare',
  'envelopeContours',
  'contourWidth',
  'contourBands',
  'ratio',
  'ratioBlend',
  'ratioThreshold',
];

export function parseScene(text: string): SceneData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a JSON file.');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a scene file.');
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.layers) || r.layers.length === 0) {
    throw new Error('The file has no layers.');
  }
  if (typeof r.version === 'number' && r.version > SCENE_VERSION) {
    throw new Error(`Scene version ${r.version} is newer than this build understands.`);
  }

  const layers = r.layers.slice(0, MAX_LAYERS).map(parseLayer);
  // Duplicate or colliding ids would cross-wire selection and morphs.
  const seen = new Set<string>();
  for (const layer of layers) {
    while (seen.has(layer.id)) layer.id = `${layer.id}-x`;
    seen.add(layer.id);
  }

  const camera = r.camera as Partial<CameraState> | undefined;
  const view: Partial<ViewState> = {};
  const rawView = (r.view ?? {}) as Record<string, unknown>;
  for (const key of VIEW_KEYS) {
    const v = rawView[key];
    if (key === 'envelope' || key === 'ratio' || key === 'envelopeContours' || key === 'envelopeSquare') {
      if (typeof v === 'boolean') view[key] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      view[key] = v;
    }
  }

  const wanted = str(r.selectedLayerId, '');
  return {
    layers,
    selectedLayerId: seen.has(wanted) ? wanted : (layers[0]?.id ?? null),
    camera: {
      zoom: num(camera?.zoom, 1),
      pan: vec2(camera?.pan, { x: 0, y: 0 }),
    },
    backgroundColor: str(r.backgroundColor, '#ffffff'),
    view,
    motion: parseMotion(r.motion, seen),
  };
}
