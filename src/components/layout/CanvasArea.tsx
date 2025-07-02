import React from 'react';
import { MoireCanvas } from '../canvas/MoireCanvas';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import type { Resolution } from '../../types/moire';

export function CanvasArea() {
  const { project, setZoom, setPan } = useMoireProjectContext();

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  const handlePanChange = (newPan: { x: number; y: number }) => {
    setPan(newPan);
  };

  const currentResolution: Resolution = {
    label: `${project.canvas.width}×${project.canvas.height}`,
    width: project.canvas.width,
    height: project.canvas.height
  };

  return (
    <main className="flex-1 bg-[var(--bg-primary)] flex flex-col">
      {/* Canvas Container - Centered */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        <MoireCanvas 
          layers={project.layers}
          resolution={currentResolution}
          zoom={project.canvas.zoom}
          pan={project.canvas.pan}
          onZoomChange={handleZoomChange}
          onPanChange={handlePanChange}
        />
      </div>
      
      {/* Info overlay */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-[var(--bg-secondary)]/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-3">
          <span>Interactive Moiré Pattern</span>
          <span>•</span>
          <span>{project.layers.filter(l => l.visible).length} layers active</span>
          <span>•</span>
          <span>Trackpad: Ctrl+Scroll to zoom, Scroll to pan</span>
        </div>
      </div>
    </main>
  );
} 