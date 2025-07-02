import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PatternLayer, Resolution } from '../../types/moire';

interface MoireCanvasProps {
  layers: PatternLayer[];
  resolution: Resolution;
  zoom: number;
  pan: { x: number; y: number };
  onZoomChange: (newZoom: number) => void;
  onPanChange: (newPan: { x: number; y: number }) => void;
  width?: number;
  height?: number;
  backgroundColor?: string;
  className?: string;
}

export function MoireCanvas({ 
  layers,
  resolution,
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  width = 800, 
  height = 600,
  backgroundColor = '#ffffff',
  className = '' 
}: MoireCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // Function to draw line pattern
  const drawLinePattern = (
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!layer.visible) return;

    ctx.save();
    
    // Move to center and apply position offset
    ctx.translate(canvasWidth / 2 + layer.position.x, canvasHeight / 2 + layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    
    // Set line style
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.lineWidth = layer.thickness;
    
    // Calculate spacing
    const spacing = layer.frequency;
    const maxDimension = Math.max(canvasWidth, canvasHeight);
    const numLines = Math.ceil((maxDimension * 1.5) / spacing);
    
    if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
      // Draw vertical lines
      ctx.beginPath();
      for (let i = -numLines; i <= numLines; i++) {
        const x = i * spacing + layer.phase;
        ctx.moveTo(x, -maxDimension);
        ctx.lineTo(x, maxDimension);
      }
      ctx.stroke();
    }
    
    if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
      // Draw filled stripes
      for (let i = -numLines; i <= numLines; i += 2) {
        const x1 = i * spacing + layer.phase;
        const x2 = (i + 1) * spacing + layer.phase;
        ctx.fillRect(x1, -maxDimension, x2 - x1, maxDimension * 2);
      }
    }
    
    ctx.restore();
  };

  // Function to draw circle pattern
  const drawCirclePattern = (
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!layer.visible) return;

    ctx.save();
    
    // Move to center and apply position offset
    ctx.translate(canvasWidth / 2 + layer.position.x, canvasHeight / 2 + layer.position.y);
    
    // Set circle style
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.lineWidth = layer.thickness;
    
    // Calculate spacing
    const spacing = layer.frequency;
    const maxRadius = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight) / 2;
    const numCircles = Math.ceil(maxRadius / spacing);
    
    if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
      // Draw concentric circles
      for (let i = 1; i <= numCircles; i++) {
        const radius = i * spacing + layer.phase;
        if (radius > 0) {
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    }

    if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
      // Draw filled rings
      for (let i = 1; i <= numCircles; i += 2) {
        const innerRadius = i * spacing + layer.phase;
        const outerRadius = (i + 1) * spacing + layer.phase;
        if (innerRadius > 0 && outerRadius > innerRadius) {
          ctx.beginPath();
          ctx.arc(0, 0, outerRadius, 0, 2 * Math.PI);
          ctx.arc(0, 0, innerRadius, 0, 2 * Math.PI, true);
          ctx.fill();
        }
      }
    }
    
    ctx.restore();
  };

  // Function to draw radial pattern (spokes)
  const drawRadialPattern = (
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!layer.visible) return;

    ctx.save();
    
    // Move to center and apply position offset
    ctx.translate(canvasWidth / 2 + layer.position.x, canvasHeight / 2 + layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    
    // Set line style
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.lineWidth = layer.thickness;
    
    // Calculate number of spokes based on frequency
    const numSpokes = Math.floor(layer.frequency);
    const maxRadius = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight) / 2;
    const angleStep = (2 * Math.PI) / numSpokes;
    
    if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
      // Draw radial lines (spokes)
      ctx.beginPath();
      for (let i = 0; i < numSpokes; i++) {
        const angle = i * angleStep + (layer.phase * Math.PI) / 180;
        const x = Math.cos(angle) * maxRadius;
        const y = Math.sin(angle) * maxRadius;
        
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
      // Draw filled sectors
      for (let i = 0; i < numSpokes; i += 2) {
        const angle1 = i * angleStep + (layer.phase * Math.PI) / 180;
        const angle2 = (i + 1) * angleStep + (layer.phase * Math.PI) / 180;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxRadius, angle1, angle2);
        ctx.closePath();
        ctx.fill();
      }
    }
    
    ctx.restore();
  };

  // Function to draw dot pattern
  const drawDotPattern = (
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!layer.visible) return;

    ctx.save();
    
    // Move to center and apply position offset
    ctx.translate(canvasWidth / 2 + layer.position.x, canvasHeight / 2 + layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    
    // Set dot style
    ctx.fillStyle = layer.color;
    ctx.strokeStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.lineWidth = layer.thickness;
    
    // Calculate spacing and dot size
    const spacing = layer.frequency;
    const dotSize = Math.max(1, spacing / 8);
    const numDotsX = Math.ceil(canvasWidth / spacing);
    const numDotsY = Math.ceil(canvasHeight / spacing);
    
    // Draw grid of dots
    for (let i = -numDotsX; i <= numDotsX; i++) {
      for (let j = -numDotsY; j <= numDotsY; j++) {
        const x = i * spacing + layer.phase;
        const y = j * spacing + layer.phase;
        
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, 2 * Math.PI);
        
        if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
          ctx.fill();
        }
        if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
          ctx.stroke();
        }
      }
    }
    
    ctx.restore();
  };

  // Function to draw checkerboard pattern
  const drawCheckerboardPattern = (
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!layer.visible) return;

    ctx.save();
    
    // Move to center and apply position offset
    ctx.translate(canvasWidth / 2 + layer.position.x, canvasHeight / 2 + layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    
    // Set square style
    ctx.fillStyle = layer.color;
    ctx.strokeStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.lineWidth = layer.thickness;
    
    // Calculate spacing
    const spacing = layer.frequency;
    const numSquaresX = Math.ceil(canvasWidth / spacing);
    const numSquaresY = Math.ceil(canvasHeight / spacing);
    
    // Draw checkerboard squares
    for (let i = -numSquaresX; i <= numSquaresX; i++) {
      for (let j = -numSquaresY; j <= numSquaresY; j++) {
        const x = i * spacing + layer.phase;
        const y = j * spacing + layer.phase;
        
        // Checkerboard pattern: fill alternate squares
        if ((i + j) % 2 === 0) {
          if (layer.fillMode === 'fill' || layer.fillMode === 'both') {
            ctx.fillRect(x, y, spacing, spacing);
          }
          if (layer.fillMode === 'stroke' || layer.fillMode === 'both') {
            ctx.strokeRect(x, y, spacing, spacing);
          }
        }
      }
    }
    
    ctx.restore();
  };

  // Function to draw hexagonal pattern
  const drawHexagonalPattern = (
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!layer.visible) return;

    ctx.save();
    
    // Move to center and apply position offset
    ctx.translate(canvasWidth / 2 + layer.position.x, canvasHeight / 2 + layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    
    // Set hexagon style
    ctx.fillStyle = layer.color;
    ctx.strokeStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.lineWidth = layer.thickness;
    
    // Calculate hexagonal grid parameters
    const spacing = layer.frequency;
    const hexRadius = spacing / 2.5; // Adjusted for better spacing
    const hexWidth = hexRadius * 2;
    const hexHeight = hexRadius * Math.sqrt(3);
    const rowHeight = hexHeight * 0.75; // Overlap for proper hexagonal tiling
    
    // Calculate grid bounds with extra margin
    const maxDimension = Math.max(canvasWidth, canvasHeight);
    const numRows = Math.ceil((maxDimension * 2) / rowHeight) + 2;
    const numCols = Math.ceil((maxDimension * 2) / hexWidth) + 2;
    
    // Draw hexagonal grid
    for (let row = -numRows; row <= numRows; row++) {
      for (let col = -numCols; col <= numCols; col++) {
        // Offset every other row for proper hexagonal tiling
        const offsetX = (row % 2) * (hexWidth / 2);
        const x = col * hexWidth + offsetX + (layer.phase % hexWidth);
        const y = row * rowHeight + (layer.phase % rowHeight);
        
        // Draw hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const hexX = x + hexRadius * Math.cos(angle);
          const hexY = y + hexRadius * Math.sin(angle);
          
          if (i === 0) {
            ctx.moveTo(hexX, hexY);
          } else {
            ctx.lineTo(hexX, hexY);
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
    
    ctx.restore();
  };

  const generateHexagonalPattern = useCallback((ctx: CanvasRenderingContext2D, layer: PatternLayer, width: number, height: number) => {
    const { frequency, position, rotation, thickness, opacity, fillMode, color, phase } = layer;
    
    ctx.save();
    ctx.globalAlpha = opacity;
    
    // Apply transforms
    ctx.translate(width / 2 + position.x, height / 2 + position.y);
    ctx.rotate((rotation + phase) * Math.PI / 180);
    
    const spacing = Math.max(5, 200 / frequency);
    const hexHeight = spacing * Math.sqrt(3) / 2; // Height of hexagon
    const rowHeight = hexHeight * 0.75; // Vertical spacing between rows

    // Calculate bounds for hexagonal grid
    const bounds = Math.sqrt(width * width + height * height);
    const cols = Math.ceil(bounds / spacing) + 2;
    const rows = Math.ceil(bounds / rowHeight) + 2;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = thickness;
    
    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Offset every other row
        const xOffset = (row % 2) * (spacing / 2);
        const x = col * spacing + xOffset;
        const y = row * rowHeight;
        
        // Draw hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * 60) * Math.PI / 180;
          const hx = x + Math.cos(angle) * (spacing / 3);
          const hy = y + Math.sin(angle) * (spacing / 3);
          
          if (i === 0) {
            ctx.moveTo(hx, hy);
          } else {
            ctx.lineTo(hx, hy);
          }
        }
        ctx.closePath();
        
        if (fillMode === 'fill' || fillMode === 'both') {
          ctx.fill();
        }
        if (fillMode === 'stroke' || fillMode === 'both') {
          ctx.stroke();
        }
      }
    }
    
    ctx.restore();
  }, []);

  // Main rendering function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get the computed style to check the current theme
    const computedStyle = getComputedStyle(document.documentElement);
    const isDarkMode = computedStyle.getPropertyValue('--bg-primary').trim().includes('11');
    
    // Set theme-aware background
    ctx.fillStyle = isDarkMode ? '#374151' : '#f3f4f6'; // Dark gray in dark mode, light gray in light mode
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply zoom and pan transforms
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(pan.x / zoom, pan.y / zoom);

    // Set blend mode for moiré effect
    ctx.globalCompositeOperation = 'multiply';

    layers.forEach(layer => {
      if (!layer.visible) return;

      switch (layer.type) {
        case 'lines':
          drawLinePattern(ctx, layer, canvas.width / zoom, canvas.height / zoom);
          break;
        case 'circles':
          drawCirclePattern(ctx, layer, canvas.width / zoom, canvas.height / zoom);
          break;
        case 'radial':
          drawRadialPattern(ctx, layer, canvas.width / zoom, canvas.height / zoom);
          break;
        case 'dots':
          drawDotPattern(ctx, layer, canvas.width / zoom, canvas.height / zoom);
          break;
        case 'checkerboard':
          drawCheckerboardPattern(ctx, layer, canvas.width / zoom, canvas.height / zoom);
          break;
        case 'hexagonal':
          generateHexagonalPattern(ctx, layer, canvas.width / zoom, canvas.height / zoom);
          break;
      }
    });

    ctx.restore();
  }, [layers, resolution, zoom, pan, drawLinePattern, drawCirclePattern, drawRadialPattern, drawDotPattern, drawCheckerboardPattern, generateHexagonalPattern]);

  // Handle wheel events for zoom and pan
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if modifier keys are pressed
    const isZoomGesture = e.ctrlKey || e.metaKey;
    
    if (isZoomGesture) {
      // Zoom gesture
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));
      
      // Calculate zoom point for proper zoom-to-mouse behavior
      const zoomPoint = {
        x: (mouseX - pan.x) / zoom,
        y: (mouseY - pan.y) / zoom
      };
      
      const newPan = {
        x: mouseX - zoomPoint.x * newZoom,
        y: mouseY - zoomPoint.y * newZoom
      };
      
      onZoomChange(newZoom);
      onPanChange(newPan);
    } else {
      // Pan gesture
      const panSensitivity = 1;
      const newPan = {
        x: pan.x - e.deltaX * panSensitivity,
        y: pan.y - e.deltaY * panSensitivity
      };
      onPanChange(newPan);
    }
  }, [zoom, pan, onZoomChange, onPanChange]);

  // Handle mouse events for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;

    onPanChange({
      x: pan.x + deltaX,
      y: pan.y + deltaY
    });

    setLastMousePos({ x: e.clientX, y: e.clientY });
  }, [isDragging, lastMousePos, pan, onPanChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Set up wheel event listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Render whenever layers change
  useEffect(() => {
    render();
  }, [layers, zoom, pan, render]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={resolution.width}
        height={resolution.height}
        className="border border-[var(--border)] cursor-move"
        style={{
          width: `${resolution.width * 0.5}px`,
          height: `${resolution.height * 0.5}px`,
          imageRendering: 'pixelated'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* Zoom and Pan Info */}
      <div className="absolute top-2 left-2 bg-[var(--bg-secondary)] bg-opacity-90 rounded px-2 py-1 text-xs text-[var(--text-secondary)]">
        Zoom: {Math.round(zoom * 100)}% | Pan: {Math.round(pan.x)}, {Math.round(pan.y)}
      </div>
    </div>
  );
} 