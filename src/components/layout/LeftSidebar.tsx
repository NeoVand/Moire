import React, { useState, useRef } from 'react';
import { Eye, EyeOff, Plus, Trash2, ArrowUpDown, ArrowLeftRight, RotateCw, Gauge, Copy, Blend, GripVertical } from 'lucide-react';
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
  const [width, setWidth] = useState(280);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    draggedIndex: number | null;
    draggedOverIndex: number | null;
  }>({
    isDragging: false,
    draggedIndex: null,
    draggedOverIndex: null,
  });

  // Use ref to track current drag state for event handlers
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const {
    project,
    selectedLayer,
    selectLayer,
    updateSelectedLayer,
    toggleLayerVisibility,
    addLayer,
    removeLayer,
    reorderLayers,
    setProject,
  } = useMoireProjectContext();

  const handleLayerNameClick = React.useCallback((layer: PatternLayer) => {
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
  }, []);

  const handleLayerNameDoubleClick = React.useCallback((layer: PatternLayer) => {
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
    // Select all text after a short delay to ensure input is focused
    setTimeout(() => {
      const input = document.querySelector('input[data-editing="true"]') as HTMLInputElement;
      if (input) {
        input.select();
      }
    }, 0);
  }, []);

  const handleLayerNameSubmit = React.useCallback(() => {
    if (editingLayerId && editingName.trim()) {
      setProject((prev: MoireProject) => ({
        ...prev,
        layers: prev.layers.map(layer =>
          layer.id === editingLayerId
            ? { ...layer, name: editingName.trim() }
            : layer
        ),
      }));
    }
    setEditingLayerId(null);
    setEditingName('');
  }, [editingLayerId, editingName, setProject]);

  const handleLayerNameCancel = React.useCallback(() => {
    setEditingLayerId(null);
    setEditingName('');
  }, []);

  // Global click handler to exit edit mode
  React.useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (editingLayerId) {
        const target = e.target as Element;
        // Check if click is outside the sidebar
        const sidebar = target.closest('aside');
        if (!sidebar) {
          handleLayerNameSubmit();
        }
      }
    };

    if (editingLayerId) {
      document.addEventListener('mousedown', handleGlobalClick);
      return () => document.removeEventListener('mousedown', handleGlobalClick);
    }
  }, [editingLayerId, handleLayerNameSubmit]);

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newWidth = Math.max(220, Math.min(420, startWidth + (e.clientX - startX)));
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

  // Drag and drop handlers
  const handleDragStart = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    
    setDragState({
      isDragging: true,
      draggedIndex: index,
      draggedOverIndex: index,
    });

    // Add global mouse event listeners
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Find the element under the mouse
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      const layerCard = elementBelow?.closest('[data-layer-index]');
      
      if (layerCard) {
        const targetIndex = parseInt(layerCard.getAttribute('data-layer-index') || '0');
        setDragState(prev => ({
          ...prev,
          draggedOverIndex: targetIndex,
        }));
      }
    };

    const handleGlobalMouseUp = () => {
      const currentDragState = dragStateRef.current;
      
      if (currentDragState.draggedIndex !== null && 
          currentDragState.draggedOverIndex !== null && 
          currentDragState.draggedIndex !== currentDragState.draggedOverIndex) {
        reorderLayers(currentDragState.draggedIndex, currentDragState.draggedOverIndex);
      }
      
      setDragState({
        isDragging: false,
        draggedIndex: null,
        draggedOverIndex: null,
      });

      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  return (
    <aside 
      className="bg-[var(--bg-secondary)]/80 backdrop-blur-md border-r border-[var(--border)] flex flex-col relative h-full w-full overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* Gradient background overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-start)]/5 via-transparent to-[var(--gradient-end)]/5 pointer-events-none" />
      
      {/* Enhanced Resize Handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-gradient-to-b hover:from-[var(--gradient-start)] hover:to-[var(--gradient-end)] opacity-0 hover:opacity-80 transition-all duration-200 z-10"
        onMouseDown={handleResize}
      />

      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-[var(--border)]/50 flex-shrink-0 relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Layers
            </h2>
          </div>
          <div className="flex items-center">
            <button
              onClick={() => addLayer('straight-lines')}
              className="w-6 h-6 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] hover:shadow-lg hover:shadow-[var(--gradient-start)]/25 text-white rounded transition-all duration-200 flex items-center justify-center hover:scale-105 group"
              title="Add Layer"
            >
              <Plus className="w-3 h-3 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto h-0 relative z-10">
        {/* Layers List */}
        <div className="border-b border-[var(--border)]/50">
          <div>
            {project.layers.map((layer, index) => {
              const isDragged = dragState.draggedIndex === index;
              const showInsertionLine = dragState.isDragging && 
                dragState.draggedIndex !== null && 
                dragState.draggedOverIndex !== null &&
                dragState.draggedIndex !== index;
              
              // Calculate if we should show insertion line above this item
              const showLineAbove = showInsertionLine && (
                (dragState.draggedIndex! > dragState.draggedOverIndex! && index === dragState.draggedOverIndex) ||
                (dragState.draggedIndex! < dragState.draggedOverIndex! && index === dragState.draggedOverIndex! + 1)
              );
              
              return (
                <React.Fragment key={layer.id}>
                  {/* Single elegant insertion line */}
                  {showLineAbove && (
                    <div className="relative py-1">
                      <div className="h-0.5 bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent rounded-full opacity-80">
                        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--accent-primary)] rounded-full shadow-sm"></div>
                      </div>
                    </div>
                  )}
                  
                  <div
                    data-layer-index={index}
                    className={`relative flex items-center px-3 py-2 cursor-pointer transition-all duration-200 border-b border-[var(--border)]/30 ${
                      project.selectedLayerId === layer.id
                        ? 'bg-gradient-to-r from-[var(--gradient-start)]/20 to-[var(--gradient-end)]/20'
                        : 'hover:bg-[var(--bg-tertiary)]/40'
                    } ${isDragged ? 'opacity-50 scale-105 z-10' : ''}`}
                    onClick={() => selectLayer(layer.id)}
                  >
                    {/* Drag Handle */}
                    <div
                      className="flex items-center justify-center w-5 h-6 mr-2 cursor-grab hover:text-[var(--gradient-start)] transition-colors group"
                      onMouseDown={(e) => handleDragStart(e, index)}
                      title="Drag to reorder"
                    >
                      <GripVertical className="w-3 h-3 text-[var(--text-secondary)] group-hover:text-[var(--gradient-start)] transition-colors" />
                    </div>

                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="h-[14px] mb-0.5" style={{ lineHeight: '14px' }}>
                          {editingLayerId === layer.id ? (
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={handleLayerNameSubmit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleLayerNameSubmit();
                                } else if (e.key === 'Escape') {
                                  handleLayerNameCancel();
                                }
                              }}
                              className="w-full text-xs font-medium text-[var(--text-primary)] bg-transparent border-none outline-none"
                              style={{ 
                                padding: '0',
                                margin: '0',
                                lineHeight: '14px',
                                height: '14px',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", sans-serif',
                                fontSize: '12px',
                                fontWeight: '500',
                                letterSpacing: 'inherit',
                                boxSizing: 'border-box',
                                verticalAlign: 'top'
                              }}
                              data-editing="true"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div 
                              className="text-xs font-medium text-[var(--text-primary)] truncate cursor-text"
                              style={{ 
                                padding: '0',
                                margin: '0',
                                lineHeight: '14px',
                                height: '14px',
                                boxSizing: 'border-box',
                                verticalAlign: 'top'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLayerNameClick(layer);
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleLayerNameDoubleClick(layer);
                              }}
                              title={layer.name}
                            >
                              {layer.name}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] truncate opacity-75">
                          {getPatternDisplayName(layer)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLayerVisibility(layer.id);
                          }}
                          className={`w-7 h-7 hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20 rounded-lg transition-all duration-200 flex items-center justify-center ${
                            !layer.visible ? 'text-red-500 hover:text-red-400' : 'hover:scale-105'
                          }`}
                          title={layer.visible ? "Hide layer" : "Show layer"}
                        >
                          {layer.visible ? (
                            <Eye className="w-4 h-4 text-[var(--text-secondary)]" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateLayer(layer.id);
                          }}
                          className="w-7 h-7 hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20 rounded-lg transition-all duration-200 flex items-center justify-center hover:scale-105"
                          title="Duplicate layer"
                        >
                          <Copy className="w-4 h-4 text-[var(--text-secondary)]" />
                        </button>
                        {project.layers.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLayer(layer.id);
                            }}
                            className="w-7 h-7 hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-all duration-200 flex items-center justify-center hover:scale-105"
                            title="Delete layer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            
            {/* Insertion line at the very bottom */}
            {dragState.isDragging && 
             dragState.draggedIndex !== null && 
             dragState.draggedOverIndex === project.layers.length - 1 &&
             dragState.draggedIndex < project.layers.length - 1 && (
              <div className="relative py-1">
                <div className="h-0.5 bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent rounded-full opacity-80">
                  <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--accent-primary)] rounded-full shadow-sm"></div>
                </div>
              </div>
            )}
            </div>
          </div>

        {/* Transform Controls */}
        {selectedLayer && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
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
                className="px-2 py-1 text-xs bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors border border-[var(--border)]/50 opacity-70 hover:opacity-100"
                title="Reset all transform values"
              >
                Reset All
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Position</h4>
                <div className="space-y-4">
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

              <div className="space-y-4">
                <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Rotation & Opacity</h4>
                <div className="space-y-4">
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
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Blending</h4>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--text-primary)] flex items-center gap-2">
                    <Blend className="w-3 h-3 text-[var(--text-secondary)]" />
                    Blend Mode
                  </label>
                  <select
                    value={selectedLayer.blendMode}
                    onChange={(e) => updateSelectedLayer({ blendMode: e.target.value as PatternLayer['blendMode'] })}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--gradient-start)]/30 focus:border-[var(--gradient-start)] text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--gradient-start)]/50"
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
    </aside>
  );
} 