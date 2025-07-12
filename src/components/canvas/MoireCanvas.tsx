import { useRef, useEffect, useCallback, useState } from 'react';
import type { PatternLayer } from '../../types/moire';
import { useCanvasInteractions } from '../../hooks/useCanvasInteractions';
import { InteractionHelper } from './InteractionHelper';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import { ReactP5Wrapper } from '@p5-wrapper/react';
import type { P5CanvasInstance, SketchProps } from '@p5-wrapper/react';
import * as p5Types from 'p5';
import baseVert from '../../shaders/base.vert?raw';
import lineFrag from '../../shaders/linePattern.frag?raw';
import curveFrag from '../../shaders/curvePattern.frag?raw';

interface MoireCanvasProps {
  layers: PatternLayer[];
  zoom: number;
  pan: { x: number; y: number };
  backgroundColor: string;
  onZoomChange: (newZoom: number) => void;
  onPanChange: (newPan: { x: number; y: number }) => void;
}

type MoireProps = SketchProps & {
  layers: PatternLayer[];
  width: number;
  height: number;
  panX: number;
  panY: number;
  zoom: number;
  backgroundColor: string;
};

// Move sketch definition outside component to avoid recreating it
const createMoireSketch = () => {
  return (p5: P5CanvasInstance<MoireProps>) => {
    let layers: PatternLayer[] = [];
    let panX = 0, panY = 0, zoom = 1;
    let backgroundColor = '#ffffff';
    let lineShader: p5Types.Shader | null = null;
    let curveShader: p5Types.Shader | null = null;
    let shadersReady = false;
    let propsReceived = false;

    p5.setup = () => {
      p5.createCanvas(p5.width, p5.height, p5.WEBGL);
      p5.noLoop();
      
      // Handle high DPI displays
      // const pixelDensity = window.devicePixelRatio || 1;
      // p5.pixelDensity(pixelDensity);

      // Create shaders from the imported raw strings
      try {
        lineShader = p5.createShader(baseVert, lineFrag);
      } catch (err) {
        console.error('Line shader creation failed:', err);
      }
      
      try {
        curveShader = p5.createShader(baseVert, curveFrag);
      } catch (err) {
        console.error('Curve shader creation failed:', err);
      }

      shadersReady = !!(lineShader && curveShader);
      
      // Don't render yet - wait for props to be received
  
    };

    p5.updateWithProps = (props: MoireProps) => {
      const devicePixelRatio = window.devicePixelRatio || 1;
      const scaledWidth = props.width * devicePixelRatio;
      const scaledHeight = props.height * devicePixelRatio;
      
      if (props.width && props.height && (p5.width !== scaledWidth || p5.height !== scaledHeight)) {
        p5.resizeCanvas(scaledWidth, scaledHeight);
        // Set CSS size to original dimensions
        const canvas = (p5 as any).canvas;
        if (canvas) {
          canvas.style.width = props.width + 'px';
          canvas.style.height = props.height + 'px';
        }
      }
      layers = props.layers || [];
      panX = props.panX || 0;
      panY = props.panY || 0;
      zoom = props.zoom || 1;
      backgroundColor = props.backgroundColor || '#ffffff';
      
      // Mark that we've received props
      if (!propsReceived) {
        propsReceived = true;
      }
      
      // Always trigger redraw
      p5.redraw();
    };

    p5.draw = () => {
      // Always set the background color, even if shaders aren't ready
      p5.background(backgroundColor);
      p5.resetMatrix();

      // If shaders aren't ready, just show background
      if (!shadersReady) {
        return;
      }

      layers.forEach((layer) => {
        if (!layer.visible) return;

        if (layer.type === 'straight-lines' && lineShader) {
          p5.shader(lineShader);

          const spacing = layer.parameters.spacing || 20;
          lineShader.setUniform('u_density', 1.0 / spacing);
          lineShader.setUniform('u_angle', (layer.rotation * Math.PI / 180) || 0);
          lineShader.setUniform('u_thickness', layer.parameters.thickness || 1);
          const col = p5.color(layer.color);
          lineShader.setUniform('u_color', [p5.red(col)/255, p5.green(col)/255, p5.blue(col)/255, 1.0]);
          lineShader.setUniform('u_resolution', [p5.width, p5.height]);
          lineShader.setUniform('u_position', [layer.position.x, layer.position.y]);
          lineShader.setUniform('u_rotation', layer.rotation * Math.PI / 180);
          // For straight-lines, fix pan direction:
          const layerPanX = -panX; // Invert X direction
          const layerPanY = panY;  // Keep Y direction normal
          lineShader.setUniform('u_pan', [layerPanX, layerPanY]);
          lineShader.setUniform('u_zoom', zoom);
          const phaseOffset = ((layer.parameters.phase || 0) / 360) * spacing;
          lineShader.setUniform('u_phase', phaseOffset);
          lineShader.setUniform('u_opacity', layer.opacity || 1);

          p5.blendMode(p5.BLEND);
          p5.quad(-1, -1, 1, -1, 1, 1, -1, 1);
        } else if ((layer.type === 'concentric-circles' || layer.type === 'concentric-squares' || layer.type === 'concentric-triangles' || layer.type === 'concentric-polygons') && curveShader) {
          p5.shader(curveShader);
          const spacing = layer.parameters.spacing || 20;
          curveShader.setUniform('u_density', 1.0 / spacing);
          curveShader.setUniform('u_thickness', layer.parameters.thickness || 1.5);
          const col = p5.color(layer.color);
          curveShader.setUniform('u_color', [p5.red(col)/255, p5.green(col)/255, p5.blue(col)/255, 1.0]);
          curveShader.setUniform('u_resolution', [p5.width, p5.height]);
          curveShader.setUniform('u_position', [layer.position.x, layer.position.y]);
          curveShader.setUniform('u_rotation', layer.rotation * Math.PI / 180);
          // For concentric shapes, fix pan direction:
          const layerPanX = -panX; // Invert X direction  
          const layerPanY = panY;  // Keep Y direction normal
          curveShader.setUniform('u_pan', [layerPanX, layerPanY]);
          curveShader.setUniform('u_zoom', zoom);
          curveShader.setUniform('u_opacity', layer.opacity || 1);
          curveShader.setUniform('u_phase', layer.parameters.phase || 0);
          curveShader.setUniform('u_offsetX', layer.parameters.offsetX || 0);
          curveShader.setUniform('u_offsetY', layer.parameters.offsetY || 0);
          // Pass shape type to shader (1.0 for circles, 2.0 for squares, 3.0 for triangles, 4.0 for polygons)
          let shapeType = 1.0; // Default to circles
          let sides = 3.0; // Default number of sides
          if (layer.type === 'concentric-circles') {
            shapeType = 1.0;
          } else if (layer.type === 'concentric-squares') {
            shapeType = 2.0;
          } else if (layer.type === 'concentric-triangles') {
            shapeType = 3.0;
          } else if (layer.type === 'concentric-polygons') {
            shapeType = 4.0;
            sides = layer.parameters.count || 6; // Use count parameter for number of sides (default hexagon)
          }
          curveShader.setUniform('u_shapeType', shapeType);
          curveShader.setUniform('u_sides', sides);
          
          p5.blendMode(p5.BLEND);
          p5.quad(-1, -1, 1, -1, 1, 1, -1, 1);
        }
      });
    };
  };
};

export function MoireCanvas({ layers, zoom, pan, backgroundColor, onZoomChange, onPanChange }: MoireCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [showHelp, setShowHelp] = useState(false);
  
  // Create sketch once and reuse it
  const moireSketch = useRef(createMoireSketch()).current;
  

  
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

  // Update canvas size to fill container
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setCanvasSize({
          width: clientWidth,
          height: clientHeight,
        });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Force initial render after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanvasSize(prev => ({ ...prev, _forceRender: Date.now() }));
    }, 200);
    return () => clearTimeout(timer);
  }, []);

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
      <ReactP5Wrapper 
        sketch={moireSketch} 
        layers={layers}
        width={canvasSize.width} 
        height={canvasSize.height} 
        panX={pan.x} 
        panY={pan.y} 
        zoom={zoom} 
        backgroundColor={backgroundColor} 
      />
      
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