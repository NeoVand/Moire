import React, { useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  className?: string;
  allowNone?: boolean;
}

export function ColorPicker({ value, onChange, disabled = false, className = '', allowNone = false }: ColorPickerProps) {
  const [inputValue, setInputValue] = useState(value);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleTextBlur = () => {
    // Validate and normalize color on blur
    const color = inputValue.trim();
    if (color.match(/^#[0-9A-Fa-f]{6}$/)) {
      onChange(color);
    } else if (color.match(/^#[0-9A-Fa-f]{3}$/)) {
      // Convert 3-digit hex to 6-digit
      const expandedColor = '#' + color.slice(1).split('').map(c => c + c).join('');
      setInputValue(expandedColor);
      onChange(expandedColor);
    } else {
      // Reset to current valid value
      setInputValue(value);
    }
  };

  const handleNoneClick = () => {
    setInputValue('none');
    onChange('none');
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Compact Color Input */}
      <div className="relative group">
        <input
          type="color"
          value={value === 'none' ? '#000000' : value}
          onChange={handleColorChange}
          disabled={disabled}
          className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--border)] bg-transparent disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--gradient-start)] transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-1 focus:ring-[var(--gradient-start)]/30"
          style={{ colorScheme: 'light dark' }}
          title="Choose color"
        />
        
        {/* Gradient border effect */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-0 group-hover:opacity-10 transition-opacity duration-200 pointer-events-none blur-sm" />
      </div>
      
      {/* Compact Text Input */}
      <input
        type="text"
        value={value === 'none' ? '' : inputValue}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        disabled={disabled}
        placeholder="#000000"
        className="w-20 px-2 py-1 text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border)] rounded focus:ring-1 focus:ring-[var(--gradient-start)]/30 focus:border-[var(--gradient-start)] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:border-[var(--gradient-start)]/50"
        title="Enter hex color code"
      />
      
      {/* Compact None Button */}
      {allowNone && (
        <button
          onClick={handleNoneClick}
          disabled={disabled}
          className={`px-2 py-1 text-xs font-medium rounded border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            value === 'none'
              ? 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] text-white border-transparent shadow-sm'
              : 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/10 hover:to-[var(--gradient-end)]/10 hover:border-[var(--gradient-start)]/50 hover:text-[var(--text-primary)]'
          }`}
          title="No color (transparent)"
        >
          None
        </button>
      )}
    </div>
  );
} 