import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  compact?: boolean;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
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
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState('');
  const [lastMouseX, setLastMouseX] = useState<number | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  
  // Calculate the percentage for the gradient fill
  const percentage = ((value - min) / (max - min)) * 100;

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !isAltPressed) {
        setIsAltPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey && isAltPressed) {
        setIsAltPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isAltPressed]);

  // Hybrid drag handling: direct positioning for normal drag, incremental for fine control
  const updateValue = useCallback((clientX: number) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    
    if (isAltPressed && lastMouseX !== null) {
      // Fine control mode: incremental movement
    const deltaX = clientX - lastMouseX;
    
      // Make movement much more gradual when Alt is pressed
      const sensitivity = 0.2; // 5x slower movement
    const adjustedDelta = deltaX * sensitivity;
    
      // Convert mouse delta to value delta
    const valueDelta = (adjustedDelta / rect.width) * (max - min);
    
    // Calculate new value
    const newValue = value + valueDelta;
    
      // Use much finer steps for precise control
      const fineStep = step * 0.1;
      const steppedValue = Math.round(newValue / fineStep) * fineStep;
      
      // Clamp to bounds
      const clampedValue = Math.max(min, Math.min(max, steppedValue));
      
      // Update if changed
      if (Math.abs(clampedValue - value) > Number.EPSILON) {
        onChange(clampedValue);
      }
    } else {
      // Normal mode: direct positioning
      const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const rawValue = min + relativeX * (max - min);
      const steppedValue = Math.round(rawValue / step) * step;
      const clampedValue = Math.max(min, Math.min(max, steppedValue));
    
    if (Math.abs(clampedValue - value) > Number.EPSILON) {
      onChange(clampedValue);
      }
    }
    
    // Update last mouse position for next incremental calculation
    setLastMouseX(clientX);
  }, [min, max, step, onChange, isAltPressed, value, lastMouseX]);

  // Handle mouse down to start custom dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isEditing) {
      e.preventDefault();
      setIsDragging(true);
      setLastMouseX(e.clientX);
      
      // For normal mode, update immediately. For Alt mode, wait for mouse move
      if (!isAltPressed) {
        updateValue(e.clientX);
      }
      
      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }
  }, [isEditing, updateValue, isAltPressed]);

  // Global mouse move and up handlers for better drag experience
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        updateValue(e.clientX);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setLastMouseX(null);
      
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
      document.addEventListener('mouseup', handleGlobalMouseUp, { passive: false });
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, updateValue]);

  // Fallback range input change handler for direct clicks on the hidden input
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isDragging) { // Only use fallback when not dragging
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue)) {
        onChange(newValue);
      }
    }
  };

  // Value editing handlers
  const handleValueClick = useCallback(() => {
    if (!isDragging) {
      setIsEditing(true);
      setEditingValue(value.toString());
    }
  }, [value, isDragging]);

  const handleValueDoubleClick = useCallback(() => {
    if (!isDragging) {
      setIsEditing(true);
      setEditingValue(value.toString());
      // Select all text after a short delay
      setTimeout(() => {
        const input = document.querySelector('input[data-editing-value="true"]') as HTMLInputElement;
        if (input) {
          input.select();
        }
      }, 0);
    }
  }, [value, isDragging]);

  const validateValue = useCallback((inputValue: string): number | null => {
    const trimmed = inputValue.trim();
    if (trimmed === '') return null;

    const parsed = parseFloat(trimmed);
    if (isNaN(parsed)) return null;

    // Determine validation type based on slider properties
    const isIntegerSlider = step >= 1 && Number.isInteger(step);
    const isPositiveOnly = min >= 0;

    // Apply type-specific validation
    if (isIntegerSlider && !Number.isInteger(parsed)) {
      return null; // Must be integer
    }
    
    if (isPositiveOnly && parsed < 0) {
      return null; // Must be positive
    }

    // Clamp to bounds
    const clampedValue = Math.max(min, Math.min(max, parsed));
    
    // For precise input, preserve user's precision instead of applying stepping
    // Only apply stepping if the value would be significantly different
    const steppedValue = Math.round(clampedValue / step) * step;
    
    // If the user's input is very close to a step boundary, use their exact value
    // This allows for more precise control when typing values
    if (Math.abs(clampedValue - steppedValue) < step * 0.01) {
      return clampedValue;
    }
    
    return steppedValue;
  }, [min, max, step]);

  const handleValueSubmit = useCallback(() => {
    const validatedValue = validateValue(editingValue);
    if (validatedValue !== null) {
      onChange(validatedValue);
    }
    setIsEditing(false);
    setEditingValue('');
  }, [editingValue, validateValue, onChange]);

  const handleValueCancel = useCallback(() => {
    setIsEditing(false);
    setEditingValue('');
  }, []);

  // Global click handler to exit edit mode
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (isEditing) {
        const target = e.target as Element;
        // Check if click is outside the input
        if (!target.closest('[data-editing-value="true"]')) {
          handleValueSubmit();
        }
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleGlobalClick);
      return () => document.removeEventListener('mousedown', handleGlobalClick);
    }
  }, [isEditing, handleValueSubmit]);

  // Show reset button if value differs from default
  const showReset = defaultValue !== undefined && onReset && Math.abs(value - defaultValue) > step * 0.1;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {/* Label and Value */}
      <div className="flex justify-between items-center">
        <label className={`font-medium text-[var(--text-primary)] flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
          {Icon && <Icon className="text-[var(--gradient-end)]" />}
          {label}
          {showReset && (
            <button
              onClick={onReset}
              className="ml-1 px-1.5 py-0.5 text-xs bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)] hover:text-[var(--gradient-end)] rounded transition-all duration-200 border border-[var(--border)]/50 opacity-60 hover:opacity-100"
              title={`Reset to ${defaultValue}${unit}`}
            >
              ↺
            </button>
          )}
        </label>
        <div className={`font-mono text-[var(--text-secondary)] ${compact ? "text-xs" : "text-sm"}`}>
          {isEditing ? (
            <div className="flex items-center">
              <input
                type="text"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={handleValueSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleValueSubmit();
                  } else if (e.key === 'Escape') {
                    handleValueCancel();
                  }
                }}
                className="bg-transparent border-none outline-none text-right"
                style={{ 
                  padding: '0',
                  margin: '0',
                  lineHeight: 'inherit',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                  color: 'inherit',
                  width: '60px',
                  boxSizing: 'border-box'
                }}
                data-editing-value="true"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-[var(--text-muted)]">{unit}</span>
            </div>
          ) : (
            <span 
              className="cursor-text select-none"
              onClick={(e) => {
                e.stopPropagation();
                handleValueClick();
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleValueDoubleClick();
              }}
              title="Click to edit value"
            >
              {typeof value === 'number' ? (
                value === 0 ? '0' : // Always show 0 as "0"
                Number.isInteger(value) ? value.toString() : 
                step <= 0.001 ? value.toFixed(3) : value.toFixed(2) // More precision for very small steps
              ) : value}{unit}
            </span>
          )}
        </div>
      </div>

      {/* Slider Container */}
      <div 
        ref={sliderRef}
        className={`relative bg-[var(--bg-tertiary)] rounded-full transition-colors ${
          compact ? "h-2" : "h-3"
        } ${isEditing ? 'cursor-default' : 'cursor-ew-resize hover:bg-[var(--bg-tertiary)]/80'} ${isAltPressed ? 'ring-2 ring-[var(--gradient-end)]/50 shadow-md' : ''}`}
        onMouseDown={handleMouseDown}
      >
        {/* Track with gradient fill */}
        <div className="absolute inset-0 rounded-full border border-[var(--border)] overflow-hidden">
          {/* Gradient fill based on value */}
          <div 
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-full transition-all duration-150 ease-out"
            style={{ width: `${percentage}%` }}
          />
          
          {/* Animated shimmer effect */}
          <div 
            className="absolute top-0 h-full w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
            style={{ 
              left: `${percentage}%`,
              animation: isDragging ? 'shimmer 0.5s ease-in-out' : 'none'
            }}
          />
        </div>

        {/* Slider thumb */}
        <div 
          className={`absolute top-1/2 -translate-y-1/2 bg-[var(--bg-primary)] border-2 border-[var(--gradient-end)] rounded-full shadow-sm transition-all duration-150 cursor-ew-resize ${
            compact ? "w-3.5 h-3.5" : "w-4.5 h-4.5"
          } ${isDragging ? 'scale-110 shadow-lg' : ''} ${isAltPressed ? 'ring-2 ring-[var(--gradient-end)]/30 scale-105' : ''}`}
          style={{ left: `calc(${percentage}% - ${compact ? '7px' : '9px'})` }}
        />

        {/* Hidden range input for accessibility and fallback */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
          aria-label={label}
          tabIndex={-1}
        />
      </div>

      {/* Enhanced Slider Styling */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `
      }} />
    </div>
  );
} 