import React from 'react';
import { clsx } from 'clsx';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
  className = '',
}: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
  };

  const formatValue = (val: number) => {
    // Format to avoid unnecessary decimals
    const formatted = step < 1 ? val.toFixed(2) : val.toString();
    return `${formatted}${unit}`;
  };

  return (
    <div className={clsx('space-y-2', className)}>
      {/* Label and Value */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </label>
        <span className="text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-tertiary)] px-2 py-1 rounded">
          {formatValue(value)}
        </span>
      </div>

      {/* Slider Container */}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className={clsx(
            'w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            // Custom thumb styling
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:h-4',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-[var(--accent-primary)]',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:shadow-sm',
            '[&::-webkit-slider-thumb]:transition-transform',
            '[&::-webkit-slider-thumb]:hover:scale-110',
            // Firefox thumb styling
            '[&::-moz-range-thumb]:w-4',
            '[&::-moz-range-thumb]:h-4',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-[var(--accent-primary)]',
            '[&::-moz-range-thumb]:cursor-pointer',
            '[&::-moz-range-thumb]:border-none',
          )}
          style={{
            background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${percentage}%, var(--bg-tertiary) ${percentage}%, var(--bg-tertiary) 100%)`,
          }}
        />
      </div>
    </div>
  );
} 