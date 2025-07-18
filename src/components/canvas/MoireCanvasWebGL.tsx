import { useRef, useEffect, useCallback, useState } from 'react';
import type { PatternLayer } from '../../types/moire';
import { useCanvasInteractions } from '../../hooks/useCanvasInteractions';
import { InteractionHelper } from './InteractionHelper';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import { WebGLRenderer } from '../../utils/WebGLRenderer';
import type { ShaderProgram } from '../../utils/WebGLRenderer';
import { baseVertexShader, lineFragmentShader, fastConcentricShader } from '../../utils/shaderSources';

interface MoireCanvasProps {
  layers: PatternLayer[];
  zoom: number;
  pan: { x: number; y: number };
  backgroundColor: string;
  onZoomChange: (newZoom: number) => void;
  onPanChange: (newPan: { x: number; y: number }) => void;
}

export function MoireCanvas({ layers, zoom, pan, backgroundColor, onZoomChange, onPanChange }: MoireCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [showHelp, setShowHelp] = useState(false);
  const lineShaderRef = useRef<ShaderProgram | null>(null);
  const curveShaderRef = useRef<ShaderProgram | null>(null);
  const rafRef = useRef<number | null>(null);
  const [shaderError, setShaderError] = useState<string | null>(null);
  
  // Get selected layer info for interaction helper
  const { selectedLayer } = useMoireProjectContext();
  
  // Initialize canvas interactions with the new hook
  const {
    interactionState,
    statusText,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    setupGlobalListeners,
  } = useCanvasInteractions(zoom, pan, canvasSize, onPanChange);

  // Initialize WebGL renderer
  useEffect(() => {
    if (!canvasRef.current) {
      console.error('Canvas ref not available');
      return;
    }

    try {
      const renderer = new WebGLRenderer(canvasRef.current);
      rendererRef.current = renderer;

      // Create shader programs
      try {
        lineShaderRef.current = renderer.createShaderProgram(baseVertexShader, lineFragmentShader);
        curveShaderRef.current = renderer.createShaderProgram(baseVertexShader, fastConcentricShader);
        setShaderError(null); // Clear any previous errors
      } catch (err) {
        console.error('Failed to create shaders:', err);
        setShaderError(`Shader error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      console.error('Failed to initialize WebGL:', err);
      setShaderError(`WebGL error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      // Clear shader refs
      lineShaderRef.current = null;
      curveShaderRef.current = null;
    };
  }, []);

  // Update canvas size to fill container
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current && rendererRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setCanvasSize({
          width: clientWidth,
          height: clientHeight,
        });
        rendererRef.current.resize(clientWidth, clientHeight);
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Render function
  const render = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !lineShaderRef.current || !curveShaderRef.current) return;

    renderer.clear(backgroundColor);

    // Get pixel ratio for high DPI displays
    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvasSize.width * pixelRatio;
    const height = canvasSize.height * pixelRatio;

    layers.forEach((layer) => {
      if (!layer.visible) return;

      try {
        if (layer.type === 'straight-lines') {
          const shader = lineShaderRef.current;
          if (!shader) return;

          const spacing = layer.parameters.spacing || 20;
          const uniforms = {
            u_density: 1.0 / spacing,
            u_angle: (layer.rotation * Math.PI / 180) || 0,
            u_thickness: layer.parameters.thickness || 1,
            u_color: hexToRgba(layer.color),
            u_resolution: [width, height],
            u_position: [layer.position.x, layer.position.y],
            u_rotation: layer.rotation * Math.PI / 180,
            u_pan: [-pan.x, pan.y],
            u_zoom: zoom,
            u_phase: ((layer.parameters.phase || 0) / 360) * spacing,
            u_opacity: layer.opacity || 1
          };

          renderer.renderLayer({ type: 'line', shader, uniforms });
        } else if (
          layer.type === 'concentric-circles' || 
          layer.type === 'concentric-squares' || 
          layer.type === 'concentric-triangles' || 
          layer.type === 'concentric-polygons'
        ) {
          const shader = curveShaderRef.current;
          if (!shader) return;

          const spacing = layer.parameters.spacing || 20;
          let shapeType = 1.0;
          let sides = 3.0;
          
          if (layer.type === 'concentric-circles') {
            shapeType = 1.0;
          } else if (layer.type === 'concentric-squares') {
            shapeType = 2.0;
          } else if (layer.type === 'concentric-triangles') {
            shapeType = 3.0;
          } else if (layer.type === 'concentric-polygons') {
            shapeType = 4.0;
            sides = layer.parameters.count || 6;
          }

          const uniforms = {
            u_density: 1.0 / spacing,
            u_thickness: layer.parameters.thickness || 1.5,
            u_color: hexToRgba(layer.color),
            u_resolution: [width, height],
            u_position: [layer.position.x, layer.position.y],
            u_rotation: layer.rotation * Math.PI / 180,
            u_pan: [-pan.x, pan.y],
            u_zoom: zoom,
            u_opacity: layer.opacity || 1,
            u_phase: layer.parameters.phase || 0,
            u_offsetX: layer.parameters.offsetX || 0,
            u_offsetY: layer.parameters.offsetY || 0,
            u_rotationOffset: layer.parameters.rotationOffset || 0,
            u_shapeType: shapeType,
            u_sides: sides
          };

          renderer.renderLayer({ type: 'curve', shader, uniforms });
        }
      } catch (err) {
        console.error('Error rendering layer:', layer.name, err);
      }
    });
  }, [layers, zoom, pan, backgroundColor, canvasSize]);

  // Render loop
  useEffect(() => {
    const animate = () => {
      render();
      rafRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [render]);

  // Set up global keyboard event listeners for modifier key detection
  useEffect(() => {
    return setupGlobalListeners();
  }, [setupGlobalListeners]);

  // Add keyboard shortcut for help toggle
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        // Only toggle if not typing in an input
        if (document.activeElement?.tagName !== 'INPUT' && 
            document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          
          // Remove focus from any active element to prevent blue outline
          if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          
          setShowHelp(prev => !prev);
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomDelta = -e.deltaY * 0.001;
    const zoomFactor = Math.exp(zoomDelta);
    const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));
    const navbarHeight = 40;
    const canvasPointX = (mouseX - canvasSize.width / 2 - pan.x) / zoom;
    const canvasPointY = (mouseY - canvasSize.height / 2 - navbarHeight - pan.y) / zoom;
    const newPanX = mouseX - canvasSize.width / 2 - canvasPointX * newZoom;
    const newPanY = mouseY - canvasSize.height / 2 - navbarHeight - canvasPointY * newZoom;
    onZoomChange(newZoom);
    onPanChange({ x: newPanX, y: newPanY });
  }, [zoom, pan, onZoomChange, onPanChange, canvasSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />
      
      {/* Error display */}
      {shaderError && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-6 bg-red-900/90 backdrop-blur-sm text-white rounded-lg max-w-lg">
          <h3 className="text-lg font-bold mb-2">WebGL Error</h3>
          <p className="text-sm">{shaderError}</p>
          <p className="text-xs mt-2 opacity-75">Check the browser console for more details</p>
        </div>
      )}
      
      {/* Status indicator for active interaction modes */}
      {interactionState.currentMode !== 'pan' && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-3 py-2 bg-black/80 backdrop-blur-sm text-white text-sm rounded-lg border border-white/20 font-medium z-40">
          {statusText}
        </div>
      )}
      
      {/* Help toggle button */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className="absolute top-4 left-4 w-8 h-8 bg-black/80 backdrop-blur-sm text-white rounded-lg border border-white/20 hover:bg-white/10 transition-colors flex items-center justify-center"
        title="Toggle canvas controls help (H)"
      >
        <span className="text-sm font-bold">?</span>
      </button>
      
      {/* Interaction helper */}
      <InteractionHelper
        currentMode={interactionState.currentMode}
        selectedLayerName={selectedLayer?.name}
        isVisible={showHelp}
      />
    </div>
  );
}

// Helper function to convert hex to RGBA
function hexToRgba(hex: string): [number, number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
    1.0
  ] : [1, 1, 1, 1];
} 