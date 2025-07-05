import { useRef, useEffect, useCallback, useState } from 'react';
import type { PatternLayer } from '../../types/moire';
import { useCanvasInteractions } from '../../hooks/useCanvasInteractions';
import { InteractionHelper } from './InteractionHelper';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';

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
  const [showHelp, setShowHelp] = useState(false);
  
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

  // PATTERN RENDERING FUNCTIONS

  // Lines Category
  const drawStraightLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 20, thickness = 1, phase = 0, offsetX = 0, count = 50, size = 800 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseOffset = (phase / 360) * spacing;
    const maxLines = Math.min(count, 1000); // Enforce maximum limit
    const halfLines = Math.floor(maxLines / 2);
    
    // Use user-controlled line length, but cap at reasonable limits to prevent zoom conflicts
    const lineLength = Math.min(size / 2, Math.max(canvasSize.width, canvasSize.height) / zoom);

    for (let i = -halfLines; i <= halfLines; i++) {
      // Progressive spacing: each line's spacing increases by offsetX * line_index
      const cumulativeSpacing = i * spacing + (offsetX * i * Math.abs(i));
      const y = cumulativeSpacing + phaseOffset;
      
      // Only draw if within bounds
      if (Math.abs(y) <= bounds) {
        ctx.beginPath();
        ctx.moveTo(-lineLength, y);
        ctx.lineTo(lineLength, y);
        ctx.stroke();
      }
    }
  };

  const drawRadialLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { count = 24, thickness = 1, phase = 0, spacing = 0, offsetY = 360 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const angularSpan = Math.max(10, Math.min(360, offsetY)); // Angular span in degrees
    const angleStep = (angularSpan / 360) * (2 * Math.PI) / count; // Convert to radians
    const phaseRad = (phase / 360) * 2 * Math.PI; // Angular offset in radians
    const radialOffset = Math.max(0, spacing); // Radial offset from center

    for (let i = 0; i < count; i++) {
      const angle = i * angleStep + phaseRad;
      const startX = Math.cos(angle) * radialOffset;
      const startY = Math.sin(angle) * radialOffset;
      const endX = Math.cos(angle) * bounds;
      const endY = Math.sin(angle) * bounds;
      
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  };

  const drawSineWaveLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 30, amplitude = 15, wavelength = 60, thickness = 1.5, phase = 0, count = 30, size = 800 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    const maxLines = Math.min(count, 1000); // Enforce maximum limit
    const halfLines = Math.floor(maxLines / 2);
    
    // Use user-controlled line length, but cap at reasonable limits to prevent zoom conflicts
    const lineLength = Math.min(size / 2, Math.max(canvasSize.width, canvasSize.height) / zoom);

    for (let i = -halfLines; i <= halfLines; i++) {
      const baseY = i * spacing;
      
      // Only draw if the line would be visible within bounds
      if (Math.abs(baseY) <= bounds + amplitude) {
        ctx.beginPath();
        for (let x = -lineLength; x <= lineLength; x += 2) {
          const y = baseY + Math.sin((x / wavelength) * 2 * Math.PI + phaseRad) * amplitude;
          if (x === -lineLength) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
  };

  const drawSawtoothWaveLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 30, amplitude = 15, wavelength = 60, thickness = 1.5, phase = 0, count = 30, size = 800 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseOffset = (phase / 360) * wavelength;
    const maxLines = Math.min(count, 1000); // Enforce maximum limit
    const halfLines = Math.floor(maxLines / 2);
    
    // Use user-controlled line length, but cap at reasonable limits to prevent zoom conflicts
    const lineLength = Math.min(size / 2, Math.max(canvasSize.width, canvasSize.height) / zoom);

    for (let i = -halfLines; i <= halfLines; i++) {
      const baseY = i * spacing;
      
      // Only draw if the line would be visible within bounds
      if (Math.abs(baseY) <= bounds + amplitude) {
        ctx.beginPath();
        for (let x = -lineLength; x <= lineLength; x += 2) {
          // Create sawtooth wave: linear ramp from -amplitude to +amplitude, then drop
          const adjustedX = x + phaseOffset;
          const cyclePosition = ((adjustedX % wavelength) + wavelength) % wavelength;
          const normalizedPosition = (cyclePosition / wavelength) * 2 - 1; // -1 to 1
          const y = baseY + normalizedPosition * amplitude;
          
          if (x === -lineLength) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
  };

  const drawSquareWaveLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 30, amplitude = 15, wavelength = 60, thickness = 1.5, phase = 0, count = 30, size = 800 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseOffset = (phase / 360) * wavelength;
    const maxLines = Math.min(count, 1000); // Enforce maximum limit
    const halfLines = Math.floor(maxLines / 2);
    
    // Use user-controlled line length, but cap at reasonable limits to prevent zoom conflicts
    const lineLength = Math.min(size / 2, Math.max(canvasSize.width, canvasSize.height) / zoom);

    for (let i = -halfLines; i <= halfLines; i++) {
      const baseY = i * spacing;
      
      // Only draw if the line would be visible within bounds
      if (Math.abs(baseY) <= bounds + amplitude) {
        ctx.beginPath();
        for (let x = -lineLength; x <= lineLength; x += 2) {
          // Create square wave: alternate between +amplitude and -amplitude
          const adjustedX = x + phaseOffset;
          const cyclePosition = ((adjustedX % wavelength) + wavelength) % wavelength;
          const waveValue = (cyclePosition < wavelength / 2) ? amplitude : -amplitude;
          const y = baseY + waveValue;
          
          if (x === -lineLength) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
  };

  const drawTriangleWaveLines = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 30, amplitude = 15, wavelength = 60, thickness = 1.5, phase = 0, count = 30, size = 800 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseOffset = (phase / 360) * wavelength;
    const maxLines = Math.min(count, 1000); // Enforce maximum limit
    const halfLines = Math.floor(maxLines / 2);
    
    // Use user-controlled line length, but cap at reasonable limits to prevent zoom conflicts
    const lineLength = Math.min(size / 2, Math.max(canvasSize.width, canvasSize.height) / zoom);

    for (let i = -halfLines; i <= halfLines; i++) {
      const baseY = i * spacing;
      
      // Only draw if the line would be visible within bounds
      if (Math.abs(baseY) <= bounds + amplitude) {
        ctx.beginPath();
        for (let x = -lineLength; x <= lineLength; x += 2) {
          // Create triangle wave: ramp up from -amplitude to +amplitude, then down
          const adjustedX = x + phaseOffset;
          const cyclePosition = ((adjustedX % wavelength) + wavelength) % wavelength;
          const halfWavelength = wavelength / 2;
          
          let waveValue;
          if (cyclePosition < halfWavelength) {
            // Ramp up from -amplitude to +amplitude
            waveValue = -amplitude + (2 * amplitude * cyclePosition / halfWavelength);
          } else {
            // Ramp down from +amplitude to -amplitude
            waveValue = amplitude - (2 * amplitude * (cyclePosition - halfWavelength) / halfWavelength);
          }
          
          const y = baseY + waveValue;
          
          if (x === -lineLength) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
  };

  // Curves Category
  const drawSineWaves = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 40, amplitude = 20, wavelength = 80, thickness = 1.5, phase = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    const lineCount = Math.min(Math.ceil((bounds * 2) / spacing) + 2, 200); // Limit max lines
    
    // Limit line length to reasonable viewport-based size to prevent zoom conflicts
    const maxLineLength = Math.min(bounds, Math.max(canvasSize.width, canvasSize.height) / zoom);

    for (let i = -lineCount; i <= lineCount; i++) {
      const baseY = i * spacing;
      
      // Only draw if the line would be visible within bounds
      if (Math.abs(baseY) <= bounds + amplitude) {
        ctx.beginPath();
        for (let x = -maxLineLength; x <= maxLineLength; x += 2) {
          const y = baseY + Math.sin((x / wavelength) * 2 * Math.PI + phaseRad) * amplitude;
          if (x === -maxLineLength) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
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

  // Tiles Category
  const drawTriangularTiling = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { size = 40, spacing = 10, thickness = 1.5, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const triangleHeight = size * Math.sqrt(3) / 2;
    const gridSpacing = size + spacing; // Total distance between triangle centers
    const rowHeight = triangleHeight + spacing * 0.5; // Row spacing with gap
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    const cols = Math.ceil((bounds * 2) / gridSpacing) + 4;
    const rows = Math.ceil((bounds * 2) / rowHeight) + 4;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Progressive offset: each row/column gets more offset
        const progressiveOffsetX = offsetX * row;
        const progressiveOffsetY = offsetY * col;
        
        // Alternate triangle orientation for proper tessellation
        const isUpTriangle = (col + row) % 2 === 0;
        const xOffset = (row % 2) * (gridSpacing / 2);
        
        const x = col * gridSpacing + xOffset + progressiveOffsetX;
        const y = row * rowHeight + progressiveOffsetY;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(phaseRad);
        
      ctx.beginPath();
        if (isUpTriangle) {
          // Upward pointing triangle
          ctx.moveTo(0, -triangleHeight / 2);
          ctx.lineTo(-size / 2, triangleHeight / 2);
          ctx.lineTo(size / 2, triangleHeight / 2);
        } else {
          // Downward pointing triangle
          ctx.moveTo(0, triangleHeight / 2);
          ctx.lineTo(-size / 2, -triangleHeight / 2);
          ctx.lineTo(size / 2, -triangleHeight / 2);
        }
        ctx.closePath();
        
        // Fill if fillColor is provided and not "none"
        if (layer.fillColor && layer.fillColor !== 'none') {
          ctx.fillStyle = layer.fillColor;
          ctx.fill();
        }
        
        // Stroke if color is not "none"
        if (layer.color !== 'none') {
      ctx.stroke();
    }

        ctx.restore();
      }
    }
  };

  const drawSquareTiling = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { size = 40, spacing = 10, thickness = 1.5, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    const gridSpacing = size + spacing;
    
    const cols = Math.ceil((bounds * 2) / gridSpacing) + 4;
    const rows = Math.ceil((bounds * 2) / gridSpacing) + 4;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Progressive offset: each row/column gets more offset
        const progressiveOffsetX = offsetX * row;
        const progressiveOffsetY = offsetY * col;
        
        const x = col * gridSpacing + progressiveOffsetX;
        const y = row * gridSpacing + progressiveOffsetY;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(phaseRad);
        
        const halfSize = size / 2;
        
        // Fill if fillColor is provided and not "none"
        if (layer.fillColor && layer.fillColor !== 'none') {
          ctx.fillStyle = layer.fillColor;
          ctx.fillRect(-halfSize, -halfSize, size, size);
        }
        
        // Stroke if color is not "none"
        if (layer.color !== 'none') {
          ctx.strokeRect(-halfSize, -halfSize, size, size);
        }
        
        ctx.restore();
      }
    }
  };

  const drawRhombusTiling = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { size = 40, spacing = 10, thickness = 1.5, phase = 1.5, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const aspectRatio = Math.max(0.5, Math.min(3, phase));
    const rhombusWidth = size;
    const rhombusHeight = size / aspectRatio;
    const gridSpacingX = rhombusWidth + spacing;
    const gridSpacingY = rhombusHeight + spacing;
    
    const cols = Math.ceil((bounds * 2) / gridSpacingX) + 4;
    const rows = Math.ceil((bounds * 2) / gridSpacingY) + 4;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Progressive offset: each row/column gets more offset
        const progressiveOffsetX = offsetX * row;
        const progressiveOffsetY = offsetY * col;
        
        // Offset every other row for proper rhombus tessellation
        const xOffset = (row % 2) * (gridSpacingX / 2);
        
        const x = col * gridSpacingX + xOffset + progressiveOffsetX;
        const y = row * gridSpacingY + progressiveOffsetY;
        
      ctx.beginPath();
        // Draw rhombus as diamond shape
        ctx.moveTo(x, y - rhombusHeight / 2); // Top
        ctx.lineTo(x + rhombusWidth / 2, y); // Right
        ctx.lineTo(x, y + rhombusHeight / 2); // Bottom
        ctx.lineTo(x - rhombusWidth / 2, y); // Left
        ctx.closePath();
        
        // Fill if fillColor is provided and not "none"
        if (layer.fillColor && layer.fillColor !== 'none') {
          ctx.fillStyle = layer.fillColor;
          ctx.fill();
        }
        
        // Stroke if color is not "none"
        if (layer.color !== 'none') {
      ctx.stroke();
        }
      }
    }
  };

  const drawHexagonalTiling = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { size = 40, spacing = 10, thickness = 1.5, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const hexRadius = size / 2;
    const hexWidth = hexRadius * 2;
    const hexHeight = hexRadius * Math.sqrt(3);
    const verticalSpacing = hexHeight * 0.75 + spacing;
    const horizontalSpacing = hexWidth * 0.75 + spacing;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    const cols = Math.ceil((bounds * 2) / horizontalSpacing) + 4;
    const rows = Math.ceil((bounds * 2) / verticalSpacing) + 4;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Progressive offset: each row/column gets more offset
        const progressiveOffsetX = offsetX * row;
        const progressiveOffsetY = offsetY * col;
        
        // Offset every other row for proper hexagonal tessellation
        const xOffset = (row % 2) * (horizontalSpacing / 2);
        const x = col * horizontalSpacing + xOffset + progressiveOffsetX;
        const y = row * verticalSpacing + progressiveOffsetY;
        
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
        
        // Fill if fillColor is provided and not "none"
        if (layer.fillColor && layer.fillColor !== 'none') {
          ctx.fillStyle = layer.fillColor;
          ctx.fill();
        }
        
        // Stroke if color is not "none"
        if (layer.color !== 'none') {
          ctx.stroke();
        }
      }
    }
  };

  const drawCirclePacking = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { size = 40, spacing = 10, thickness = 1.5, phase = 0.8, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const circleRadius = size * phase / 2; // phase controls circle size relative to grid cell
    const hexHeight = size * Math.sqrt(3);
    const verticalSpacing = hexHeight * 0.75 + spacing;
    const horizontalSpacing = size * 0.75 + spacing;
    
    const cols = Math.ceil((bounds * 2) / horizontalSpacing) + 4;
    const rows = Math.ceil((bounds * 2) / verticalSpacing) + 4;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Progressive offset: each row/column gets more offset
        const progressiveOffsetX = offsetX * row;
        const progressiveOffsetY = offsetY * col;
        
        // Offset every other row for proper hexagonal packing
        const xOffset = (row % 2) * (horizontalSpacing / 2);
        const x = col * horizontalSpacing + xOffset + progressiveOffsetX;
        const y = row * verticalSpacing + progressiveOffsetY;
        
        ctx.beginPath();
        ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
        
        // Fill if fillColor is provided and not "none"
        if (layer.fillColor && layer.fillColor !== 'none') {
          ctx.fillStyle = layer.fillColor;
          ctx.fill();
        }
        
        // Stroke if color is not "none"
        if (layer.color !== 'none') {
          ctx.stroke();
        }
      }
    }
  };

  // Concentric Category
  const drawConcentricCircles = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 20, thickness = 1.5, count = 15, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const startRadius = phase;
    
    for (let i = 0; i < count; i++) {
      const radius = startRadius + i * spacing;
      if (radius > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.beginPath();
      ctx.arc(progressiveOffsetX, progressiveOffsetY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  const drawConcentricSquares = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 25, thickness = 1.5, count = 12, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const startSize = phase;
    
    for (let i = 0; i < count; i++) {
      const size = startSize + i * spacing;
      if (size > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.strokeRect(-size + progressiveOffsetX, -size + progressiveOffsetY, size * 2, size * 2);
      }
  };

  const drawConcentricRhombus = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 24, thickness = 1.5, count = 10, phase = 1.5, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const aspectRatio = Math.max(0.1, Math.min(10, phase)); // Use phase as aspect ratio
    
    for (let i = 0; i < count; i++) {
      const sizeX = spacing * (i + 1);
      const sizeY = sizeX / aspectRatio;
      
      if (sizeX > bounds && sizeY > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.beginPath();
      // Draw rhombus as a diamond shape
      ctx.moveTo(progressiveOffsetX, -sizeY + progressiveOffsetY); // Top point
      ctx.lineTo(sizeX + progressiveOffsetX, progressiveOffsetY); // Right point
      ctx.lineTo(progressiveOffsetX, sizeY + progressiveOffsetY); // Bottom point
      ctx.lineTo(-sizeX + progressiveOffsetX, progressiveOffsetY); // Left point
      ctx.closePath();
      ctx.stroke();
    }
  };

  const drawConcentricHexagons = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 22, thickness = 1.5, count = 10, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const startRadius = Math.max(1, phase);
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    for (let i = 0; i < count; i++) {
      const radius = startRadius + i * spacing;
      if (radius > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (j * 60) * Math.PI / 180 + phaseRad;
        const x = Math.cos(angle) * radius + progressiveOffsetX;
        const y = Math.sin(angle) * radius + progressiveOffsetY;
        
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }
  };

  const drawConcentricEllipses = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 18, thickness = 1.5, count = 12, phase = 1.5, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const aspectRatio = Math.max(0.2, Math.min(3, phase)); // Use phase as aspect ratio
    
    for (let i = 0; i < count; i++) {
      const radiusX = spacing * (i + 1);
      const radiusY = radiusX / aspectRatio;
      
      if (radiusX > bounds && radiusY > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.beginPath();
      ctx.ellipse(progressiveOffsetX, progressiveOffsetY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  const drawConcentricTriangles = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 25, thickness = 1.5, count = 10, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    for (let i = 0; i < count; i++) {
      const size = spacing * (i + 1);
      if (size > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.save();
      ctx.translate(progressiveOffsetX, progressiveOffsetY);
      ctx.rotate(phaseRad);
      
      ctx.beginPath();
      // Draw equilateral triangle
      for (let j = 0; j < 3; j++) {
        const angle = (j * 120) * Math.PI / 180;
        const x = Math.cos(angle) * size;
        const y = Math.sin(angle) * size;
        
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
  };

  const drawConcentricPentagons = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 24, thickness = 1.5, count = 8, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    for (let i = 0; i < count; i++) {
      const size = spacing * (i + 1);
      if (size > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.save();
      ctx.translate(progressiveOffsetX, progressiveOffsetY);
      ctx.rotate(phaseRad);
      
      ctx.beginPath();
      // Draw pentagon
      for (let j = 0; j < 5; j++) {
        const angle = (j * 72) * Math.PI / 180;
        const x = Math.cos(angle) * size;
        const y = Math.sin(angle) * size;
        
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
        ctx.stroke();
      
      ctx.restore();
      }
  };

  const drawConcentricStars5 = (ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    const { spacing = 22, thickness = 1.5, count = 8, phase = 0, offsetX = 0, offsetY = 0 } = layer.parameters;
    
    ctx.lineWidth = thickness;
    const phaseRad = (phase / 360) * 2 * Math.PI;
    
    for (let i = 0; i < count; i++) {
      const outerRadius = spacing * (i + 1);
      const innerRadius = outerRadius * 0.4; // Inner radius is 40% of outer radius
      if (outerRadius > bounds) break;
      
      // Progressive offset: each ring gets more offset based on its index
      const progressiveOffsetX = offsetX * i;
      const progressiveOffsetY = offsetY * i;
      
      ctx.save();
      ctx.translate(progressiveOffsetX, progressiveOffsetY);
      ctx.rotate(phaseRad);
      
      ctx.beginPath();
      // Draw 5-pointed star
      for (let j = 0; j < 10; j++) {
        const angle = (j * 36) * Math.PI / 180; // 36 degrees for each point
        const radius = j % 2 === 0 ? outerRadius : innerRadius;
        const x = Math.cos(angle - Math.PI / 2) * radius; // -PI/2 to start from top
        const y = Math.sin(angle - Math.PI / 2) * radius;
        
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
  };



  // Main pattern dispatcher
  const drawPattern = useCallback((ctx: CanvasRenderingContext2D, layer: PatternLayer, bounds: number) => {
    ctx.save();
    
    // Apply layer transformations
    ctx.translate(layer.position.x, layer.position.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    
    // Set colors and styles
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;

    // Set fill color for tiles if provided
    if (layer.fillColor && layer.category === 'tiles') {
      ctx.fillStyle = layer.fillColor;
    }

    // Draw pattern based on type
    switch (layer.type) {
      case 'straight-lines':
        drawStraightLines(ctx, layer, bounds);
        break;
      case 'radial-lines':
        drawRadialLines(ctx, layer, bounds);
        break;
      case 'sine-wave-lines':
        drawSineWaveLines(ctx, layer, bounds);
        break;
      case 'sawtooth-wave-lines':
        drawSawtoothWaveLines(ctx, layer, bounds);
        break;
      case 'square-wave-lines':
        drawSquareWaveLines(ctx, layer, bounds);
        break;
      case 'triangle-wave-lines':
        drawTriangleWaveLines(ctx, layer, bounds);
        break;
      case 'sine-waves':
        drawSineWaves(ctx, layer, bounds);
        break;
      case 'spiral':
        drawSpiral(ctx, layer, bounds);
        break;
      case 'triangular-tiling':
        drawTriangularTiling(ctx, layer, bounds);
        break;
      case 'square-tiling':
        drawSquareTiling(ctx, layer, bounds);
        break;
      case 'rhombus-tiling':
        drawRhombusTiling(ctx, layer, bounds);
        break;
      case 'hexagonal-tiling':
        drawHexagonalTiling(ctx, layer, bounds);
        break;
      case 'circle-packing':
        drawCirclePacking(ctx, layer, bounds);
        break;
      case 'concentric-circles':
        drawConcentricCircles(ctx, layer, bounds);
        break;
      case 'concentric-squares':
        drawConcentricSquares(ctx, layer, bounds);
        break;
      case 'concentric-rhombus':
        drawConcentricRhombus(ctx, layer, bounds);
        break;
      case 'concentric-hexagons':
        drawConcentricHexagons(ctx, layer, bounds);
        break;
      case 'concentric-ellipses':
        drawConcentricEllipses(ctx, layer, bounds);
        break;
      case 'concentric-triangles':
        drawConcentricTriangles(ctx, layer, bounds);
        break;
      case 'concentric-pentagons':
        drawConcentricPentagons(ctx, layer, bounds);
        break;
      case 'concentric-stars-5':
        drawConcentricStars5(ctx, layer, bounds);
        break;
      default:
        console.warn(`Unknown pattern type: ${layer.type}`);
    }
    
    ctx.restore();
  }, []);

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
    
    // Center the coordinate system, but shift everything down by navbar height
    // This makes the coordinate center appear in the visual center of available space
    const navbarHeight = 40; // Full navbar height
    ctx.translate(canvasSize.width / (2 * zoom), canvasSize.height / (2 * zoom) + navbarHeight / zoom);

    // Calculate bounds for pattern rendering
    const maxDimension = Math.max(canvasSize.width, canvasSize.height);
    const bounds = (maxDimension / zoom) * 0.8; // Render beyond visible area

    // Render all visible layers in reverse order (first in list = top layer = rendered last)
    [...layers].reverse().forEach(layer => {
      if (layer.visible) {
        drawPattern(ctx, layer, bounds);
      }
    });

    ctx.restore();
  }, [layers, zoom, pan, canvasSize, backgroundColor, drawPattern]);

  // Handle wheel events for zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Simple zoom calculation - always zoom on wheel/trackpad scroll
    const zoomDelta = -e.deltaY * 0.001; // Negative because deltaY is positive for scroll down
    const zoomFactor = Math.exp(zoomDelta);
    const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));
    
    // Calculate the point in the canvas that the mouse is over (in world coordinates)
    // Account for the navbar offset in the coordinate system
    const navbarHeight = 40; // Full navbar height
    const canvasPointX = (mouseX - canvasSize.width / 2 - pan.x) / zoom;
    const canvasPointY = (mouseY - canvasSize.height / 2 - navbarHeight - pan.y) / zoom;
    
    // Calculate new pan to keep the mouse point stationary during zoom
    const newPanX = mouseX - canvasSize.width / 2 - canvasPointX * newZoom;
    const newPanY = mouseY - canvasSize.height / 2 - navbarHeight - canvasPointY * newZoom;
    
    onZoomChange(newZoom);
    onPanChange({ x: newPanX, y: newPanY });
  }, [zoom, pan, onZoomChange, onPanChange, canvasSize]);

  // Mouse events are now handled by the useCanvasInteractions hook

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

  // Set up wheel event listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add wheel event listener with options to ensure it works
    const wheelHandler = (e: WheelEvent) => {
      handleWheel(e);
    };

    canvas.addEventListener('wheel', wheelHandler, { 
      passive: false, // Allow preventDefault
      capture: false 
    });
    
    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
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
        className="w-full h-full"
        style={{
          imageRendering: 'auto',
          cursor: interactionState.currentCursor,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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