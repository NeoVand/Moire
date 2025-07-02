import React, { useState } from 'react';
import { Settings, ChevronLeft, ChevronRight, Minus, Star, Circle, Square, Triangle, Hexagon, Grid3x3 } from 'lucide-react';
import { Slider, ColorPicker } from '../ui';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import { PATTERN_DEFINITIONS } from '../../types/moire';
import type { PatternLayer } from '../../types/moire';

// Icon mapping for pattern types
const PATTERN_ICONS: { [key: string]: React.ComponentType<any> } = {
  'minus': Minus,
  'star': Star,
  'circle': Circle,
  'square': Square,
  'triangle': Triangle,
  'hexagon': Hexagon,
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

// Style mode icons
const FILL_MODES: { value: PatternLayer['fillMode']; label: string; icon: React.ComponentType<any> }[] = [
  { 
    value: 'stroke', 
    label: 'Lines', 
    icon: () => (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="6" width="10" height="4" />
      </svg>
    )
  },
  { 
    value: 'fill', 
    label: 'Fill', 
    icon: () => (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <rect x="3" y="6" width="10" height="4" />
      </svg>
    )
  },
  { 
    value: 'both', 
    label: 'Both', 
    icon: () => (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="6" width="10" height="4" fill="currentColor" fillOpacity="0.3" />
        <rect x="3" y="6" width="10" height="4" />
      </svg>
    )
  },
];

export function RightSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(260);
  const [activeCategory, setActiveCategory] = useState<string>('lines');
  const {
    selectedLayer,
    updateSelectedLayer,
  } = useMoireProjectContext();

  const handlePatternTypeChange = (patternId: string) => {
    const patternDef = PATTERN_DEFINITIONS.find(p => p.id === patternId);
    if (!patternDef) return;

    updateSelectedLayer({ 
      category: patternDef.category,
      type: patternId,
      parameters: { ...patternDef.defaultParameters }
    });
  };

  const handleFillModeChange = (fillMode: PatternLayer['fillMode']) => {
    updateSelectedLayer({ fillMode });
  };

  const handleColorSelect = (color: string) => {
    updateSelectedLayer({ color });
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

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newWidth = Math.max(200, Math.min(400, startWidth - (e.clientX - startX)));
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

  // Group patterns by category
  const patternsByCategory = PATTERN_DEFINITIONS.reduce((acc, pattern) => {
    if (!acc[pattern.category]) {
      acc[pattern.category] = [];
    }
    acc[pattern.category].push(pattern);
    return acc;
  }, {} as { [key: string]: typeof PATTERN_DEFINITIONS });

  const categories = [
    { id: 'lines', name: 'Lines', icon: Minus },
    { id: 'curves', name: 'Curves', icon: () => (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M1 8 Q3 4, 5 8 T9 8 Q11 12, 13 8 T15 8"/>
      </svg>
    )},
    { id: 'grids', name: 'Grids', icon: Grid3x3 },
    { id: 'concentric', name: 'Concentric', icon: Circle },
  ];

  if (!selectedLayer && isCollapsed) {
    return (
      <aside 
        className="bg-transparent border-l border-[var(--border)]/50 flex flex-col relative"
        style={{ width: '48px' }}
      >
        <div className="p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-[var(--accent-primary)]/20 rounded flex items-center justify-center">
              <Settings className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-6 h-6 hover:bg-[var(--bg-tertiary)] rounded transition-colors flex items-center justify-center"
              title="Expand sidebar"
            >
              <ChevronLeft className="w-3 h-3 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  if (!selectedLayer) {
    return (
      <aside 
        className="bg-transparent border-l border-[var(--border)]/50 flex flex-col relative"
        style={{ width: `${width}px` }}
      >
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
              Pattern Settings
            </h2>
            <button
              onClick={() => setIsCollapsed(true)}
              className="w-6 h-6 hover:bg-[var(--bg-tertiary)] rounded transition-colors flex items-center justify-center"
              title="Collapse sidebar"
            >
              <ChevronRight className="w-3 h-3 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <Settings className="w-8 h-8 text-[var(--text-secondary)] mx-auto mb-2" />
            <p className="text-xs text-[var(--text-secondary)]">
              Select a layer to modify its pattern settings
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside 
      className="bg-transparent border-l border-[var(--border)]/50 flex flex-col relative"
      style={{ width: isCollapsed ? '48px' : `${width}px` }}
    >
      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-[var(--accent-primary)] opacity-0 hover:opacity-50 transition-opacity"
          onMouseDown={handleResize}
        />
      )}

      {isCollapsed ? (
        /* Collapsed State */
        <div className="p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-[var(--accent-primary)]/20 rounded flex items-center justify-center">
              <Settings className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-6 h-6 hover:bg-[var(--bg-tertiary)] rounded transition-colors flex items-center justify-center"
              title="Expand sidebar"
            >
              <ChevronLeft className="w-3 h-3 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>
      ) : (
        /* Expanded State */
        <>
          {/* Header */}
          <div className="px-3 py-2 border-b border-[var(--border)] flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                  Pattern Settings
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                  {selectedLayer.name}
                </p>
              </div>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-6 h-6 hover:bg-[var(--bg-tertiary)] rounded transition-colors flex items-center justify-center group"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <ChevronRight className="w-3 h-3 text-[var(--text-secondary)] group-hover:text-[var(--accent-primary)]" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 max-h-full">
            {/* Category Tabs */}
            <div className="p-3 border-b border-[var(--border)]">
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
                      className={`p-1.5 rounded text-xs transition-colors flex items-center gap-1.5 ${
                        activeCategory === category.id
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/20'
                      }`}
                    >
                      <IconComponent />
                      <span>{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pattern Selection */}
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-xs font-medium text-[var(--text-primary)] mb-2 uppercase tracking-wide">
                Pattern Type
              </h3>
              
              <div className="grid grid-cols-2 gap-1">
                {patternsByCategory[activeCategory]?.map(pattern => {
                  const IconComponent = PATTERN_ICONS[pattern.icon] || Settings;
                  return (
                    <button
                      key={pattern.id}
                      onClick={() => handlePatternTypeChange(pattern.id)}
                      className={`p-2 rounded border transition-colors flex flex-col items-center gap-1 text-xs ${
                        selectedLayer.type === pattern.id
                          ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--accent-primary)]/20 hover:border-[var(--accent-primary)]/50'
                      }`}
                      title={pattern.description}
                    >
                      <IconComponent />
                      <span className="leading-none">{pattern.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Style Mode Section */}
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-xs font-medium text-[var(--text-primary)] mb-2 uppercase tracking-wide">
                Style Mode
              </h3>
              <div className="grid grid-cols-3 gap-1">
                {FILL_MODES.map(mode => {
                  const IconComponent = mode.icon;
                  return (
                    <button
                      key={mode.value}
                      onClick={() => handleFillModeChange(mode.value)}
                      className={`px-2 py-1.5 text-xs rounded transition-colors flex items-center gap-1 ${
                        selectedLayer.fillMode === mode.value
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/20'
                      }`}
                      title={mode.label}
                    >
                      <IconComponent />
                      <span className="hidden sm:inline">{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Section */}
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-xs font-medium text-[var(--text-primary)] mb-2 uppercase tracking-wide">
                Color
              </h3>
              
              <ColorPicker
                value={selectedLayer.color}
                onChange={handleColorSelect}
              />
            </div>

            {/* Dynamic Parameters Section */}
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
                  className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--accent-primary)] hover:text-white rounded transition-colors"
                  title="Reset all parameters to default values"
                >
                  Reset
                </button>
              </div>

              <div className="space-y-2">
                {selectedLayer.type && (() => {
                  const patternDef = PATTERN_DEFINITIONS.find(p => p.id === selectedLayer.type);
                  if (!patternDef) return null;

                  return Object.entries(patternDef.parameterConfig).map(([paramKey, config]) => {
                    const currentValue = (selectedLayer.parameters as any)[paramKey] ?? config.min;
                    const defaultValue = (patternDef.defaultParameters as any)[paramKey];
                    
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
        </>
      )}
    </aside>
  );
} 