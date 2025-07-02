import { useState, useCallback } from 'react';
import type { MoireProject, PatternLayer } from '../types/moire';
import { createDefaultProject } from '../types/moire';

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
        layer.id === layerId ? { ...layer, ...updates } : layer
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

  const addLayer = useCallback((type: PatternLayer['type'] = 'lines') => {
    const newId = (project.layers.length + 1).toString();
    const newLayer: PatternLayer = {
      id: newId,
      name: `Layer ${newId}`,
      type,
      rotation: 0,
      frequency: 20,
      phase: 0,
      position: { x: 0, y: 0 },
      thickness: 1,
      fillMode: 'stroke',
      color: '#000000',
      opacity: 1,
      visible: true,
      locked: false,
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

  // Resolution functions
  const setResolution = useCallback((width: number, height: number) => {
    setProject(prev => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        width: Math.max(100, Math.min(8000, width)), // Increased max to 8000px
        height: Math.max(100, Math.min(8000, height)),
      },
    }));
  }, []);

  const setPresetResolution = useCallback((preset: string) => {
    const resolutions: Record<string, [number, number]> = {
      'small': [400, 300],
      'medium': [800, 600],
      'large': [1200, 900],
      'hd': [1920, 1080],
      '4k': [3840, 2160],
      '8k': [7680, 4320],
      'square-small': [500, 500],
      'square-medium': [1000, 1000],
      'square-large': [2000, 2000],
      'square-4k': [4096, 4096],
      'print-a4': [2480, 3508], // A4 at 300 DPI
      'print-a3': [3508, 4961], // A3 at 300 DPI
      'ultra-wide': [3440, 1440],
      'cinema-4k': [4096, 2160],
    };

    if (resolutions[preset]) {
      const [width, height] = resolutions[preset];
      setResolution(width, height);
    }
  }, [setResolution]);

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
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    setPan,
    setResolution,
    setPresetResolution,
  };
} 