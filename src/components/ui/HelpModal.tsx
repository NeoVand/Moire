import React from 'react';
import { X, ExternalLink, Layers, Settings, MousePointer, Keyboard } from 'lucide-react';
import { MoireAnimation } from './MoireAnimation';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Simple dark backdrop without blur */}
      <div className="absolute inset-0 bg-black/50" />
      
      {/* Modal with same glass material as sidebars */}
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-[var(--bg-secondary)]/80 backdrop-blur-xl border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Gradient background overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-start)]/5 via-transparent to-[var(--gradient-end)]/5 pointer-events-none" />
        
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-4 border-b border-[var(--border)]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-xl flex items-center justify-center text-white shadow-lg">
              <span className="text-lg font-bold">?</span>
            </div>
            <div>
              <h2 className="text-xl font-bold gradient-text">Help & Documentation</h2>
              <p className="text-sm text-[var(--text-secondary)]">Learn how to create stunning Moiré patterns</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-tertiary)]/60 rounded-lg transition-all duration-200 hover:scale-105"
            title="Close help"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="relative z-10 overflow-y-auto max-h-[50vh] p-6 space-y-6">
          {/* About Moiré Patterns */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-lg flex items-center justify-center">
                <ExternalLink className="w-3 h-3 text-white" />
              </div>
              About Moiré Patterns
            </h3>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Moiré patterns are fascinating visual phenomena created when two or more repetitive patterns overlap.
              These interference patterns create beautiful, complex designs that appear to move and shift.
            </p>
            {/* Interactive Animation with side content */}
            <div className="mt-4 flex gap-6 items-start">
              {/* Animation on the left */}
              <div className="flex-shrink-0">
                <MoireAnimation />
              </div>
              
              {/* Content on the right */}
              <div className="flex-1 space-y-3">
                <a
                  href="https://en.wikipedia.org/wiki/Moiré_pattern"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gradient-to-r from-[var(--gradient-start)]/20 to-[var(--gradient-end)]/20 hover:from-[var(--gradient-start)]/30 hover:to-[var(--gradient-end)]/30 border border-[var(--gradient-start)]/50 rounded-lg transition-all duration-200 hover:scale-105 text-[var(--text-primary)] font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Learn more
                </a>
                
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed space-y-2">
                  <p>
                    Watch as two sets of concentric circles follow curved mathematical paths and approach each other.
                  </p>
                  <p>
                    When the patterns overlap, they create dynamic interference effects - this is the essence of Moiré phenomena.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Creating Patterns */}
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-lg flex items-center justify-center">
                <Layers className="w-3 h-3 text-white" />
              </div>
              Creating Patterns
            </h3>
            
            <div className="space-y-4">
              <div className="bg-[var(--bg-tertiary)]/40 backdrop-blur-sm rounded-lg p-4 border border-[var(--border)]/30">
                <h4 className="font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded text-white text-xs flex items-center justify-center font-bold">1</span>
                  Add Layers
                </h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                  Start by adding pattern layers using the <strong>+ button</strong> in the left sidebar. Each layer represents a different pattern that will contribute to the final Moiré effect.
                </p>
              </div>

              <div className="bg-[var(--bg-tertiary)]/40 backdrop-blur-sm rounded-lg p-4 border border-[var(--border)]/30">
                <h4 className="font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded text-white text-xs flex items-center justify-center font-bold">2</span>
                  Choose Categories
                </h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                  Select from different pattern categories: <strong>Lines</strong>, <strong>Curves</strong>, <strong>Tiles</strong>, and <strong>Concentric</strong> shapes. Each category offers unique geometric patterns.
                </p>
              </div>

              <div className="bg-[var(--bg-tertiary)]/40 backdrop-blur-sm rounded-lg p-4 border border-[var(--border)]/30">
                <h4 className="font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded text-white text-xs flex items-center justify-center font-bold">3</span>
                  Select Pattern Types
                </h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                  Within each category, choose specific pattern types like straight lines, sine waves, triangular tiling, or concentric circles.
                </p>
              </div>

              <div className="bg-[var(--bg-tertiary)]/40 backdrop-blur-sm rounded-lg p-4 border border-[var(--border)]/30">
                <h4 className="font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded text-white text-xs flex items-center justify-center font-bold">4</span>
                  Adjust Parameters
                </h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                  Fine-tune your patterns using sliders for spacing, thickness, count, phase, and other parameters. Small adjustments can create dramatic visual effects.
                </p>
              </div>
            </div>
          </section>

          {/* Advanced Controls */}
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-lg flex items-center justify-center">
                <Keyboard className="w-3 h-3 text-white" />
              </div>
              Advanced Controls
            </h3>

            <div className="space-y-3">
              <div className="bg-[var(--bg-tertiary)]/40 backdrop-blur-sm rounded-lg p-4 border border-[var(--border)]/30">
                <h4 className="font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[var(--gradient-start)]" />
                  Fine Slider Control
                </h4>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                  Hold <kbd className="px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-xs font-mono">Option/Alt</kbd> while dragging sliders for precise, fine-tuned control with 20x higher precision.
                </p>
              </div>

              <div className="bg-[var(--bg-tertiary)]/40 backdrop-blur-sm rounded-lg p-4 border border-[var(--border)]/30">
                <h4 className="font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <MousePointer className="w-4 h-4 text-[var(--gradient-start)]" />
                  Canvas Interactions
                </h4>
                <div className="space-y-2 text-[var(--text-secondary)] text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-xs font-mono">Option/Alt + Drag</kbd>
                    <span>Move the selected layer around the canvas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-xs font-mono">Option/Alt + Shift + Drag</kbd>
                    <span>Rotate the selected layer (up = counter-clockwise, down = clockwise)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-xs font-mono">Click + Drag</kbd>
                    <span>Pan around the canvas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-xs font-mono">Scroll</kbd>
                    <span>Zoom in and out of the canvas</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section className="bg-gradient-to-r from-[var(--gradient-start)]/10 to-[var(--gradient-end)]/10 rounded-lg p-4 border border-[var(--gradient-start)]/20">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">💡 Pro Tips</h3>
            <ul className="space-y-2 text-[var(--text-secondary)] text-sm">
              <li>• Experiment with different blend modes to create unique overlay effects</li>
              <li>• Try layering different pattern types for complex interference patterns</li>
              <li>• Adjust opacity and rotation for subtle but impactful changes</li>
              <li>• Use the eye icon to toggle layer visibility and isolate effects</li>
              <li>• Small parameter changes can create dramatically different results</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="relative z-10 p-3 border-t border-[var(--border)]/50 bg-[var(--bg-tertiary)]/20">
          <p className="text-xs text-[var(--text-secondary)] text-center">
            Press <kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-xs font-mono">H</kbd> to toggle canvas help overlay
          </p>
        </div>
      </div>
    </div>
  );
} 