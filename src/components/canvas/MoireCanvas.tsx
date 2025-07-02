import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { PatternLayer } from '../../types/moire';

interface MoireCanvasProps {
  layers: PatternLayer[];
  zoom: number;
  pan: { x: number; y: number };
  backgroundColor: string;
  onZoomChange: (newZoom: number) => void;
  onPanChange: (newPan: { x: number; y: number }) => void;
}

export function MoireCanvas({ layers, zoom, pan, backgroundColor, onZoomChange, onPanChange }: MoireCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

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

  // PATTERN RENDERING FUNCTIONS

  // Lines Category
  const drawStraightLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 20, thickness = 1, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const offset = (phase / 360) * spacing;
    const lineCount = Math.ceil((bounds * 2) / spacing) + 2;

    for (let i = -lineCount; i <= lineCount; i++) {
      const y = i * spacing + offset;
      ctx.beginPath();
      ctx.moveTo(-bounds, y);
      ctx.lineTo(bounds, y);
      ctx.stroke();
    }
  };

  const drawRadialLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { count = 24, thickness = 1, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const angleStep = (2 * Math.PI) / count;
    const phaseRad = (phase / 360) * 2 * Math.PI;

    for (let i = 0; i < count; i++) {
      const angle = i * angleStep + phaseRad;
      const x = Math.cos(angle) * bounds;
      const y = Math.sin(angle) * bounds;
      
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  // Curves Category
  const drawSineWaves = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 40, amplitude = 20, wavelength = 80, thickness = 1.5, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    const lineCount = Math.ceil((bounds * 2) / spacing) + 2;

    for (let i = -lineCount; i <= lineCount; i++) {
      const baseY = i * spacing;
      
      ctx.beginPath();
      for (let x = -bounds; x <= bounds; x += 2) {
        const y = baseY + Math.sin((x / wavelength) * 2 * Math.PI + phaseRad) * amplitude;
        if (x === -bounds) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  };

  const drawSpiral = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { turns = 8, thickness = 1.5, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const maxRadius = bounds;
    const totalTurns = turns;
    const steps = Math.max(500, totalTurns * 50); // More steps for smoother spirals
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * totalTurns * 2 * Math.PI + phaseRad;
      const radius = t * maxRadius;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };

  // Grids Category
  const drawRectangularGrid = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 30, thickness = 1, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const offset = (phase / 100) * spacing;
    const lineCount = Math.ceil((bounds * 2) / spacing) + 2;

    // Vertical lines
    for (let i = -lineCount; i <= lineCount; i++) {
      const x = i * spacing + offset;
      ctx.beginPath();
      ctx.moveTo(x, -bounds);
      ctx.lineTo(x, bounds);
      ctx.stroke();
    }

    // Horizontal lines
    for (let i = -lineCount; i <= lineCount; i++) {
      const y = i * spacing + offset;
      ctx.beginPath();
      ctx.moveTo(-bounds, y);
      ctx.lineTo(bounds, y);
      ctx.stroke();
    }
  };

  const drawHexagonalGrid = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 40, thickness = 1, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const hexRadius = spacing / 2;
    const hexWidth = hexRadius * 2;
    const hexHeight = hexRadius * Math.sqrt(3);
    const verticalSpacing = hexHeight * 0.75; // Proper vertical spacing for tessellation
    const horizontalSpacing = hexWidth * 0.75; // Proper horizontal spacing
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    const cols = Math.ceil(bounds / horizontalSpacing) + 3;
    const rows = Math.ceil(bounds / verticalSpacing) + 3;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Offset every other row for proper hexagonal tessellation
        const xOffset = (row % 2) * (horizontalSpacing / 2);
        const x = col * horizontalSpacing + xOffset;
        const y = row * verticalSpacing;
        
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * 60) * Math.PI / 180 + phaseRad;
          const hx = x + Math.cos(angle) * hexRadius;
          const hy = y + Math.sin(angle) * hexRadius;
          
          if (i === 0) {
            ctx.moveTo(hx, hy);
          } else {
            ctx.lineTo(hx, hy);
          }
        }
        ctx.closePath();
        
        if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
          ctx.fill();
        }
        if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
          ctx.stroke();
        }
      }
    }
  };

  const drawTriangularGrid = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 35, thickness = 1, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const triangleHeight = spacing * Math.sqrt(3) / 2;
    const rowHeight = triangleHeight; // Each row is one triangle height apart
    const phaseRad = (phase / 360) * 2 * Math.PI;
    const cols = Math.ceil(bounds / spacing) + 3;
    const rows = Math.ceil(bounds / rowHeight) + 3;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Alternate triangle orientation and position for proper tessellation
        const isEvenRow = row % 2 === 0;
        const isUpTriangle = (col + row) % 2 === 0;
        
        const xOffset = isEvenRow ? 0 : spacing / 2;
        const x = col * spacing + xOffset;
        const y = row * rowHeight;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(phaseRad);
        
        ctx.beginPath();
        if (isUpTriangle) {
          // Upward pointing triangle
          ctx.moveTo(0, -triangleHeight / 2);
          ctx.lineTo(-spacing / 2, triangleHeight / 2);
          ctx.lineTo(spacing / 2, triangleHeight / 2);
        } else {
          // Downward pointing triangle
          ctx.moveTo(0, triangleHeight / 2);
          ctx.lineTo(-spacing / 2, -triangleHeight / 2);
          ctx.lineTo(spacing / 2, -triangleHeight / 2);
        }
        ctx.closePath();
        
        if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
          ctx.fill();
        }
        if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
          ctx.stroke();
        }
        
        ctx.restore();
      }
    }
  };

  // Concentric Category
  const drawConcentricCircles = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 20, thickness = 1.5, count = 15, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const startRadius = phase;
    
    for (let i = 0; i < count; i++) {
      const radius = startRadius + i * spacing;
      if (radius > bounds) break;
      
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  const drawConcentricSquares = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 25, thickness = 1.5, count = 12, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const startSize = phase;
    
    for (let i = 0; i < count; i++) {
      const size = startSize + i * spacing;
      if (size > bounds) break;
      
      if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
        ctx.fillRect(-size, -size, size * 2, size * 2);
      }
      if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
        ctx.strokeRect(-size, -size, size * 2, size * 2);
      }
    }
  };

  const drawConcentricHexagons = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 22, thickness = 1.5, count = 10, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const startRadius = Math.max(1, phase);
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    for (let i = 0; i < count; i++) {
      const radius = startRadius + i * spacing;
      if (radius > bounds) break;
      
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (j * 60) * Math.PI / 180 + phaseRad;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      
      if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
        ctx.fill();
      }
      if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
        ctx.stroke();
      }
    }
  };

  // Main pattern dispatcher
  const drawPattern = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    ctx.save();
    
    // Apply layer transformations
    ctx.translate(layer.position.x, layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    
    // Set colors and styles
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;

    // Draw pattern based on type
    switch (layer.type) {
      case 'straight-lines':
        drawStraightLines(ctx, layer, bounds);
        break;
      case 'radial-lines':
        drawRadialLines(ctx, layer, bounds);
        break;
      case 'sine-waves':
        drawSineWaves(ctx, layer, bounds);
        break;
      case 'spiral':
        drawSpiral(ctx, layer, bounds);
        break;
      case 'rectangular-grid':
        drawRectangularGrid(ctx, layer, bounds);
        break;
      case 'hexagonal-grid':
        drawHexagonalGrid(ctx, layer, bounds);
        break;
      case 'triangular-grid':
        drawTriangularGrid(ctx, layer, bounds);
        break;
      case 'concentric-circles':
        drawConcentricCircles(ctx, layer, bounds);
        break;
      case 'concentric-squares':
        drawConcentricSquares(ctx, layer, bounds);
        break;
      case 'concentric-hexagons':
        drawConcentricHexagons(ctx, layer, bounds);
        break;
      default:
        console.warn(`Unknown pattern type: ${layer.type}`);
    }
    
    ctx.restore();
  };

  // Main rendering function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with light gray background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // Apply zoom and pan transforms
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(pan.x / zoom, pan.y / zoom);
    ctx.translate(canvasSize.width / (2 * zoom), canvasSize.height / (2 * zoom));

    // Calculate bounds for pattern rendering
    const maxDimension = Math.max(canvasSize.width, canvasSize.height);
    const bounds = (maxDimension / zoom) * 0.8; // Render beyond visible area

    // Render all visible layers
    layers.forEach(layer => {
      if (layer.visible) {
        drawPattern(ctx, layer, bounds);
      }
    });

    ctx.restore();
  }, [layers, zoom, pan, canvasSize, backgroundColor]);

  // Handle wheel events for zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Slower, more controlled zoom
    const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05; // Much more gradual
    const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor)); // Allow more zoom range
    
    // Calculate the point in the canvas that the mouse is over
    const canvasPointX = (mouseX - pan.x - canvasSize.width / 2) / zoom;
    const canvasPointY = (mouseY - pan.y - canvasSize.height / 2) / zoom;
    
    // Calculate new pan to keep the mouse point stationary
    const newPan = {
      x: mouseX - canvasSize.width / 2 - canvasPointX * newZoom,
      y: mouseY - canvasSize.height / 2 - canvasPointY * newZoom
    };
    
    onZoomChange(newZoom);
    onPanChange(newPan);
  }, [zoom, pan, onZoomChange, onPanChange, canvasSize]);

  // Handle mouse events for dragging to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;

    onPanChange({
      x: pan.x + deltaX,
      y: pan.y + deltaY
    });

    setLastMousePos({ x: e.clientX, y: e.clientY });
  }, [isDragging, lastMousePos, pan, onPanChange]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Global mouse move and up handlers for better drag experience
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;

      onPanChange({
        x: pan.x + deltaX,
        y: pan.y + deltaY
      });

      setLastMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, lastMousePos, pan, onPanChange]);

  // Set up wheel event listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Set up high DPI canvas for Retina displays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Set actual size in memory (scaled up for Retina)
    canvas.width = canvasSize.width * devicePixelRatio;
    canvas.height = canvasSize.height * devicePixelRatio;
    
    // Scale the context back down to the original size
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // Set display size (CSS pixels)
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    
    render();
  }, [canvasSize, render]);

  // Render whenever layers change
  useEffect(() => {
    render();
  }, [render]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-move"
        style={{
          imageRendering: 'auto'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
} 