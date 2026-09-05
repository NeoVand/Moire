import { useEffect, useMemo } from 'react';
import { useProjectStore } from './project';
import type { PatternLayer } from '../types/moire';
import type { ViewState } from './project';
import type { SceneData } from './scene';
import { describeParam, type ParamDescriptor } from './paramMetadata';
export type { ParamDescriptor } from './paramMetadata';

/**
 * Every animatable number in the document, addressed by a stable path.
 *
 * A slider is a controlled input with no identity: it knows a value and how to
 * write one back, and that is enough for a hand on a mouse but not for anything
 * that has to name the same knob twice. Motion is stored, exported, and replayed,
 * so it needs an address that survives a reload — hence this file.
 *
 * The grammar:
 *
 *   view.<key>                    envelope contrast, contour width, ratio blend…
 *   layer.<id>.<key>              spacing, thickness, rotation, sides, bend…
 *   layer.<id>.position.x|y       the vector pairs, as independent scalars
 *   layer.<id>.offset.x|y
 *   layer.<id>.scale.x|y
 *   layer.<id>.field.amount|scale the contouring control
 *   camera.zoom, camera.pan.x|y
 *
 * Layers are addressed by id and never by index, because reordering a stack must
 * not silently point an animation at a different layer.
 *
 * Reading and writing here go through the store's own actions rather than the
 * mounted component, so a knob can be driven while its panel is closed or its
 * layer is not the selected one. That is not a detail: during a take the layer
 * panel shows one layer, and every other layer's motion still has to run.
 */

export type ParamPath = string;

const descriptors = new Map<ParamPath, ParamDescriptor>();

/**
 * A mounted slider publishes what it is. The alternative -- a hand-written table
 * of every knob's range -- would be a second copy of numbers that already exist
 * in the markup, and the copy would be the one that went stale.
 *
 * Mounted presentation takes priority; document metadata supplies the same
 * information when the owning panel is closed or has never been opened.
 */
export function useParamRegistration(desc: ParamDescriptor | null) {
  const key = desc?.path;
  const json = desc ? JSON.stringify(desc) : '';
  useEffect(() => {
    if (!key || !json) return;
    descriptors.set(key, JSON.parse(json) as ParamDescriptor);
    return () => {
      descriptors.delete(key);
    };
  }, [key, json]);
}

function resolveDescriptor(path: ParamPath, layers: PatternLayer[]): ParamDescriptor | undefined {
  const fallback = describeParam(path, layers);
  const mounted = descriptors.get(path);
  // The control owns presentation; the document owns semantic properties such
  // as a verified full-turn period, which need not be repeated in every slider.
  return mounted ? { ...fallback, ...mounted } : fallback;
}

export function paramDescriptor(path: ParamPath): ParamDescriptor | undefined {
  return resolveDescriptor(path, useProjectStore.getState().layers);
}

/** React follows document metadata without re-rendering for every animated value. */
export function useParamDescriptor(path: ParamPath | null): ParamDescriptor | undefined {
  const json = useProjectStore((s) => path
    ? JSON.stringify(resolveDescriptor(path, s.layers))
    : undefined);
  return useMemo(() => json ? JSON.parse(json) as ParamDescriptor : undefined, [json]);
}

/** Every knob currently on screen. The motion list needs this; so does a console. */
export function registeredParams(): ParamDescriptor[] {
  return [...descriptors.values()];
}

export const layerPath = (id: string, key: string): ParamPath => `layer.${id}.${key}`;
export const viewPath = (key: keyof ViewState): ParamPath => `view.${key}`;

/** The layer id inside a `layer.<id>.…` path, or null for any other path. */
export function pathLayerId(path: ParamPath): string | null {
  const parts = path.split('.');
  return parts[0] === 'layer' && parts.length >= 3 ? parts[1] : null;
}

export function readParam(path: ParamPath): number | undefined {
  const s = useProjectStore.getState();
  const parts = path.split('.');

  if (parts[0] === 'view') {
    const v = s.view[parts[1] as keyof ViewState];
    return typeof v === 'number' ? v : undefined;
  }

  if (parts[0] === 'camera') {
    if (parts[1] === 'zoom') return s.camera.zoom;
    if (parts[1] === 'pan' && (parts[2] === 'x' || parts[2] === 'y')) return s.camera.pan[parts[2]];
    return undefined;
  }

  if (parts[0] === 'layer') {
    const layer = s.layers.find((l) => l.id === parts[1]);
    if (!layer) return undefined;
    const [, , a, b] = parts;
    if (a === 'field') {
      const v = layer.field?.[b as 'amount' | 'scale' | 'soften'];
      if (b === 'soften' && v === undefined && layer.field) return 0;
      return typeof v === 'number' ? v : undefined;
    }
    if (a === 'position' || a === 'offset' || a === 'scale') {
      if (b !== 'x' && b !== 'y') return undefined;
      return layer[a]?.[b];
    }
    const v = layer[a as keyof PatternLayer];
    return typeof v === 'number' ? v : undefined;
  }

  return undefined;
}

/**
 * Set one addressed value. Every write lands through the same store action a
 * drag would use, so clamping, morphing and the intro's abort behave identically
 * whether a hand or a clock moved the knob.
 */
export function writeParam(path: ParamPath, value: number): void {
  if (paramDescriptor(path)?.quantize === 'int') value = Math.round(value);
  const s = useProjectStore.getState();
  const parts = path.split('.');

  if (parts[0] === 'view') {
    s.setView({ [parts[1]]: value } as Partial<ViewState>);
    return;
  }

  if (parts[0] === 'camera') {
    if (parts[1] === 'zoom') s.setZoom(value);
    else if (parts[1] === 'pan' && (parts[2] === 'x' || parts[2] === 'y')) {
      s.setPan({ ...s.camera.pan, [parts[2]]: value });
    }
    return;
  }

  if (parts[0] === 'layer') {
    const [, id, a, b] = parts;
    if (a === 'field') {
      const layer = s.layers.find((l) => l.id === id);
      if (!layer) return;
      s.updateLayer(id, { field: { ...layer.field, [b]: value } });
      return;
    }
    if (a === 'position' || a === 'offset' || a === 'scale') {
      if (b !== 'x' && b !== 'y') return;
      s.updateLayer(id, { [a]: { [b]: value } });
      return;
    }
    s.updateLayer(id, { [a]: value });
  }
}

/**
 * Set many addressed values at once, in as few store writes as the shape of the
 * document allows: one per touched layer, one for the view, one for the camera.
 *
 * A frame of motion can move a dozen knobs, and pushing each through writeParam
 * would be a dozen store updates and a dozen renders for one frame. Grouping
 * them is what makes sixty frames a second the same cost as one drag.
 */
export function applyParams(values: Map<ParamPath, number>): void {
  if (values.size === 0) return;
  const s = useProjectStore.getState();

  const view: Record<string, number> = {};
  const camera: { zoom?: number; pan?: { x: number; y: number } } = {};
  const byLayer = new Map<string, Record<string, unknown>>();
  let anyView = false;
  let anyCamera = false;

  for (const [path, raw] of values) {
    const value = paramDescriptor(path)?.quantize === 'int' ? Math.round(raw) : raw;
    const parts = path.split('.');
    if (parts[0] === 'view') {
      view[parts[1]] = value;
      anyView = true;
    } else if (parts[0] === 'camera') {
      if (parts[1] === 'zoom') camera.zoom = value;
      else if (parts[1] === 'pan' && (parts[2] === 'x' || parts[2] === 'y')) {
        camera.pan = { ...(camera.pan ?? s.camera.pan), [parts[2]]: value };
      }
      anyCamera = true;
    } else if (parts[0] === 'layer') {
      const [, id, a, b] = parts;
      const patch = byLayer.get(id) ?? {};
      if (a === 'field') {
        const layer = s.layers.find((l) => l.id === id);
        if (!layer) continue;
        patch.field = { ...layer.field, ...(patch.field as object), [b]: value };
      } else if (a === 'position' || a === 'offset' || a === 'scale') {
        if (b !== 'x' && b !== 'y') continue;
        patch[a] = { ...(patch[a] as object), [b]: value };
      } else {
        patch[a] = value;
      }
      byLayer.set(id, patch);
    }
  }

  if (anyView) s.setView(view as Partial<ViewState>);
  if (anyCamera) s.setCamera(camera);
  for (const [id, patch] of byLayer) s.updateLayer(id, patch);
}

/**
 * The same addressing, but into a plain scene object rather than the live store.
 * Used to put a document back at rest before it is written down.
 */
export function writeParamInto(scene: SceneData, path: ParamPath, value: number): void {
  const parts = path.split('.');

  if (parts[0] === 'view') {
    (scene.view as Record<string, number>)[parts[1]] = value;
    return;
  }
  if (parts[0] === 'camera') {
    if (parts[1] === 'zoom') scene.camera = { ...scene.camera, zoom: value };
    else if (parts[1] === 'pan' && (parts[2] === 'x' || parts[2] === 'y')) {
      scene.camera = { ...scene.camera, pan: { ...scene.camera.pan, [parts[2]]: value } };
    }
    return;
  }
  if (parts[0] !== 'layer') return;

  const [, id, a, b] = parts;
  const i = scene.layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const layer = { ...scene.layers[i] } as Record<string, unknown>;
  if (a === 'field') {
    layer.field = { ...(layer.field as object), [b]: value };
  } else if (a === 'position' || a === 'offset' || a === 'scale') {
    if (b !== 'x' && b !== 'y') return;
    layer[a] = { ...(layer[a] as object), [b]: value };
  } else {
    layer[a] = value;
  }
  scene.layers = scene.layers.map((l, j) => (j === i ? (layer as unknown as typeof l) : l));
}

/** Whether a path still names something in the document. */
export function paramExists(path: ParamPath): boolean {
  return readParam(path) !== undefined;
}
