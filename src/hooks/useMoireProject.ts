import { useState, useCallback } from 'react';
import type { MoireProject, PatternLayer } from '../types/moire';
import { createDefaultProject, PATTERN_DEFINITIONS } from '../types/moire';

export function useMoireProject() {
  const [project, setProject] = useState<MoireProject>(createDefaultProject);

  const selectedLayer = project.layers.find(layer => layer.id === project.selectedLayerId) || null;

  const selectLayer = useCallback((layerId: string) => {
    setProject(prev => ({
      ...prev,
      selectedLayerId: layerId,
    }));
  }, []);

  const updateLayer = useCallback((layerId: string, updates: Partial<PatternLayer>) => {
    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.id === layerId ? {
          ...layer,
          ...updates,
          // Ensure nested objects are deep copied
          position: updates.position ? { ...updates.position } : layer.position,
          parameters: updates.parameters ? { ...layer.parameters, ...updates.parameters } : layer.parameters,
        } : layer
      ),
    }));
  }, []);

  const updateSelectedLayer = useCallback((updates: Partial<PatternLayer>) => {
    if (project.selectedLayerId) {
      updateLayer(project.selectedLayerId, updates);
    }
  }, [project.selectedLayerId, updateLayer]);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
      ),
    }));
  }, []);

  const toggleLayerLock = useCallback((layerId: string) => {
    setProject(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, locked: !layer.locked } : layer
      ),
    }));
  }, []);

  const addLayer = useCallback((patternType: string = 'straight-lines') => {
    const newId = (project.layers.length + 1).toString();
    
    // Find the pattern definition to get default parameters
    const patternDef = PATTERN_DEFINITIONS.find(p => p.id === patternType);
    if (!patternDef) {
      console.error(`Pattern type ${patternType} not found`);
      return;
    }

    const newLayer: PatternLayer = {
      id: newId,
      name: `Layer ${newId}`,
      category: patternDef.category,
      type: patternType,
      visible: true,
      color: '#000000',
      ...(patternDef.category === 'tiles' && { fillColor: '#ffffff' }), // Add default fill color for tiles
      position: { x: 0, y: 0 },
      rotation: 0,
      opacity: 1,
      blendMode: 'normal',
      locked: false,
      parameters: { ...patternDef.defaultParameters },
    };

    setProject(prev => ({
      ...prev,
      layers: [...prev.layers, newLayer],
      selectedLayerId: newId,
    }));
  }, [project.layers.length]);

  const removeLayer = useCallback((layerId: string) => {
    setProject(prev => {
      const newLayers = prev.layers.filter(layer => layer.id !== layerId);
      const newSelectedId = prev.selectedLayerId === layerId
        ? (newLayers[0]?.id || null)
        : prev.selectedLayerId;

      return {
        ...prev,
        layers: newLayers,
        selectedLayerId: newSelectedId,
      };
    });
  }, []);

  const reorderLayers = useCallback((fromIndex: number, toIndex: number) => {
    setProject(prev => {
      const newLayers = [...prev.layers];
      const [movedLayer] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, movedLayer);
      
      return {
        ...prev,
        layers: newLayers,
      };
    });
  }, []);

  // Zoom functions
  const setZoom = useCallback((zoom: number) => {
    const clampedZoom = Math.max(0.1, Math.min(5, zoom)); // Clamp between 10% and 500%
    setProject(prev => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        zoom: clampedZoom,
      },
    }));
  }, []);

  const zoomIn = useCallback(() => {
    setProject(prev => {
      const newZoom = Math.min(5, prev.canvas.zoom * 1.2); // Increase by 20%
      return {
        ...prev,
        canvas: {
          ...prev.canvas,
          zoom: newZoom,
        },
      };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setProject(prev => {
      const newZoom = Math.max(0.1, prev.canvas.zoom / 1.2); // Decrease by 20%
      return {
        ...prev,
        canvas: {
          ...prev.canvas,
          zoom: newZoom,
        },
      };
    });
  }, []);

  const resetZoom = useCallback(() => {
    setProject(prev => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        zoom: 1,
        pan: { x: 0, y: 0 },
      },
    }));
  }, []);

  // Pan functions
  const setPan = useCallback((pan: { x: number; y: number }) => {
    setProject(prev => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        pan,
      },
    }));
  }, []);

  const setBackgroundColor = useCallback((color: string) => {
    setProject(prev => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        backgroundColor: color,
      },
    }));
  }, []);

  return {
    project,
    selectedLayer,
    selectLayer,
    updateLayer,
    updateSelectedLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    addLayer,
    removeLayer,
    reorderLayers,
    setProject,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    setPan,
    setBackgroundColor,
  };
} 