import { useCallback, useState, useRef } from 'react';
import { useMoireProjectContext } from './MoireProjectContext';
import type {
  InteractionMode,
  MousePosition,
} from '../utils/canvasInteractions';
import {
  getInteractionState,
  getInteractionMode,
  screenDeltaToWorldDelta,
  calculateRotationFromDelta,
  clampLayerPosition,
  normalizeRotation,
  getCursorForMode,
  getDraggingCursorForMode,
} from '../utils/canvasInteractions';

export interface CanvasInteractionState {
  isDragging: boolean;
  lastMousePos: MousePosition;
  currentMode: InteractionMode;
  currentCursor: string;
}

/**
 * Hook for managing canvas interactions including layer manipulation
 */
export function useCanvasInteractions(
  zoom: number,
  pan: MousePosition,
  _canvasSize: { width: number; height: number },
  onPanChange: (newPan: MousePosition) => void
) {
  const { selectedLayer, updateSelectedLayer } = useMoireProjectContext();
  
  // Interaction state
  const [interactionState, setInteractionState] = useState<CanvasInteractionState>({
    isDragging: false,
    lastMousePos: { x: 0, y: 0 },
    currentMode: 'pan',
    currentCursor: 'grab',
  });
  
  // Store the initial layer state when starting to drag a layer
  const initialLayerStateRef = useRef<{
    position: MousePosition;
    rotation: number;
  } | null>(null);

  /**
   * Updates the current interaction mode based on keyboard modifiers
   */
  const updateInteractionMode = useCallback((event: MouseEvent | KeyboardEvent) => {
    const keyState = getInteractionState(event);
    const mode = getInteractionMode(keyState);
    const cursor = interactionState.isDragging 
      ? getDraggingCursorForMode(mode)
      : getCursorForMode(mode);
    
    setInteractionState(prev => ({
      ...prev,
      currentMode: mode,
      currentCursor: cursor,
    }));
  }, [interactionState.isDragging]);

  /**
   * Handles mouse down events to start interactions
   */
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    const keyState = getInteractionState(event.nativeEvent);
    const mode = getInteractionMode(keyState);
    
    // Store initial layer state if we're about to manipulate a layer
    if ((mode === 'move-layer' || mode === 'rotate-layer') && selectedLayer) {
      initialLayerStateRef.current = {
        position: { ...selectedLayer.position },
        rotation: selectedLayer.rotation,
      };
    } else {
      initialLayerStateRef.current = null;
    }
    
    const cursor = getDraggingCursorForMode(mode);
    
    setInteractionState(prev => ({
      ...prev,
      isDragging: true,
      lastMousePos: { x: event.clientX, y: event.clientY },
      currentMode: mode,
      currentCursor: cursor,
    }));
  }, [selectedLayer]);

  /**
   * Handles mouse move events for dragging operations
   */
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!interactionState.isDragging) {
      // Update interaction mode when not dragging (for cursor changes)
      updateInteractionMode(event.nativeEvent);
      return;
    }

    event.preventDefault();

    const currentPos = { x: event.clientX, y: event.clientY };
    const deltaX = currentPos.x - interactionState.lastMousePos.x;
    const deltaY = currentPos.y - interactionState.lastMousePos.y;

    switch (interactionState.currentMode) {
      case 'pan':
        // Standard canvas panning
        onPanChange({
          x: pan.x + deltaX,
          y: pan.y + deltaY,
        });
        break;

      case 'move-layer':
        // Move the selected layer
        if (selectedLayer && initialLayerStateRef.current) {
          const worldDelta = screenDeltaToWorldDelta({ x: deltaX, y: deltaY }, zoom);
          const newPosition = {
            x: initialLayerStateRef.current.position.x + worldDelta.x,
            y: initialLayerStateRef.current.position.y + worldDelta.y,
          };
          
          const clampedPosition = clampLayerPosition(newPosition);
          updateSelectedLayer({ position: clampedPosition });
          
          // Update the initial state to accumulate movement
          initialLayerStateRef.current.position = clampedPosition;
        }
        break;

      case 'rotate-layer':
        // Rotate the selected layer based on vertical mouse movement
        if (selectedLayer && initialLayerStateRef.current) {
          const rotationDelta = calculateRotationFromDelta(deltaY, 0.5);
          const newRotation = normalizeRotation(
            initialLayerStateRef.current.rotation + rotationDelta
          );
          
          updateSelectedLayer({ rotation: newRotation });
          
          // Update the initial state to accumulate rotation
          initialLayerStateRef.current.rotation = newRotation;
        }
        break;
    }

    setInteractionState(prev => ({
      ...prev,
      lastMousePos: currentPos,
    }));
  }, [
    interactionState.isDragging,
    interactionState.lastMousePos,
    interactionState.currentMode,
    updateInteractionMode,
    pan,
    zoom,
    onPanChange,
    selectedLayer,
    updateSelectedLayer,
  ]);

  /**
   * Handles mouse up events to end interactions
   */
  const handleMouseUp = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    const keyState = getInteractionState(event.nativeEvent);
    const mode = getInteractionMode(keyState);
    const cursor = getCursorForMode(mode);
    
    setInteractionState(prev => ({
      ...prev,
      isDragging: false,
      currentMode: mode,
      currentCursor: cursor,
    }));
    
    // Clear initial layer state
    initialLayerStateRef.current = null;
  }, []);

  /**
   * Handles key down events for modifier key detection
   */
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!interactionState.isDragging) {
      updateInteractionMode(event);
    }
  }, [interactionState.isDragging, updateInteractionMode]);

  /**
   * Handles key up events for modifier key detection
   */
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!interactionState.isDragging) {
      updateInteractionMode(event);
    }
  }, [interactionState.isDragging, updateInteractionMode]);

  /**
   * Sets up global event listeners for keyboard events
   */
  const setupGlobalListeners = useCallback(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  /**
   * Gets status text for the current interaction mode
   */
  const getStatusText = useCallback((): string => {
    if (!selectedLayer && (interactionState.currentMode === 'move-layer' || interactionState.currentMode === 'rotate-layer')) {
      return 'No layer selected';
    }
    
    switch (interactionState.currentMode) {
      case 'pan':
        return 'Click and drag to pan canvas';
      case 'move-layer':
        return `Hold Option + drag to move "${selectedLayer?.name}"`;
      case 'rotate-layer':
        return `Hold Option + Shift + drag to rotate "${selectedLayer?.name}"`;
      default:
        return '';
    }
  }, [interactionState.currentMode, selectedLayer]);

  return {
    // State
    interactionState,
    statusText: getStatusText(),
    
    // Event handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    setupGlobalListeners,
    
    // Utilities
    updateInteractionMode,
  };
} 