import React, { useRef } from 'react';
import { Upload, Download, ZoomIn, ZoomOut, Sun, Moon, HelpCircle } from 'lucide-react';
import { Button } from '../ui';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import { useTheme } from '../../hooks/useTheme';

interface HeaderProps {
  onHelpClick: () => void;
}

export function Header({ onHelpClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { project, resetZoom, zoomIn, zoomOut, setBackgroundColor } = useMoireProjectContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);
          console.log('Imported data:', data);
          // TODO: Implement project import
        } catch (error) {
          console.error('Failed to parse imported file:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(project, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name || 'moire-pattern'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleHelp = () => {
    onHelpClick();
  };

  return (
    <header className="flex items-center justify-between px-2 py-2 flex-shrink-0 relative overflow-hidden">
      {/* Gradient background overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-start)]/5 via-transparent to-[var(--gradient-end)]/5 pointer-events-none" />
      
      {/* Left - Logo, Import/Export & Zoom Controls */}
      <div className="flex items-center gap-2 relative z-10">
        <div className="flex items-center gap-2">
          {/* Compact Logo */}
          <div className="relative group">
            <div className="w-6 h-6 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-110">
              M
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-lg opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-lg" />
          </div>
          <h1 className="text-sm font-bold gradient-text">Moiré</h1>
        </div>
        
        <div className="w-px h-3 bg-gradient-to-b from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-30" />
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/10 hover:to-[var(--gradient-end)]/10"
            onClick={handleImport}
          >
            <Upload className="w-3 h-3 mr-1" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/10 hover:to-[var(--gradient-end)]/10"
            onClick={handleExport}
          >
            <Download className="w-3 h-3 mr-1" />
            Export
          </Button>
        </div>
        
        <div className="w-px h-3 bg-gradient-to-b from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-30" />
        
        {/* Compact Zoom Controls */}
        <div className="flex items-center gap-0.5 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm rounded-lg p-0.5 border border-[var(--border)]/50">
          <button
            onClick={zoomOut}
            className="p-1.5 hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20 rounded transition-all duration-200 hover:scale-105"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
          </button>
          
          <button
            onClick={resetZoom}
            className="px-2 py-1.5 text-xs font-mono text-[var(--text-secondary)] hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20 rounded transition-all duration-200 min-w-[3rem] text-center hover:text-[var(--text-primary)]"
          >
            {Math.round(project.canvas.zoom * 100)}%
          </button>
          
          <button
            onClick={zoomIn}
            className="p-1.5 hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20 rounded transition-all duration-200 hover:scale-105"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
          </button>
        </div>
        
        <div className="w-px h-3 bg-gradient-to-b from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-30" />
        
        {/* Compact Background Color Picker */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-[var(--border)]/50">
          <span className="text-xs font-medium text-[var(--text-secondary)] leading-none">Canvas:</span>
          <div className="relative group flex items-center">
            <input
              type="color"
              value={project.canvas.backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="w-5 h-5 rounded-md cursor-pointer border border-[var(--border)] bg-transparent hover:border-[var(--gradient-start)] transition-all duration-200 hover:scale-105"
              title="Canvas Background Color"
            />
            <div className="absolute inset-0 rounded-md bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-0 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none" />
          </div>
        </div>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Right - Help and Theme Toggle */}
      <div className="flex items-center gap-1 relative z-10">
        <div className="relative group">
          <button
            onClick={handleHelp}
            className="relative p-2 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20 rounded-lg transition-all duration-300 hover:scale-105 border border-[var(--border)]/50"
            title="Help & Documentation"
          >
            <HelpCircle className="w-4 h-4 text-[var(--text-secondary)] hover:text-[var(--gradient-start)] transition-colors" />
          </button>
          
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-lg pointer-events-none" />
        </div>
        
        <div className="relative group">
          <button
            onClick={toggleTheme}
            className="relative p-2 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/20 hover:to-[var(--gradient-end)]/20 rounded-lg transition-all duration-300 hover:scale-105 border border-[var(--border)]/50"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-[var(--text-secondary)] hover:text-[var(--gradient-start)] transition-colors" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--text-secondary)] hover:text-[var(--gradient-start)] transition-colors" />
            )}
          </button>
          
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-lg pointer-events-none" />
        </div>
      </div>
    </header>
  );
} 