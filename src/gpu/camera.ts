import type { Vec2 } from '../types/moire';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Convert a pointer position to world space.
 * World Y is up. Screen Y is down — flipped here, once.
 */
export function clientToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  zoom: number,
  pan: Vec2
): Vec2 {
  const sx = clientX - rect.left - rect.width / 2;
  const sy = -(clientY - rect.top - rect.height / 2);
  return {
    x: sx / zoom + pan.x,
    y: sy / zoom + pan.y,
  };
}

/** Pointer movement in CSS pixels → world delta. Flips Y once. */
export function screenDeltaToWorld(dx: number, dy: number, zoom: number): Vec2 {
  return {
    x: dx / zoom,
    y: -dy / zoom,
  };
}

/**
 * World-space pointer delta → layer position delta.
 * Position lives in the unrotated frame; the shader does `R(-θ) * world - position`.
 */
export function worldDeltaToLayerPosition(delta: Vec2, rotationDegrees: number): Vec2 {
  const rad = (rotationDegrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: c * delta.x + s * delta.y,
    y: -s * delta.x + c * delta.y,
  };
}

/** Pan that keeps `world` under the same screen point after a zoom change. */
export function panForZoomToCursor(
  world: Vec2,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  newZoom: number
): Vec2 {
  const sx = clientX - rect.left - rect.width / 2;
  const sy = -(clientY - rect.top - rect.height / 2);
  return {
    x: world.x - sx / newZoom,
    y: world.y - sy / newZoom,
  };
}
