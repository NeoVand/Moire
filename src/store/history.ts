import { create } from 'zustand';
import { clearLayerMorphs } from '../gpu/typeMorph';
import { sceneOf, useProjectStore, type ProjectStore } from './project';
import type { SceneData } from './scene';
import { isApplyingMotion, useTransportStore } from './transport';

/**
 * Undo follows authoring actions, not rendered frames. The authored baseline is
 * separate from the current pose, so moving a knob during playback changes only
 * that knob in history. Each checkpoint also remembers the visible pose and its
 * clock: restoring an edit should show the picture the author actually saw.
 */
interface Checkpoint {
  document: SceneData;
  pose: SceneData;
  time: number;
}

export interface HistoryStore {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

const LIMIT = 100;
const TYPING_MS = 650;
const past: Checkpoint[] = [];
const future: Checkpoint[] = [];
let document = sceneOf();
let restoring = false;
let sameTurn = false;
let gestureEdited = false;
let lastKey = '';
let lastTime = -Infinity;
let lastNumeric = false;

/** Store updates use immutable branches, so sharing these snapshots is safe. */
function poseOf(s: ProjectStore): SceneData {
  return {
    layers: s.layers,
    selectedLayerId: s.selectedLayerId,
    camera: s.camera,
    backgroundColor: s.backgroundColor,
    view: s.view,
    motion: s.motion,
  };
}

function checkpoint(s = useProjectStore.getState()): Checkpoint {
  return { document, pose: poseOf(s), time: useTransportStore.getState().t };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Apply just the author's changes, leaving unrelated sampled values alone. */
function changed(base: unknown, before: unknown, after: unknown): unknown {
  if (Object.is(before, after)) return base;
  if (!object(before) || !object(after)) return after;
  const out: Record<string, unknown> = object(base) ? { ...base } : {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (Object.is(before[key], after[key])) continue;
    if (!(key in after)) delete out[key];
    else out[key] = changed(out[key], before[key], after[key]);
  }
  return out;
}

function authoredChanges(before: ProjectStore, after: ProjectStore): SceneData {
  const oldLayers = new Map(before.layers.map((layer) => [layer.id, layer]));
  const baseLayers = new Map(document.layers.map((layer) => [layer.id, layer]));
  return {
    layers: after.layers.map((layer) =>
      changed(baseLayers.get(layer.id), oldLayers.get(layer.id), layer) as typeof layer
    ),
    selectedLayerId: after.selectedLayerId,
    camera: changed(document.camera, before.camera, after.camera) as SceneData['camera'],
    view: changed(document.view, before.view, after.view) as SceneData['view'],
    backgroundColor: after.backgroundColor,
    motion: changed(document.motion, before.motion, after.motion) as SceneData['motion'],
  };
}

/** A stable edit key makes repeated typing one step without merging other edits. */
function differences(before: unknown, after: unknown, prefix: string, out: string[], numeric: { only: boolean }): void {
  if (Object.is(before, after)) return;
  if (object(before) && object(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      differences(before[key], after[key], `${prefix}.${key}`, out, numeric);
    }
  } else if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    for (let i = 0; i < before.length; i++) differences(before[i], after[i], `${prefix}.${i}`, out, numeric);
  } else {
    out.push(prefix);
    if (typeof before !== 'number' || typeof after !== 'number') numeric.only = false;
  }
}

function finishGroup(): void {
  sameTurn = false;
  gestureEdited = false;
  lastKey = '';
  lastTime = -Infinity;
  lastNumeric = false;
}

function publish(): void {
  useHistoryStore.setState({ canUndo: past.length > 0, canRedo: future.length > 0 });
}

function restore(target: Checkpoint): void {
  restoring = true;
  try {
    const ids = new Set(target.pose.motion?.animators.map((a) => a.id));
    const transport = useTransportStore.getState();
    useTransportStore.setState({
      state: 'paused', t: target.time, range: null, interacting: false,
      muted: transport.muted.filter((id) => ids.has(id)),
      solo: transport.solo && ids.has(transport.solo) ? transport.solo : null,
    });
    clearLayerMorphs();
    useProjectStore.setState({
      ...target.pose,
      view: { ...useProjectStore.getState().view, ...target.pose.view },
      motion: target.pose.motion ?? { timings: [], animators: [], playOnLoad: false },
    });
    document = target.document;
  } finally {
    restoring = false;
    finishGroup();
  }
  publish();
}

export const useHistoryStore = create<HistoryStore>(() => ({
  canUndo: false,
  canRedo: false,
  undo: () => {
    if (useTransportStore.getState().recording || past.length === 0) return;
    future.push(checkpoint());
    restore(past.pop()!);
  },
  redo: () => {
    if (useTransportStore.getState().recording || future.length === 0) return;
    past.push(checkpoint());
    restore(future.pop()!);
  },
  clear: () => {
    past.length = 0;
    future.length = 0;
    document = sceneOf();
    finishGroup();
    publish();
  },
}));

useProjectStore.subscribe((after, before) => {
  if (restoring) return;
  if (after.documentRevision !== before.documentRevision) {
    useHistoryStore.getState().clear();
    return;
  }
  if (isApplyingMotion() || useTransportStore.getState().recording) return;

  const paths: string[] = [];
  const numeric = { only: true };
  for (const key of ['layers', 'camera', 'backgroundColor', 'view', 'motion'] as const) {
    differences(before[key], after[key], key, paths, numeric);
  }
  if (paths.length === 0) {
    document = { ...document, selectedLayerId: after.selectedLayerId };
    return;
  }

  const key = paths.join('|');
  const now = performance.now();
  const interacting = useTransportStore.getState().interacting;
  const coalesce = sameTurn || (interacting && gestureEdited) ||
    (!interacting && numeric.only && lastNumeric && key === lastKey && now - lastTime < TYPING_MS);
  if (!coalesce) {
    past.push(checkpoint(before));
    if (past.length > LIMIT) past.shift();
  }
  future.length = 0;
  document = authoredChanges(before, after);
  if (interacting) gestureEdited = true;
  lastKey = key;
  lastTime = now;
  lastNumeric = numeric.only;
  sameTurn = true;
  queueMicrotask(() => { sameTurn = false; });
  publish();
});

useTransportStore.subscribe((after, before) => {
  if (
    after.interacting !== before.interacting || after.recording !== before.recording ||
    (after.state !== before.state && (after.state === 'playing' || before.state === 'playing'))
  ) finishGroup();
});
