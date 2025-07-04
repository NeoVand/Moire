import React, { useState, useEffect } from 'react';
import { Settings, Minus, Star, Grid3x3 } from 'lucide-react';
import { Slider, ColorPicker } from '../ui';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import { PATTERN_DEFINITIONS } from '../../types/moire';

// Icon mapping for pattern types
const PATTERN_ICONS: { [key: string]: React.ComponentType<React.SVGProps<SVGSVGElement>> } = {
  'minus': Minus,
  'star': Star,
  'circle': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6"/>
    </svg>
  ),
  'square': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="1"/>
    </svg>
  ),
  'triangle': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 L14 13 L2 13 Z"/>
    </svg>
  ),
  'hexagon': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1 L13.5 4.5 L13.5 11.5 L8 15 L2.5 11.5 L2.5 4.5 Z"/>
    </svg>
  ),
  'pentagon': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 L12.5 5.5 L10.5 11.5 L5.5 11.5 L3.5 5.5 Z"/>
    </svg>
  ),
  'rhombus': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 L14 8 L8 14 L2 8 Z"/>
    </svg>
  ),
  'ellipse': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="8" cy="8" rx="6" ry="4"/>
    </svg>
  ),
  'star5': () => (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 L9.8 6.2 L14 6.2 L10.6 8.8 L12.4 13 L8 10.4 L3.6 13 L5.4 8.8 L2 6.2 L6.2 6.2 Z"/>
    </svg>
  ),

  'grid': Grid3x3,
  'wave': () => (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8 Q3 4, 5 8 T9 8 Q11 12, 13 8 T15 8"/>
    </svg>
  ),
  'spiral': () => (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 C12 2, 14 4, 14 8 C14 11, 12 12, 8 12 C6 12, 4 11, 4 8 C4 6, 5 5, 8 5 C9 5, 10 5.5, 10 8"/>
    </svg>
  ),
};

export function RightSidebar() {
  const [width, setWidth] = useState(280);
  const [activeCategory, setActiveCategory] = useState<string>('lines');
  const {
    selectedLayer,
    updateSelectedLayer,
  } = useMoireProjectContext();

  // Sync activeCategory with selectedLayer's category
  useEffect(() => {
    if (selectedLayer) {
      setActiveCategory(selectedLayer.category);
    }
  }, [selectedLayer?.category, selectedLayer?.id]);

  const handlePatternTypeChange = (patternId: string) => {
    const patternDef = PATTERN_DEFINITIONS.find(p => p.id === patternId);
    if (!patternDef) return;

    updateSelectedLayer({ 
      category: patternDef.category,
      type: patternId,
      parameters: { ...patternDef.defaultParameters }
    });
  };

  const handleColorSelect = (color: string) => {
    updateSelectedLayer({ color });
  };

  const handleFillColorSelect = (fillColor: string) => {
    updateSelectedLayer({ fillColor });
  };

  const handleParameterChange = (paramKey: string, value: number) => {
    if (!selectedLayer) return;
    
    updateSelectedLayer({
      parameters: {
        ...selectedLayer.parameters,
        [paramKey]: value
      }
    });
  };

  // Handle resize
  const handleResize = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX;
      const newWidth = Math.max(220, Math.min(420, startWidth + deltaX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!selectedLayer) {
      return (
    <aside 
      className="bg-[var(--bg-secondary)]/80 backdrop-blur-md border-l border-[var(--border)] flex flex-col items-center justify-center h-full relative"
      style={{ width: `${width}px` }}
    >
        {/* Resize Handle */}
        <div
          className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-gradient-to-b hover:from-[var(--gradient-start)] hover:to-[var(--gradient-end)] opacity-0 hover:opacity-80 transition-all duration-200"
          onMouseDown={handleResize}
        />
        
        {/* Gradient background overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-start)]/5 via-transparent to-[var(--gradient-end)]/5 pointer-events-none" />
        
        <div className="text-center space-y-3 relative z-10">
          <div className="w-12 h-12 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-xl flex items-center justify-center mx-auto shadow-lg">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">No Layer Selected</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-48">
              Select a layer from the left sidebar to edit its properties
            </p>
          </div>
        </div>
      </aside>
    );
  }

  // Group patterns by category
  const patternsByCategory = PATTERN_DEFINITIONS.reduce((acc, pattern) => {
    if (!acc[pattern.category]) {
      acc[pattern.category] = [];
    }
    acc[pattern.category].push(pattern);
    return acc;
  }, {} as { [key: string]: typeof PATTERN_DEFINITIONS });

  const categories = [
    { id: 'lines', name: 'Lines', icon: () => (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M2 13 L7 2"/>
        <path d="M4 14 L10 2"/>
        <path d="M6 15 L13 2"/>
        <path d="M9 15 L15 4"/>
        <path d="M12 15 L15 8"/>
      </svg>
    )},
    { id: 'curves', name: 'Curves', icon: () => (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M8 8 C8 6, 10 6, 10 8 C10 11, 6 11, 6 8 C6 4, 12 4, 12 8 C12 14, 2 14, 2 8 C2 1, 15 1, 15 8"/>
      </svg>
    )},
    { id: 'tiles', name: 'Tiles', icon: () => (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="1" y="1" width="6" height="6" rx="0.5"/>
        <rect x="9" y="1" width="6" height="6" rx="0.5"/>
        <rect x="1" y="9" width="6" height="6" rx="0.5"/>
        <rect x="9" y="9" width="6" height="6" rx="0.5"/>
      </svg>
    ) },
    { id: 'concentric', name: 'Concentric', icon: () => (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="8" cy="8" r="2.5"/>
        <circle cx="8" cy="8" r="5"/>
        <circle cx="8" cy="8" r="7.5"/>
      </svg>
    )},
  ];

  return (
    <aside 
      className="bg-[var(--bg-secondary)]/80 backdrop-blur-md border-l border-[var(--border)] flex flex-col relative h-full w-full overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* Gradient background overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-start)]/5 via-transparent to-[var(--gradient-end)]/5 pointer-events-none" />
      
      {/* Resize Handle */}
      <div
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-gradient-to-b hover:from-[var(--gradient-start)] hover:to-[var(--gradient-end)] opacity-0 hover:opacity-80 transition-all duration-200 z-10"
        onMouseDown={handleResize}
      />

      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]/50 flex-shrink-0 relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-medium text-[var(--text-primary)] uppercase tracking-wide">
              Pattern Settings
            </h2>
            {selectedLayer && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                {selectedLayer.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto relative z-10">
        {selectedLayer && (
          <div>
            {/* Category Tabs */}
            <div className="p-3 border-b border-[var(--border)]/50">
              <h3 className="text-xs font-medium text-[var(--text-primary)] mb-2 uppercase tracking-wide">
                Category
              </h3>
              
              <div className="grid grid-cols-2 gap-1">
                {categories.map(category => {
                  const IconComponent = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      className={`p-1.5 rounded text-xs transition-all duration-200 flex items-center gap-1.5 ${
                        activeCategory === category.id
                          ? 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] text-white shadow-sm'
                          : 'bg-[var(--bg-tertiary)]/60 text-[var(--text-primary)] hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20'
                      }`}
                    >
                      <IconComponent />
                      <span>{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pattern Type Selection */}
            <div className="p-3 border-b border-[var(--border)]/50">
              <h3 className="text-xs font-medium text-[var(--text-primary)] mb-2 uppercase tracking-wide">
                Pattern Type
              </h3>
              
              <div className="grid grid-cols-4 gap-1">
                {patternsByCategory[activeCategory]?.map(pattern => {
                  const IconComponent = PATTERN_ICONS[pattern.icon] || Settings;
                  const isSelected = selectedLayer.type === pattern.id;
                  
                  if (isSelected) {
                    return (
                      <div
                        key={pattern.id}
                        className="p-0.5 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-md shadow-lg"
                      >
                        <button
                          onClick={() => handlePatternTypeChange(pattern.id)}
                          className="group relative w-full p-2 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] text-white rounded-sm transition-all duration-200 flex items-center justify-center hover:scale-105"
                          title={`${pattern.name} - ${pattern.description}`}
                        >
                          <IconComponent className="w-4 h-4" />
                          
                          {/* Glow effect for selected state */}
                          <div className="absolute inset-0 rounded-sm bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-20 blur-lg pointer-events-none" />
                        </button>
                      </div>
                    );
                  }
                  
                  return (
                    <button
                      key={pattern.id}
                      onClick={() => handlePatternTypeChange(pattern.id)}
                      className="group relative p-2 rounded-md border bg-[var(--bg-tertiary)]/60 text-[var(--text-primary)] border-[var(--border)] hover:bg-gradient-to-br hover:from-[var(--gradient-start)]/10 hover:to-[var(--gradient-end)]/10 hover:border-[var(--gradient-start)]/50 transition-all duration-200 flex items-center justify-center hover:scale-105"
                      title={`${pattern.name} - ${pattern.description}`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Colors Section */}
            <div className="p-3 border-b border-[var(--border)]/50">
              <h3 className="text-xs font-medium text-[var(--text-primary)] mb-3 uppercase tracking-wide">
                Colors
              </h3>
              
              <div className="space-y-3">
                {/* Stroke Color */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Stroke</span>
                  <ColorPicker
                    value={selectedLayer.color}
                    onChange={handleColorSelect}
                    allowNone={selectedLayer.category === 'tiles'}
                  />
                </div>

                {/* Fill Color - Only for tiles */}
                {selectedLayer.category === 'tiles' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-primary)]">Fill</span>
                    <ColorPicker
                      value={selectedLayer.fillColor || '#ffffff'}
                      onChange={handleFillColorSelect}
                      allowNone={true}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Parameters Section */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-[var(--text-primary)] uppercase tracking-wide">
                  Parameters
                </h3>
                <button
                  onClick={() => {
                    const patternDef = PATTERN_DEFINITIONS.find(p => p.id === selectedLayer.type);
                    if (patternDef) {
                      updateSelectedLayer({
                        parameters: { ...patternDef.defaultParameters }
                      });
                    }
                  }}
                  className="px-2 py-1 text-xs bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors border border-[var(--border)]/50 opacity-70 hover:opacity-100"
                  title="Reset all parameters to default values"
                >
                  Reset
                </button>
              </div>

              <div className="space-y-3">
                {selectedLayer.type && (() => {
                  const patternDef = PATTERN_DEFINITIONS.find(p => p.id === selectedLayer.type);
                  if (!patternDef) return null;

                  return Object.entries(patternDef.parameterConfig).map(([paramKey, config]) => {
                    const currentValue = selectedLayer.parameters[paramKey as keyof typeof selectedLayer.parameters] ?? config.min;
                    const defaultValue = patternDef.defaultParameters[paramKey as keyof typeof patternDef.defaultParameters] ?? config.min;
                    
                    return (
                      <Slider
                        key={paramKey}
                        label={config.label}
                        value={currentValue}
                        min={config.min}
                        max={config.max}
                        step={config.step}
                        unit={config.unit}
                        onChange={(value) => handleParameterChange(paramKey, value)}
                        compact
                        defaultValue={defaultValue}
                        onReset={() => handleParameterChange(paramKey, defaultValue)}
                      />
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
} 