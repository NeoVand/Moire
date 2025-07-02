import React, { createContext, useContext } from 'react';
import { useMoireProject } from './useMoireProject';
import type { PatternLayer, MoireProject } from '../types/moire';

interface MoireProjectContextType {
  project: MoireProject;
  selectedLayer: PatternLayer | null;
  selectLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<PatternLayer>) => void;
  updateSelectedLayer: (updates: Partial<PatternLayer>) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
  addLayer: (type?: PatternLayer['type']) => void;
  removeLayer: (layerId: string) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setPan: (pan: { x: number; y: number }) => void;
  setResolution: (width: number, height: number) => void;
  setPresetResolution: (preset: string) => void;
}

const MoireProjectContext = createContext<MoireProjectContextType | null>(null);

export function MoireProjectProvider({ children }: { children: React.ReactNode }) {
  const projectState = useMoireProject();

  return (
    <MoireProjectContext.Provider value={projectState}>
      {children}
    </MoireProjectContext.Provider>
  );
}

export function useMoireProjectContext() {
  const context = useContext(MoireProjectContext);
  if (!context) {
    throw new Error('useMoireProjectContext must be used within a MoireProjectProvider');
  }
  return context;
} 