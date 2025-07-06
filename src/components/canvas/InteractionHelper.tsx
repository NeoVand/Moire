import { RotateCw, Move, Hand, ZoomIn } from 'lucide-react';
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
      mode: 'zoom' as const,
      icon: ZoomIn,
      title: 'Zoom Canvas',
      shortcut: 'Scroll Wheel',
      description: 'Zoom in and out of the canvas',
      active: false,
    },
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
      shortcut: 'Option/Alt + Drag',
      description: selectedLayerName ? `Move "${selectedLayerName}"` : 'Move selected layer',
      active: currentMode === 'move-layer',
      disabled: !selectedLayerName,
    },
    {
      mode: 'rotate-layer' as InteractionMode,
      icon: RotateCw,
      title: 'Rotate Layer',
      shortcut: 'Option/Alt + ⇧ + Drag',
      description: selectedLayerName ? `Rotate "${selectedLayerName}"` : 'Rotate selected layer',
      active: currentMode === 'rotate-layer',
      disabled: !selectedLayerName,
    },
  ];

  return (
    <div className="absolute bottom-6 left-[296px] z-[9999]">
      <div className="bg-[var(--bg-primary)]/10 backdrop-blur-sm text-white rounded-lg overflow-hidden min-w-[280px] shadow-xl border border-[#ff4e50]/30">
        {/* Mode List */}
        <div className="relative px-3 py-3 space-y-2">
          {modes.map((modeInfo) => {
            const IconComponent = modeInfo.icon;
            const isInteractiveMode = modeInfo.mode !== 'zoom' && modeInfo.mode !== 'pan';
            return (
              <div
                key={modeInfo.mode}
                className={`flex items-center gap-3 px-2 py-2 rounded-md transition-all duration-200 ${
                  modeInfo.active && isInteractiveMode
                    ? 'bg-gradient-to-r from-[#ff4e50]/15 to-[#f9d423]/15 border border-[#ff4e50]/40 shadow-sm'
                    : modeInfo.disabled
                    ? 'opacity-50'
                    : ''
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 shadow-sm ${
                  modeInfo.active && isInteractiveMode
                    ? 'bg-gradient-to-br from-[#ff4e50] to-[#f9d423] text-black' 
                    : 'bg-gradient-to-br from-[#ff4e50] to-[#f9d423] text-black'
                }`}>
                  <IconComponent className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0 mr-2">
                  <div className="text-xs font-medium text-white mb-0.5">{modeInfo.title}</div>
                  <div className="text-xs text-white/70 truncate">
                    {modeInfo.description}
                  </div>
                </div>
                
                <div className="flex-shrink-0">
                  <span className="text-xs bg-black/40 text-white/90 px-1.5 py-0.5 rounded text-xs font-mono border border-white/20 whitespace-nowrap">
                    {modeInfo.shortcut}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
} 