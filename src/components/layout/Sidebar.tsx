import React from 'react';
import { Layers, Settings, Palette, Eye, EyeOff, Lock, Unlock, Plus, Trash2 } from 'lucide-react';
import { Slider, ColorPicker } from '../ui';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import type { PatternLayer } from '../../types/moire';

const PATTERN_TYPES: { value: PatternLayer['type']; label: string }[] = [
  { value: 'lines', label: 'Lines' },
  { value: 'circles', label: 'Circles' },
  { value: 'radial', label: 'Radial' },
  { value: 'dots', label: 'Dots' },
  { value: 'checkerboard', label: 'Checker' },
  { value: 'hexagonal', label: 'Hexagon' },
];

const FILL_MODES: { value: PatternLayer['fillMode']; label: string }[] = [
  { value: 'stroke', label: 'Lines' },
  { value: 'fill', label: 'Fill' },
  { value: 'both', label: 'Both' },
];

export function Sidebar() {
  const {
    project,
    selectedLayer,
    selectLayer,
    updateSelectedLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    addLayer,
    removeLayer,
  } = useMoireProjectContext();

  const handlePatternTypeChange = (type: PatternLayer['type']) => {
    updateSelectedLayer({ type });
  };

  const handleFillModeChange = (fillMode: PatternLayer['fillMode']) => {
    updateSelectedLayer({ fillMode });
  };

  const handleColorSelect = (color: string) => {
    updateSelectedLayer({ color });
  };

  return (
    <aside className="w-80 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-[var(--border)] flex-shrink-0">
        <h2 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Controls
        </h2>
      </div>

      {/* Sidebar Content - Scrollable */}
      <div className="flex-1 overflow-y-auto" style={{ height: 'calc(100vh - 3.5rem - 3rem)' }}>
        <div className="space-y-0">
          {/* Layers Section */}
          <div className="p-3 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--text-secondary)]" />
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Layers</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => addLayer('lines')}
                  className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                  title="Add Layer"
                >
                  <Plus className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
                {project.layers.length > 1 && selectedLayer && (
                  <button
                    onClick={() => removeLayer(selectedLayer.id)}
                    className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                    title="Remove Layer"
                  >
                    <Trash2 className="w-4 h-4 text-[var(--text-secondary)]" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {project.layers.map(layer => (
                <div
                  key={layer.id}
                  className={`p-2 rounded border cursor-pointer transition-colors ${
                    project.selectedLayerId === layer.id
                      ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]'
                      : 'bg-[var(--bg-tertiary)] border-[var(--border)] hover:border-[var(--accent-primary)]/50'
                  }`}
                  onClick={() => selectLayer(layer.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--text-primary)] mb-1 truncate">
                        {layer.name}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {PATTERN_TYPES.find(type => type.value === layer.type)?.label} • 
                        {layer.visible ? ' Visible' : ' Hidden'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerVisibility(layer.id);
                        }}
                        className="p-1 hover:bg-[var(--bg-primary)] rounded transition-colors"
                      >
                        {layer.visible ? (
                          <Eye className="w-3 h-3 text-[var(--text-secondary)]" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-[var(--text-secondary)]" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerLock(layer.id);
                        }}
                        className="p-1 hover:bg-[var(--bg-primary)] rounded transition-colors"
                      >
                        {layer.locked ? (
                          <Lock className="w-3 h-3 text-[var(--text-secondary)]" />
                        ) : (
                          <Unlock className="w-3 h-3 text-[var(--text-secondary)]" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pattern Controls Section */}
          {selectedLayer && (
            <div className="p-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Pattern</h3>
              </div>
              
              {/* Pattern Type Selector */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                  Type
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {PATTERN_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => handlePatternTypeChange(type.value)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        selectedLayer.type === type.value
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/20'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fill Mode Selector */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                  Style
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {FILL_MODES.map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => handleFillModeChange(mode.value)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        selectedLayer.fillMode === mode.value
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/20'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Color Section */}
          {selectedLayer && (
            <div className="p-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-[var(--text-secondary)]" />
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Color</h3>
              </div>
              
              <ColorPicker
                value={selectedLayer.color}
                onChange={handleColorSelect}
                disabled={selectedLayer.locked}
              />
            </div>
          )}

          {/* Transform Controls */}
          {selectedLayer && (
            <div className="p-3 pb-8">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Transform</h3>
              </div>

              <div className="space-y-3">
                {/* Position Controls */}
                <Slider
                  label="Position X"
                  value={selectedLayer.position.x}
                  min={-200}
                  max={200}
                  step={1}
                  unit="px"
                  onChange={(value) => updateSelectedLayer({ 
                    position: { ...selectedLayer.position, x: value } 
                  })}
                  disabled={selectedLayer.locked}
                />
                
                <Slider
                  label="Position Y"
                  value={selectedLayer.position.y}
                  min={-200}
                  max={200}
                  step={1}
                  unit="px"
                  onChange={(value) => updateSelectedLayer({ 
                    position: { ...selectedLayer.position, y: value } 
                  })}
                  disabled={selectedLayer.locked}
                />

                <Slider
                  label="Rotation"
                  value={selectedLayer.rotation}
                  min={-180}
                  max={180}
                  step={0.1}
                  unit="°"
                  onChange={(value) => updateSelectedLayer({ rotation: value })}
                  disabled={selectedLayer.locked}
                />
                
                <Slider
                  label="Frequency"
                  value={selectedLayer.frequency}
                  min={1}
                  max={200}
                  step={0.1}
                  onChange={(value) => updateSelectedLayer({ frequency: value })}
                  disabled={selectedLayer.locked}
                />

                <Slider
                  label="Thickness"
                  value={selectedLayer.thickness}
                  min={0.1}
                  max={20}
                  step={0.1}
                  unit="px"
                  onChange={(value) => updateSelectedLayer({ thickness: value })}
                  disabled={selectedLayer.locked}
                />
                
                <Slider
                  label="Phase"
                  value={selectedLayer.phase}
                  min={0}
                  max={360}
                  step={1}
                  unit="°"
                  onChange={(value) => updateSelectedLayer({ phase: value })}
                  disabled={selectedLayer.locked}
                />
                
                <Slider
                  label="Opacity"
                  value={selectedLayer.opacity}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateSelectedLayer({ opacity: value })}
                  disabled={selectedLayer.locked}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
} 