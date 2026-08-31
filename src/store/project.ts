import { create } from 'zustand';
import type { CameraState, PatternLayer, PatternType, Vec2 } from '../types/moire';
import {
  ENVELOPE_TAPS,
  MAX_LAYERS,
  createDefaultProject,
  createIntroMotion,
  createLayer,
  defaultBend,
  defaultCurveSpacing,
  isCurves,
  isGrid,
  isLines,
} from '../types/moire';
import { clampZoom } from '../gpu/camera';
import { beginLayerMorph, endLayerMorph } from '../gpu/typeMorph';
import type { SceneData } from './scene';
import { writeParamInto } from './params';
import {
  MOTION_NONE,
  scheduleOf,
  type Animator,
  type MotionDoc,
  type Timing,
} from '../types/motion';

export type LayerPatch = Omit<Partial<PatternLayer>, 'position' | 'offset' | 'scale'> & {
  position?: Partial<Vec2>;
  offset?: Partial<Vec2>;
  scale?: Partial<Vec2>;
};

/**
 * How the frame is shown, not what is in it. The envelope is the mean ink of the
 * same fields over one period of their common phase — the fringe system on its
 * own, with the carrier gone. It averages phase, not space, so it blurs nothing.
 */
export interface ViewState {
  envelope: boolean;
  /** Gain about the stack's nominal coverage. 1 shows the average untouched. */
  envelopeContrast: number;
  /** Quadrature taps per pixel. More is smoother; two dozen is exact in practice. */
  envelopeTaps: number;
  /**
   * How many of each family's own periods the average spans. 1 removes the
   * carrier exactly; below 1 it fades back in, so the slider crossfades between
   * the pattern and its fringe field; above 1 higher-order beats smooth away too.
   */
  envelopeSweep: number;
  /** Flat exposure shift after the contrast expansion, in coverage units. */
  envelopeLift: number;
  /**
   * Fade the envelope to its pivot where the heterodyne ratio passes 1/4 and no
   * fringe can exist -- there the mean is a faithful but carrier-fine Phi(D).
   * Off by default: the raw mean is the honest view, and the fine structure is
   * often the interesting part. 1 masks fully.
   */
  envelopeMask: number;
  /**
   * Draw the winning character's integer level sets over the envelope: the
   * fringe centres as one-pixel curves, the skeleton the character-hills
   * figure lifts into 3D. Fades out of the fringe regime with the ratio
   * threshold.
   */
  envelopeContours: boolean;
  /** Contour stroke width in screen pixels. */
  contourWidth: number;
  /**
   * The widened companion to the stroke: a soft fill measured in index units,
   * so on screen it spans the actual fringe width, expanding where the
   * character runs flat. 0 is off.
   */
  contourBands: number;
  /**
   * The heterodyne ratio map: where a fringe can form at all. Dark where the two
   * topmost comparable layers' index gradients nearly agree, bright past the 1/4
   * threshold where the carriers are too different to interfere — so an author
   * sees where fringes will live before committing to parameters.
   */
  ratio: boolean;
  /** How much of the map covers the drawing: 1 replaces it, less overlays. */
  ratioBlend: number;
  /** The map's marked boundary. 1/4 is the theory's line. */
  ratioThreshold: number;
}

export const VIEW_DEFAULTS: ViewState = {
  envelope: false,
  envelopeContrast: 3,
  envelopeTaps: ENVELOPE_TAPS,
  envelopeSweep: 1,
  envelopeLift: 0,
  envelopeMask: 0,
  envelopeContours: false,
  contourWidth: 1.6,
  contourBands: 0.4,
  ratio: false,
  ratioBlend: 1,
  ratioThreshold: 0.25,
};

export interface ProjectStore {
  layers: PatternLayer[];
  selectedLayerId: string | null;
  camera: CameraState;
  backgroundColor: string;
  view: ViewState;
  selectLayer: (id: string | null) => void;
  updateLayer: (id: string, patch: LayerPatch) => void;
  toggleVisibility: (id: string) => void;
  addLayer: (type?: PatternType) => void;
  renameLayer: (id: string, name: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayers: (from: number, to: number) => void;
  setLayerType: (id: string, type: PatternType) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Vec2) => void;
  setCamera: (camera: Partial<CameraState>) => void;
  resetView: () => void;
  setBackgroundColor: (color: string) => void;
  setView: (patch: Partial<ViewState>) => void;
  /**
   * What each knob does over time. Part of the document, so a shot travels as
   * one file and a clip is that file plus two times.
   */
  motion: MotionDoc;
  setMotion: (patch: Partial<MotionDoc>) => void;
  putAnimator: (animator: Animator) => void;
  removeAnimator: (id: string) => void;
  putTiming: (timing: Timing) => void;
  removeTiming: (id: string) => void;
  /** Replace the whole construction with a parsed scene file, wholesale. */
  loadScene: (scene: SceneData) => void;
  /** Back to the construction the tool opens on, view settings included. */
  resetProject: () => void;
}

function nextId(): string {
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function mergeLayer(layer: PatternLayer, patch: LayerPatch): PatternLayer {
  return {
    ...layer,
    ...patch,
    position: patch.position ? { ...layer.position, ...patch.position } : layer.position,
    offset: patch.offset ? { ...layer.offset, ...patch.offset } : layer.offset,
    scale: { ...(layer.scale ?? { x: 1, y: 1 }), ...patch.scale },
    rotationOffset: patch.rotationOffset ?? layer.rotationOffset,
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function mixLayer(from: PatternLayer, to: PatternLayer, t: number): PatternLayer {
  return {
    ...to,
    position: {
      x: lerp(from.position.x, to.position.x, t),
      y: lerp(from.position.y, to.position.y, t),
    },
    rotation: lerp(from.rotation, to.rotation, t),
    spacing: lerp(from.spacing, to.spacing, t),
    thickness: lerp(from.thickness, to.thickness, t),
    phase: lerp(from.phase, to.phase, t),
    offset: {
      x: lerp(from.offset.x, to.offset.x, t),
      y: lerp(from.offset.y, to.offset.y, t),
    },
    rotationOffset: lerp(from.rotationOffset, to.rotationOffset, t),
    sides: lerp(from.sides, to.sides, t),
    vertexSize: lerp(from.vertexSize, to.vertexSize, t),
    scale: {
      x: lerp(from.scale?.x ?? 1, to.scale?.x ?? 1, t),
      y: lerp(from.scale?.y ?? 1, to.scale?.y ?? 1, t),
    },
    lineCount: lerp(from.lineCount, to.lineCount, t),
    bend: lerp(from.bend, to.bend, t),
    frequency: lerp(from.frequency, to.frequency, t),
    // The expression cannot be interpolated, so the field's strength carries the
    // ease: at t = 0 the target's field is present but flat.
    field: {
      ...to.field,
      amount: lerp(from.field.source === to.field.source ? from.field.amount : 0, to.field.amount, t),
      scale: lerp(from.field.scale, to.field.scale, t),
    },
    opacity: lerp(from.opacity, to.opacity, t),
  };
}

function applyLayerType(layer: PatternLayer, type: PatternType): PatternLayer {
  if (isLines(type) || isGrid(type) || isCurves(type)) {
    return {
      ...layer,
      type,
      offset: { x: 0, y: 0 },
      rotationOffset: 0,
      bend: isCurves(type) ? defaultBend(type) : layer.bend,
      spacing: isCurves(type) ? defaultCurveSpacing(type) : layer.spacing,
      frequency: isCurves(type) ? 1 : layer.frequency,
      phase: isCurves(type) ? 0 : layer.phase,
    };
  }
  return {
    ...layer,
    type,
    sides: layer.sides || 6,
    offset:
      isLines(layer.type) || isGrid(layer.type) || isCurves(layer.type)
        ? { x: 0, y: 0 }
        : layer.offset,
  };
}

// The construction the tool opens on, and the animation that arrives at it. The
// document holds the destination, not the pose the opening departs from: `once`
// releases when it lands, so what is on screen afterwards is what gets saved.
const initial = createDefaultProject();
const initialMotion = createIntroMotion();

export const useProjectStore = create<ProjectStore>((set, get) => ({
  layers: initial.layers,
  selectedLayerId: initial.selectedLayerId,
  camera: initial.camera,
  backgroundColor: initial.backgroundColor,
  view: { ...VIEW_DEFAULTS },
  motion: initialMotion,

  selectLayer: (id) => set({ selectedLayerId: id }),

  updateLayer: (id, patch) => {
    set((s) => ({
      layers: s.layers.map((layer) => (layer.id === id ? mergeLayer(layer, patch) : layer)),
    }));
  },

  toggleVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      ),
    })),

  addLayer: (type = 'concentric-circles') => {
    const { layers, selectedLayerId } = get();
    if (layers.length >= MAX_LAYERS) return;
    const selected = layers.find((layer) => layer.id === selectedLayerId);
    const id = nextId();
    const layer = createLayer({
      id,
      name: `Layer ${layers.length + 1}`,
      type,
      color: selected?.color ?? '#000000',
      rotation: selected?.rotation ?? 0,
      spacing: isCurves(type)
        ? defaultCurveSpacing(type)
        : isLines(type) || isGrid(type)
          ? 16
          : selected?.spacing ?? 12,
      thickness: selected?.thickness ?? 2,
      position: selected
        ? { x: selected.position.x + 14, y: selected.position.y - 12 }
        : { x: 0, y: 0 },
      offset:
        selected && !isLines(type) && !isGrid(type) && !isCurves(type)
          ? { ...selected.offset }
          : { x: 0, y: 0 },
      rotationOffset:
        selected && !isLines(type) && !isGrid(type) && !isCurves(type)
          ? selected.rotationOffset
          : 0,
      lineCount: selected?.lineCount ?? 8,
      bend: isCurves(type) ? defaultBend(type) : selected?.bend ?? 0,
      frequency: 1,
      phase: isCurves(type) ? 0 : selected?.phase ?? 0,
    });
    set({
      layers: [...layers, layer],
      selectedLayerId: id,
    });
  },

  renameLayer: (id, name) =>
    set((s) => ({
      layers: s.layers.map((layer) => (layer.id === id ? { ...layer, name } : layer)),
    })),

  removeLayer: (id) => {
    endLayerMorph(id);
    // Motion on a layer that no longer exists would be a silent no-op that the
    // motion list still lists. Take it with the layer.
    set((s) => ({
      motion: {
        ...s.motion,
        animators: s.motion.animators.filter((a) => !a.path.startsWith(`layer.${id}.`)),
      },
    }));
    set((s) => {
      if (s.layers.length <= 1) return s;
      const layers = s.layers.filter((layer) => layer.id !== id);
      const selectedLayerId =
        s.selectedLayerId === id ? layers[layers.length - 1]?.id ?? null : s.selectedLayerId;
      return { layers, selectedLayerId };
    });
  },

  duplicateLayer: (id) => {
    const { layers } = get();
    if (layers.length >= MAX_LAYERS) return;
    const source = layers.find((layer) => layer.id === id);
    if (!source) return;
    const newId = nextId();
    const copy = mergeLayer(source, {
      id: newId,
      name: `${source.name} copy`,
    });
    set({
      layers: [...layers, copy],
      selectedLayerId: newId,
    });
  },

  reorderLayers: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.layers.length || to >= s.layers.length) {
        return s;
      }
      const layers = [...s.layers];
      const [moved] = layers.splice(from, 1);
      layers.splice(to, 0, moved);
      return { layers };
    }),

  setLayerType: (id, type) => {
    const layer = get().layers.find((item) => item.id === id);
    if (!layer || layer.type === type) return;
    beginLayerMorph(id, layer.type, type);
    set((s) => ({
      layers: s.layers.map((item) => (item.id === id ? applyLayerType(item, type) : item)),
    }));
  },

  setZoom: (zoom) =>
    set((s) => ({
      camera: { ...s.camera, zoom: clampZoom(zoom) },
    })),

  setPan: (pan) =>
    set((s) => ({
      camera: { ...s.camera, pan },
    })),

  setCamera: (camera) =>
    set((s) => ({
      camera: {
        zoom: camera.zoom !== undefined ? clampZoom(camera.zoom) : s.camera.zoom,
        pan: camera.pan ?? s.camera.pan,
      },
    })),

  resetView: () => set({ camera: { zoom: 1, pan: { x: 0, y: 0 } } }),

  setBackgroundColor: (backgroundColor) => set({ backgroundColor }),

  // Envelope and ratio each replace the composite, so turning one on retires
  // the other.
  setView: (patch) =>
    set((s) => {
      const view = { ...s.view, ...patch };
      if (patch.envelope) view.ratio = false;
      if (patch.ratio) view.envelope = false;
      return { view };
    }),

  loadScene: (scene) => {
    // A load during the intro would be animated over; the intro yields.
    set({
      layers: scene.layers,
      selectedLayerId: scene.selectedLayerId,
      camera: { zoom: clampZoom(scene.camera.zoom), pan: scene.camera.pan },
      backgroundColor: scene.backgroundColor,
      view: { ...VIEW_DEFAULTS, ...scene.view },
      motion: scene.motion ?? MOTION_NONE,
    });
  },

  setMotion: (patch) => set((s) => ({ motion: { ...s.motion, ...patch } })),

  putAnimator: (animator) =>
    set((s) => ({
      motion: {
        ...s.motion,
        animators: s.motion.animators.some((a) => a.id === animator.id)
          ? s.motion.animators.map((a) => (a.id === animator.id ? animator : a))
          : [...s.motion.animators, animator],
      },
    })),

  removeAnimator: (id) =>
    set((s) => ({
      motion: { ...s.motion, animators: s.motion.animators.filter((a) => a.id !== id) },
    })),

  putTiming: (timing) =>
    set((s) => ({
      motion: {
        ...s.motion,
        timings: s.motion.timings.some((t) => t.id === timing.id)
          ? s.motion.timings.map((t) => (t.id === timing.id ? timing : t))
          : [...s.motion.timings, timing],
      },
    })),

  removeTiming: (id) =>
    set((s) => ({
      motion: {
        ...s.motion,
        // Animators pointing at a deleted timing fall back to their own
        // schedule rather than stopping: the fields are always there.
        timings: s.motion.timings.filter((t) => t.id !== id),
        animators: s.motion.animators.map((a) => (a.timing === id ? { ...a, timing: null } : a)),
      },
    })),

  resetProject: () => {
    // The default *project*, not the intro's rest pose: a new document should be
    // the picture the tool is about, not the frame the opening animation starts
    // from.
    const fresh = createDefaultProject();
    set({
      layers: fresh.layers,
      selectedLayerId: fresh.selectedLayerId,
      camera: fresh.camera,
      backgroundColor: fresh.backgroundColor,
      view: { ...VIEW_DEFAULTS },
      motion: MOTION_NONE,
    });
  },

}));

/**
 * The document, as the scene file sees it. One definition, so the export button,
 * the autosave and a saved project cannot drift into three slightly different
 * ideas of what a construction is.
 */
export function sceneOf(s: ProjectStore = useProjectStore.getState()): SceneData {
  const scene: SceneData = {
    layers: s.layers,
    selectedLayerId: s.selectedLayerId,
    camera: s.camera,
    backgroundColor: s.backgroundColor,
    view: s.view,
    motion: s.motion,
  };

  // A looping knob is somewhere between its two ends at any instant, and that
  // instant is a fact about the clock rather than about the construction:
  // writing it down would mean a document that drifts every time it is saved,
  // and a file exported mid-swing that opens somewhere nobody chose. So loop and
  // bounce go back to their `from`, the value the cycle departs from.
  //
  // `once` is left exactly as it stands. It is a transition, not a cycle: before
  // it runs the document is at the start, after it runs the document is at the
  // destination, and after a hand has moved the knob the document is wherever the
  // hand put it. All three are things somebody meant.
  for (const a of s.motion.animators) {
    // Through scheduleOf, since an animator on a shared timing takes its mode
    // from the timing and not from its own fields.
    if (a.enabled && scheduleOf(a, s.motion.timings).mode !== 'once') {
      writeParamInto(scene, a.path, a.from);
    }
  }
  return scene;
}

export function useSelectedLayer(): PatternLayer | null {
  return useProjectStore((s) => s.layers.find((layer) => layer.id === s.selectedLayerId) ?? null);
}
