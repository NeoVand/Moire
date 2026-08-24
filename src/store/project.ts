import { create } from 'zustand';
import type { CameraState, PatternLayer, PatternType, Vec2 } from '../types/moire';
import {
  MAX_LAYERS,
  createDefaultProject,
  createLayer,
  isGrid,
} from '../types/moire';
import { clampZoom } from '../gpu/camera';

export type LayerPatch = Omit<Partial<PatternLayer>, 'position' | 'offset' | 'scale'> & {
  position?: Partial<Vec2>;
  offset?: Partial<Vec2>;
  scale?: Partial<Vec2>;
};

export interface ProjectStore {
  layers: PatternLayer[];
  selectedLayerId: string | null;
  camera: CameraState;
  backgroundColor: string;
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

const initial = createDefaultProject();

export const useProjectStore = create<ProjectStore>((set, get) => ({
  layers: initial.layers,
  selectedLayerId: initial.selectedLayerId,
  camera: initial.camera,
  backgroundColor: initial.backgroundColor,

  selectLayer: (id) => set({ selectedLayerId: id }),

  updateLayer: (id, patch) =>
    set((s) => ({
      layers: s.layers.map((layer) => (layer.id === id ? mergeLayer(layer, patch) : layer)),
    })),

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
      spacing: type === 'straight-lines' || isGrid(type) ? 16 : selected?.spacing ?? 12,
      thickness: selected?.thickness ?? 2,
      position: selected
        ? { x: selected.position.x + 14, y: selected.position.y - 12 }
        : { x: 0, y: 0 },
      offset:
        selected && type !== 'straight-lines' && !isGrid(type)
          ? { ...selected.offset }
          : { x: 0, y: 0 },
      rotationOffset:
        selected && type !== 'straight-lines' && !isGrid(type) ? selected.rotationOffset : 0,
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

  removeLayer: (id) =>
    set((s) => {
      if (s.layers.length <= 1) return s;
      const layers = s.layers.filter((layer) => layer.id !== id);
      const selectedLayerId =
        s.selectedLayerId === id ? layers[layers.length - 1]?.id ?? null : s.selectedLayerId;
      return { layers, selectedLayerId };
    }),

  duplicateLayer: (id) => {
    const { layers } = get();
    if (layers.length >= MAX_LAYERS) return;
    const source = layers.find((layer) => layer.id === id);
    if (!source) return;
    const newId = nextId();
    const copy = mergeLayer(source, {
      id: newId,
      name: `${source.name} copy`,
      position: { x: source.position.x + 8, y: source.position.y - 8 },
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

  setLayerType: (id, type) =>
    set((s) => ({
      layers: s.layers.map((layer) => {
        if (layer.id !== id) return layer;
        if (type === 'straight-lines' || isGrid(type)) {
          return { ...layer, type, offset: { x: 0, y: 0 }, rotationOffset: 0 };
        }
        return {
          ...layer,
          type,
          sides: layer.sides || 6,
          offset: layer.type === 'straight-lines' || isGrid(layer.type) ? { x: 0, y: 0 } : layer.offset,
        };
      }),
    })),

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
}));

export function useSelectedLayer(): PatternLayer | null {
  return useProjectStore((s) => s.layers.find((layer) => layer.id === s.selectedLayerId) ?? null);
}
