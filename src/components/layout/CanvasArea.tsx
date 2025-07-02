import { useRef } from 'react';
import { MoireCanvas } from '../canvas/MoireCanvas';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';

export function CanvasArea() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { project, setZoom, setPan } = useMoireProjectContext();

  return (
    <div ref={containerRef} className="flex-1 min-w-0 relative">
      <MoireCanvas 
        layers={project.layers}
        zoom={project.canvas.zoom}
        pan={project.canvas.pan}
        backgroundColor={project.canvas.backgroundColor}
        onZoomChange={setZoom}
        onPanChange={setPan}
      />
    </div>
  );
} 