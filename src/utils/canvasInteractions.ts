/**
 * Canvas interaction utilities for handling mouse events, keyboard modifiers,
 * and coordinate transformations in the Moire Pattern Generator
 */

// Type definitions
export interface MousePosition {
  x: number;
  y: number;
}

export interface CanvasTransform {
  zoom: number;
  pan: MousePosition;
}

export interface InteractionState {
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export type InteractionMode = 'pan' | 'move-layer' | 'rotate-layer';

/**
 * Extracts keyboard modifier state from a mouse or keyboard event
 */
export function getInteractionState(event: MouseEvent | KeyboardEvent): InteractionState {
  return {
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  };
}

/**
 * Determines the current interaction mode based on keyboard modifiers
 */
export function getInteractionMode(keyState: InteractionState): InteractionMode {
  if (keyState.altKey && keyState.shiftKey) {
    return 'rotate-layer';
  } else if (keyState.altKey) {
    return 'move-layer';
  } else {
    return 'pan';
  }
}

/**
 * Converts screen space delta to world space delta accounting for zoom
 */
export function screenDeltaToWorldDelta(
  screenDelta: MousePosition,
  zoom: number
): MousePosition {
  return {
    x: screenDelta.x / zoom,
    y: screenDelta.y / zoom,
  };
}

/**
 * Calculates rotation delta from mouse movement
 * @param deltaY - Vertical mouse movement (positive = down)
 * @param sensitivity - Rotation sensitivity factor
 * @returns Rotation delta in degrees
 */
export function calculateRotationFromDelta(deltaY: number, sensitivity: number = 0.5): number {
  // Negative deltaY because moving mouse up should be counter-clockwise (negative rotation)
  return -deltaY * sensitivity;
}

/**
 * Clamps layer position to reasonable bounds
 */
export function clampLayerPosition(position: MousePosition): MousePosition {
  const maxOffset = 2000; // Maximum offset from center
  return {
    x: Math.max(-maxOffset, Math.min(maxOffset, position.x)),
    y: Math.max(-maxOffset, Math.min(maxOffset, position.y)),
  };
}

/**
 * Normalizes rotation to be within 0-360 degrees
 */
export function normalizeRotation(rotation: number): number {
  let normalized = rotation % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Gets the appropriate cursor for the given interaction mode
 */
export function getCursorForMode(mode: InteractionMode): string {
  switch (mode) {
    case 'pan':
      return 'grab';
    case 'move-layer':
      return 'move';
    case 'rotate-layer':
      return 'crosshair';
    default:
      return 'default';
  }
}

/**
 * Gets the appropriate cursor for the given interaction mode while dragging
 */
export function getDraggingCursorForMode(mode: InteractionMode): string {
  switch (mode) {
    case 'pan':
      return 'grabbing';
    case 'move-layer':
      return 'move';
    case 'rotate-layer':
      return 'crosshair';
    default:
      return 'default';
  }
} 