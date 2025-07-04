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

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hexValue = e.target.value;
    // Allow typing and validate on blur or when complete
    if (hexValue.match(/^#[0-9A-Fa-f]{6}$/)) {
      onChange(hexValue);
    } else if (hexValue === '') {
      // Allow clearing the input temporarily
    } else {
      // Update the input but don't change the actual color until valid
      e.target.value = hexValue;
    }
  };

  const handleTextBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const hexValue = e.target.value;
    // If invalid hex on blur, revert to current value
    if (!hexValue.match(/^#[0-9A-Fa-f]{6}$/)) {
      e.target.value = value === 'none' ? '' : value;
    }
  };

  const handleNoneClick = () => {
    onChange('none');
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="color"
        value={value === 'none' ? '#000000' : value}
        onChange={handleColorChange}
        disabled={disabled}
        className="w-8 h-8 rounded cursor-pointer border border-[var(--border)] bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ colorScheme: 'light dark' }}
        title="Choose color"
      />
      
      <input
        type="text"
        value={value === 'none' ? '' : value}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        disabled={disabled}
        placeholder="#000000"
        className="w-20 px-2 py-1 text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border)] rounded focus:ring-1 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
        title="Enter hex color code"
      />
      
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