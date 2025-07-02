import React, { useState } from 'react';
import { Palette, Pipette } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  className?: string;
}

const COLOR_CATEGORIES = {
  'Grayscale': [
    '#ffffff', '#f0f0f0', '#d0d0d0', '#b0b0b0',
    '#808080', '#606060', '#404040', '#000000'
  ],
  'Primary': [
    '#ff0000', '#00ff00', '#0000ff', '#ffff00',
    '#ff00ff', '#00ffff', '#ffa500', '#800080'
  ],
  'Vibrant': [
    '#ff1744', '#00e676', '#2196f3', '#ffeb3b',
    '#e91e63', '#00bcd4', '#ff9800', '#9c27b0'
  ],
  'Muted': [
    '#f44336', '#4caf50', '#2196f3', '#ff9800',
    '#9c27b0', '#00bcd4', '#795548', '#607d8b'
  ],
  'Pastels': [
    '#ffcdd2', '#c8e6c9', '#bbdefb', '#fff9c4',
    '#f8bbd9', '#b2ebf2', '#ffe0b2', '#d1c4e9'
  ]
};

export function ColorPicker({ value, onChange, disabled = false, className = '' }: ColorPickerProps) {
  const [activeCategory, setActiveCategory] = useState('Primary');
  const [showCustom, setShowCustom] = useState(false);

  const handleColorSelect = (color: string) => {
    onChange(color);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1">
        {Object.keys(COLOR_CATEGORIES).map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeCategory === category
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--accent-primary)]/20'
            }`}
            disabled={disabled}
          >
            {category}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            showCustom
              ? 'bg-[var(--accent-primary)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--accent-primary)]/20'
          }`}
          disabled={disabled}
        >
          <Pipette className="w-3 h-3" />
          Custom
        </button>
      </div>

      {/* Color Grid */}
      {!showCustom && (
        <div className="grid grid-cols-4 gap-2">
          {COLOR_CATEGORIES[activeCategory as keyof typeof COLOR_CATEGORIES].map(color => (
            <button
              key={color}
              onClick={() => handleColorSelect(color)}
              className={`w-8 h-8 rounded border-2 transition-all hover:scale-110 ${
                value === color
                  ? 'border-[var(--accent-primary)] scale-110'
                  : 'border-[var(--border)] hover:border-[var(--accent-primary)]/50'
              }`}
              style={{ backgroundColor: color }}
              disabled={disabled}
              title={`Color: ${color}`}
            />
          ))}
        </div>
      )}

      {/* Custom Color Input */}
      {showCustom && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--text-secondary)]" />
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              Custom Color
            </label>
          </div>
          <div className="space-y-2">
            <input
              type="color"
              value={value}
              onChange={(e) => handleColorSelect(e.target.value)}
              disabled={disabled}
              className="w-full h-12 rounded border border-[var(--border)] cursor-pointer disabled:opacity-50"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => handleColorSelect(e.target.value)}
              disabled={disabled}
              placeholder="#000000"
              className="w-full px-3 py-2 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded focus:ring-2 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* Current Color Display */}
      <div className="flex items-center gap-2 p-2 bg-[var(--bg-tertiary)] rounded">
        <div
          className="w-6 h-6 rounded border border-[var(--border)]"
          style={{ backgroundColor: value }}
        />
        <div className="flex-1">
          <div className="text-xs font-medium text-[var(--text-primary)]">
            Current Color
          </div>
          <div className="text-xs text-[var(--text-secondary)] font-mono">
            {value.toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
} 