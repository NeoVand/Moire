import React, { useState } from 'react';
import { Layers, Eye, EyeOff, Plus, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowLeftRight, RotateCw, Gauge, Copy, Blend } from 'lucide-react';
import { Slider } from '../ui';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import { PATTERN_DEFINITIONS } from '../../types/moire';
import type { PatternLayer, MoireProject } from '../../types/moire';

const BLEND_MODES: { value: PatternLayer['blendMode']; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
];

export function LeftSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(260);
  const {
    project,
    selectedLayer,
    selectLayer,
    updateSelectedLayer,
    toggleLayerVisibility,
    addLayer,
    removeLayer,
    setProject,
  } = useMoireProjectContext();

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newWidth = Math.max(200, Math.min(400, startWidth + (e.clientX - startX)));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const duplicateLayer = (layerId: string) => {
    const layerToDuplicate = project.layers.find(l => l.id === layerId);
    if (layerToDuplicate) {
      // Use JSON for complete deep copy to eliminate ANY reference sharing
      const deepCopy = JSON.parse(JSON.stringify(layerToDuplicate));
      
      // Create a new layer with completely independent data
      const newId = Date.now().toString(); // Use timestamp for unique ID
      const duplicatedLayer: PatternLayer = {
        ...deepCopy,
        id: newId,
        name: `${layerToDuplicate.name} Copy`,
        position: {
          x: layerToDuplicate.position.x + 10,
          y: layerToDuplicate.position.y + 10
        },
        // Create completely new parameter object
        parameters: JSON.parse(JSON.stringify(layerToDuplicate.parameters))
      };
      
      // Add the duplicated layer directly to the project
      setProject((prev: MoireProject) => ({
        ...prev,
        layers: [...prev.layers, duplicatedLayer],
        selectedLayerId: newId,
      }));
    }
  };

  const getPatternDisplayName = (layer: PatternLayer) => {
    const patternDef = PATTERN_DEFINITIONS.find(p => p.id === layer.type);
    return patternDef?.name || layer.type;
  };

  return (
    <aside 
      className="bg-transparent border-r border-[var(--border)]/50 flex flex-col relative"
      style={{ width: isCollapsed ? '48px' : `${width}px` }}
    >
      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[var(--accent-primary)] opacity-0 hover:opacity-50 transition-opacity"
          onMouseDown={handleResize}
        />
      )}

      {isCollapsed ? (
        /* Collapsed State */
        <div className="p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-[var(--accent-primary)]/20 rounded flex items-center justify-center">
              <Layers className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-6 h-6 hover:bg-[var(--bg-tertiary)] rounded transition-colors flex items-center justify-center"
              title="Expand sidebar"
            >
              <ChevronRight className="w-3 h-3 text-[var(--text-secondary)]" />
            </button>
          </div>
          {project.layers.map((layer, index) => (
            <button
              key={layer.id}
              onClick={() => selectLayer(layer.id)}
              className={`w-8 h-8 rounded border transition-colors flex items-center justify-center text-xs font-medium ${
                project.selectedLayerId === layer.id
                  ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-primary)]/50'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      ) : (
        /* Expanded State */
        <>
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border)] flex-shrink-0 bg-[var(--bg-secondary)]/30">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                  Layers
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {project.layers.length} layer{project.layers.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => addLayer('straight-lines')}
                  className="w-8 h-8 hover:bg-[var(--accent-primary)] hover:text-white rounded-lg transition-colors flex items-center justify-center border border-[var(--border)] hover:border-[var(--accent-primary)]"
                  title="Add Layer"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="w-8 h-8 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors flex items-center justify-center group"
                  title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--accent-primary)]" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Layers List */}
            <div className="p-4">
              <div className="space-y-3">
                {project.layers.map(layer => (
                  <div
                    key={layer.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                      project.selectedLayerId === layer.id
                        ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] shadow-sm ring-1 ring-[var(--accent-primary)]/20'
                        : 'bg-[var(--bg-tertiary)] border-[var(--border)] hover:border-[var(--accent-primary)]/50 hover:shadow-sm'
                    }`}
                    onClick={() => selectLayer(layer.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="text-sm font-medium text-[var(--text-primary)] mb-1 truncate">
                          {layer.name}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] truncate">
                          {getPatternDisplayName(layer)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLayerVisibility(layer.id);
                          }}
                          className="w-7 h-7 hover:bg-[var(--bg-primary)] rounded-md transition-colors flex items-center justify-center"
                          title={layer.visible ? "Hide layer" : "Show layer"}
                        >
                          {layer.visible ? (
                            <Eye className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateLayer(layer.id);
                          }}
                          className="w-7 h-7 hover:bg-[var(--bg-primary)] rounded-md transition-colors flex items-center justify-center"
                          title="Duplicate layer"
                        >
                          <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        </button>
                        {project.layers.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLayer(layer.id);
                            }}
                            className="w-7 h-7 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors flex items-center justify-center"
                            title="Delete layer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transform Controls */}
            {selectedLayer && (
              <div className="border-t border-[var(--border)] p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                    Transform
                  </h3>
                  <button
                    onClick={() => {
                      updateSelectedLayer({
                        position: { x: 0, y: 0 },
                        rotation: 0,
                        opacity: 1,
                      });
                    }}
                    className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--accent-primary)] hover:text-white rounded-md transition-colors border border-[var(--border)] hover:border-[var(--accent-primary)]"
                    title="Reset all transform values"
                  >
                    Reset All
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Position</h4>
                    <div className="space-y-3">
                      <Slider
                        label="X"
                        value={selectedLayer.position.x}
                        min={-200}
                        max={200}
                        step={0.1}
                        unit="px"
                        onChange={(value) => updateSelectedLayer({ 
                          position: { ...selectedLayer.position, x: value } 
                        })}
                        compact
                        icon={() => <ArrowLeftRight className="w-3 h-3" />}
                        defaultValue={0}
                        onReset={() => updateSelectedLayer({ 
                          position: { ...selectedLayer.position, x: 0 } 
                        })}
                      />
                      
                      <Slider
                        label="Y"
                        value={selectedLayer.position.y}
                        min={-200}
                        max={200}
                        step={0.1}
                        unit="px"
                        onChange={(value) => updateSelectedLayer({ 
                          position: { ...selectedLayer.position, y: value } 
                        })}
                        compact
                        icon={() => <ArrowUpDown className="w-3 h-3" />}
                        defaultValue={0}
                        onReset={() => updateSelectedLayer({ 
                          position: { ...selectedLayer.position, y: 0 } 
                        })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Rotation & Opacity</h4>
                    <div className="space-y-3">
                      <Slider
                        label="Rotation"
                        value={selectedLayer.rotation}
                        min={-180}
                        max={180}
                        step={0.1}
                        unit="°"
                        onChange={(value) => updateSelectedLayer({ rotation: value })}
                        compact
                        icon={() => <RotateCw className="w-3 h-3" />}
                        defaultValue={0}
                        onReset={() => updateSelectedLayer({ rotation: 0 })}
                      />
                      
                      <Slider
                        label="Opacity"
                        value={selectedLayer.opacity}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(value) => updateSelectedLayer({ opacity: value })}
                        compact
                        icon={() => <Gauge className="w-3 h-3" />}
                        defaultValue={1}
                        onReset={() => updateSelectedLayer({ opacity: 1 })}
                      />
                    </div>
                  </div>
                  
                  {/* Blend Mode Dropdown */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Blending</h4>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-[var(--text-primary)] flex items-center gap-2">
                        <Blend className="w-3 h-3 text-[var(--text-secondary)]" />
                        Blend Mode
                      </label>
                      <select
                        value={selectedLayer.blendMode}
                        onChange={(e) => updateSelectedLayer({ blendMode: e.target.value as PatternLayer['blendMode'] })}
                        className="w-full px-3 py-2 text-sm bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-md focus:ring-2 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors"
                      >
                        {BLEND_MODES.map(mode => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
} 