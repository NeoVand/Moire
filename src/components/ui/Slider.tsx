import React, { useState, useRef, useCallback, useEffect } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  compact?: boolean;
  icon?: () => React.ReactElement;
  defaultValue?: number;
  onReset?: () => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  compact = false,
  icon: Icon,
  defaultValue,
  onReset
}: SliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; value: number } | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Listen for Alt key press/release globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey !== isAltPressed) {
        setIsAltPressed(e.altKey);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.altKey !== isAltPressed) {
        setIsAltPressed(e.altKey);
      }
    };

    const handleBlur = () => {
      setIsAltPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isAltPressed]);

  const updateValue = useCallback((clientX: number) => {
    if (!sliderRef.current || !dragStart) return;

    const rect = sliderRef.current.getBoundingClientRect();
    
    // Calculate the mouse movement delta from drag start
    const mouseDelta = clientX - dragStart.x;
    
    // Apply sensitivity: when Alt is pressed, movement is 10x less sensitive
    const sensitivity = isAltPressed ? 0.1 : 1.0;
    const adjustedDelta = mouseDelta * sensitivity;
    
    // Convert mouse delta to value delta based on slider width and range
    const valueDelta = (adjustedDelta / rect.width) * (max - min);
    const newValue = dragStart.value + valueDelta;
    
    // Apply stepping
    const effectiveStep = isAltPressed ? step / 10 : step;
    const steppedValue = Math.round(newValue / effectiveStep) * effectiveStep;
    const clampedValue = Math.max(min, Math.min(max, steppedValue));
    
    onChange(clampedValue);
  }, [min, max, step, onChange, isAltPressed, dragStart]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, value: value });
    
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }, [value]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    
    // Restore text selection
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // Global mouse move and up handlers for better drag experience
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging && dragStart) {
        updateValue(e.clientX);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
      
      // Restore text selection (important for global mouse up)
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, updateValue, dragStart]);

  const percentage = ((value - min) / (max - min)) * 100;

  // Show reset button if we have a default value and current value differs
  const showReset = defaultValue !== undefined && onReset && value !== defaultValue;

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {/* Label and Value */}
      <div className="flex justify-between items-center">
        <label className={`font-medium text-[var(--text-primary)] flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
          {Icon && <Icon />}
          {label}
          {isAltPressed && <span className="text-[var(--accent-primary)] text-xs">(Fine)</span>}
          {showReset && (
            <button
              onClick={onReset}
              className="ml-1 px-1 py-0.5 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--accent-primary)] hover:text-white rounded transition-colors"
              title={`Reset to ${defaultValue}${unit}`}
            >
              ↺
            </button>
          )}
        </label>
        <span className={`font-mono text-[var(--text-secondary)] ${
          compact ? "text-xs" : "text-sm"
        }`}>
          {typeof value === 'number' ? value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0) : value}{unit}
        </span>
      </div>

      {/* Slider Container */}
      <div 
        ref={sliderRef}
        className={`relative bg-[var(--bg-tertiary)] rounded-full cursor-ew-resize hover:bg-[var(--bg-tertiary)]/80 transition-colors ${
          compact ? "h-2" : "h-3"
        } ${isAltPressed && isDragging ? 'ring-2 ring-[var(--accent-primary)]/50 shadow-md' : isAltPressed ? 'ring-1 ring-[var(--accent-primary)]/50' : ''}`}
        onMouseDown={handleMouseDown}
      >
        <div 
          className="absolute top-0 left-0 h-full bg-[var(--accent-primary)] rounded-full transition-all duration-150"
          style={{ width: `${percentage}%` }}
        />
        <div 
          className={`absolute top-1/2 -translate-y-1/2 bg-white border-2 border-[var(--accent-primary)] rounded-full shadow-sm transition-all duration-150 cursor-ew-resize ${
            compact ? "w-4 h-4" : "w-5 h-5"
          } ${isDragging ? 'scale-110 shadow-lg' : ''} ${isAltPressed && isDragging ? 'ring-2 ring-[var(--accent-primary)]/30 shadow-lg' : isAltPressed ? 'ring-2 ring-[var(--accent-primary)]/30' : ''}`}
          style={{ left: `calc(${percentage}% - ${compact ? '8px' : '10px'})` }}
        />
      </div>
      
      <style dangerouslySetInnerHTML={{
        __html: `
          .slider::-webkit-slider-thumb {
            appearance: none;
            width: ${compact ? '12px' : '16px'};
            height: ${compact ? '12px' : '16px'};
            border-radius: 50%;
            background: var(--accent-primary);
            cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          }
          
          .slider::-moz-range-thumb {
            width: ${compact ? '12px' : '16px'};
            height: ${compact ? '12px' : '16px'};
            border-radius: 50%;
            background: var(--accent-primary);
            cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          }
          
          .slider:disabled::-webkit-slider-thumb {
            cursor: not-allowed;
          }
          
          .slider:disabled::-moz-range-thumb {
            cursor: not-allowed;
          }
        `
      }} />
    </div>
  );
} 