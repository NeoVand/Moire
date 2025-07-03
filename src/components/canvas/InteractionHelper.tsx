import { Mouse, RotateCw, Move, Hand } from 'lucide-react';
import type { InteractionMode } from '../../utils/canvasInteractions';

interface InteractionHelperProps {
  currentMode: InteractionMode;
  selectedLayerName?: string;
  isVisible?: boolean;
}

/**
 * Visual helper component that shows interaction modes and keyboard shortcuts
 */
export function InteractionHelper({ 
  currentMode, 
  selectedLayerName, 
  isVisible = true 
}: InteractionHelperProps) {
  if (!isVisible) return null;

  const modes = [
    {
      mode: 'pan' as InteractionMode,
      icon: Hand,
      title: 'Pan Canvas',
      shortcut: 'Click + Drag',
      description: 'Move around the canvas',
      active: currentMode === 'pan',
    },
    {
      mode: 'move-layer' as InteractionMode,
      icon: Move,
      title: 'Move Layer',
      shortcut: '⌥ + Drag',
      description: selectedLayerName ? `Move "${selectedLayerName}"` : 'Move selected layer',
      active: currentMode === 'move-layer',
      disabled: !selectedLayerName,
    },
    {
      mode: 'rotate-layer' as InteractionMode,
      icon: RotateCw,
      title: 'Rotate Layer',
      shortcut: '⌥ + ⇧ + Drag',
      description: selectedLayerName ? `Rotate "${selectedLayerName}"` : 'Rotate selected layer',
      active: currentMode === 'rotate-layer',
      disabled: !selectedLayerName,
    },
  ];

  return (
    <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm text-white rounded-lg border border-white/20 overflow-hidden min-w-[240px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/20 bg-white/5">
        <div className="flex items-center gap-2">
          <Mouse className="w-4 h-4" />
          <span className="text-sm font-medium">Canvas Controls</span>
        </div>
      </div>

      {/* Mode List */}
      <div className="p-2">
        {modes.map((modeInfo) => {
          const IconComponent = modeInfo.icon;
          return (
            <div
              key={modeInfo.mode}
              className={`flex items-center gap-3 px-2 py-2 rounded-md transition-colors ${
                modeInfo.active
                  ? 'bg-blue-500/30 border border-blue-400/50'
                  : modeInfo.disabled
                  ? 'opacity-50'
                  : 'hover:bg-white/5'
              }`}
            >
              <div className={`flex-shrink-0 w-6 h-6 rounded-sm flex items-center justify-center ${
                modeInfo.active ? 'bg-blue-500/50' : 'bg-white/10'
              }`}>
                <IconComponent className="w-3.5 h-3.5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{modeInfo.title}</span>
                  <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">
                    {modeInfo.shortcut}
                  </span>
                </div>
                <div className="text-xs text-white/70 truncate mt-0.5">
                  {modeInfo.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Tips */}
      <div className="px-3 py-2 border-t border-white/20 bg-white/5">
        <div className="text-xs text-white/70">
          <div className="mb-1">• Rotation: drag up ↑ for counter-clockwise</div>
          <div>• Rotation: drag down ↓ for clockwise</div>
        </div>
      </div>
    </div>
  );
} 