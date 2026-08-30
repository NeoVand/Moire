import { TILINGS, tilingSpec, type TilingId } from '../gpu/tilings';
import type { PatternType } from '../types/moire';

/**
 * Choosing a tiling from the catalogue, as a (type, name) pair.
 *
 * The three regular tilings are drawn by the renderer's own closed forms, so
 * picking one sets that pattern type; everything else is `tiling-periodic`
 * with the catalogue name. The name rides along either way, so switching to a
 * regular tiling and back remembers which catalogue entry you had.
 */
export interface TilingChoice {
  type: PatternType;
  tiling: TilingId;
}

/** The catalogue entry a layer is currently showing. */
export function currentTiling(type: PatternType, tiling: TilingId): TilingId {
  const builtin = TILINGS.find((t) => t.builtin === type);
  return builtin ? builtin.id : tiling;
}

export function tilingChoice(id: TilingId): TilingChoice {
  return { type: tilingSpec(id).builtin ?? 'tiling-periodic', tiling: id };
}
