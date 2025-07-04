import React from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  className?: string;
  allowNone?: boolean; // Allow "none" as an option
}

export function ColorPicker({ value, onChange, disabled = false, className = '', allowNone = false }: ColorPickerProps) {
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleNoneClick = () => {
    onChange('none');
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Color input wrapper for better theme integration */}
      <div className="relative">
        <input
          type="color"
          value={value === 'none' ? '#000000' : value}
          onChange={handleColorChange}
          disabled={disabled}
          className="w-8 h-8 rounded cursor-pointer border border-[var(--border)] bg-[var(--bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden
                     [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch-wrapper]:border-0 
                     [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded
                     [&::-moz-color-swatch]:border-0 [&::-moz-color-swatch]:rounded"
          title="Choose color"
          style={{
            // Additional CSS for better cross-browser theme support
            colorScheme: 'dark light'
          }}
        />
      </div>
      
      {allowNone && (
        <button
          onClick={handleNoneClick}
          disabled={disabled}
          className={`px-2 py-1 text-xs rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            value === 'none'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
              : 'border-[var(--border)] hover:border-[var(--accent-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="No color (transparent)"
        >
          None
        </button>
      )}
    </div>
  );
} 