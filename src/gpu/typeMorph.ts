import type { PatternType } from '../types/moire';

export const TYPE_MORPH_MS = 280;

type Morph = {
  from: PatternType;
  to: PatternType;
  started: number;
};

const morphs = new Map<string, Morph>();

export function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

export function beginLayerMorph(id: string, from: PatternType, to: PatternType) {
  if (from === to) {
    morphs.delete(id);
    return;
  }
  morphs.set(id, { from, to, started: performance.now() });
}

export function endLayerMorph(id: string) {
  morphs.delete(id);
}

export function clearLayerMorphs() {
  morphs.clear();
}

export function hasLayerMorphs() {
  return morphs.size > 0;
}

export function layerMorph(id: string, now = performance.now()): Morph & { t: number } | null {
  const morph = morphs.get(id);
  if (!morph) return null;
  const t = easeOutCubic((now - morph.started) / TYPE_MORPH_MS);
  if (t >= 1) {
    morphs.delete(id);
    return null;
  }
  return { ...morph, t };
}
