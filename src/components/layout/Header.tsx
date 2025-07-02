import React, { useState } from 'react';
import { Sun, Moon, Menu, Save, Download, ZoomIn, ZoomOut, Move, Grid, RotateCcw, Monitor } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTheme } from '../../hooks/useTheme';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import type { Resolution } from '../../types/moire';

const RESOLUTION_PRESETS: { value: string; label: string; width: number; height: number }[] = [
  { value: 'small', label: '400×300 (Small)', width: 400, height: 300 },
  { value: 'medium', label: '800×600 (Medium)', width: 800, height: 600 },
  { value: 'large', label: '1200×900 (Large)', width: 1200, height: 900 },
  { value: 'hd', label: '1920×1080 (HD)', width: 1920, height: 1080 },
  { value: '4k', label: '3840×2160 (4K)', width: 3840, height: 2160 },
  { value: '8k', label: '7680×4320 (8K)', width: 7680, height: 4320 },
  { value: 'square-small', label: '500×500 (Small Square)', width: 500, height: 500 },
  { value: 'square-medium', label: '1000×1000 (Medium Square)', width: 1000, height: 1000 },
  { value: 'square-large', label: '2000×2000 (Large Square)', width: 2000, height: 2000 },
  { value: 'square-4k', label: '4096×4096 (4K Square)', width: 4096, height: 4096 },
  { value: 'print-a4', label: '2480×3508 (A4 Print)', width: 2480, height: 3508 },
  { value: 'print-a3', label: '3508×4961 (A3 Print)', width: 3508, height: 4961 },
  { value: 'ultra-wide', label: '3440×1440 (Ultra Wide)', width: 3440, height: 1440 },
  { value: 'cinema-4k', label: '4096×2160 (Cinema 4K)', width: 4096, height: 2160 },
];

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { project, setZoom, setPan, zoomIn, zoomOut, resetZoom, setResolution } = useMoireProjectContext();
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);

  const zoomPercentage = Math.round(project.canvas.zoom * 100);

  const handleResolutionSelect = (preset: { value: string; label: string; width: number; height: number }) => {
    setResolution(preset.width, preset.height);
    setShowResolutionMenu(false);
  };

  return (
    <header className="h-14 bg-[var(--bg-secondary)] border-b border-[var(--border)] px-4 flex items-center justify-between">
      {/* Left side - Logo and App Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Moiré
          </h1>
        </div>

        {/* File Operations */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm">
            <Menu className="w-4 h-4 mr-2" />
            File
          </Button>
          <Button variant="ghost" size="sm">
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
          <Button variant="ghost" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Center - Canvas Controls */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm">
          <Move className="w-4 h-4 mr-2" />
          Pan
        </Button>
        <Button variant="ghost" size="sm" onClick={zoomIn}>
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={zoomOut}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetZoom}
          className="px-2"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          {zoomPercentage}%
        </Button>
        
        <div className="w-px h-6 bg-[var(--border)] mx-2" />
        
        <Button variant="ghost" size="sm">
          <Grid className="w-4 h-4 mr-2" />
          Grid
        </Button>
        
        {/* Resolution Selector */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResolutionMenu(!showResolutionMenu)}
          >
            <Monitor className="w-4 h-4 mr-2" />
            {project.canvas.width} × {project.canvas.height}
          </Button>
          
          {showResolutionMenu && (
            <>
              <div className="absolute top-full right-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg z-10 min-w-56 max-h-80 overflow-y-auto">
                <div className="p-2">
                  <div className="text-xs font-medium text-[var(--text-secondary)] mb-2 px-2">
                    Resolution Presets
                  </div>
                  {RESOLUTION_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => handleResolutionSelect(preset)}
                      className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Click outside to close resolution menu */}
              <div
                className="fixed inset-0 z-5"
                onClick={() => setShowResolutionMenu(false)}
              />
            </>
          )}
        </div>
      </div>

      {/* Right side - Theme Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </Button>
      </div>
    </header>
  );
} 