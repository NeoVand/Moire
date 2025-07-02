import React, { useRef } from 'react';
import { Upload, Download, ZoomIn, ZoomOut, Sun, Moon } from 'lucide-react';
import { Button } from '../ui';
import { useMoireProjectContext } from '../../hooks/MoireProjectContext';
import { useTheme } from '../../hooks/useTheme';

export function Header() {
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

  return (
    <header className="bg-transparent border-b border-[var(--border)]/50 flex items-center justify-between px-3 py-2 flex-shrink-0">
      {/* Left - Logo, Import/Export & Zoom Controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[var(--accent-primary)] rounded flex items-center justify-center text-white text-xs font-bold">
            M
          </div>
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">Moiré</h1>
        </div>
        
        <div className="w-px h-5 bg-[var(--border)]" />
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleImport}
          >
            <Upload className="w-3 h-3 mr-1" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleExport}
          >
            <Download className="w-3 h-3 mr-1" />
            Export
          </Button>
        </div>
        
        <div className="w-px h-5 bg-[var(--border)]" />
        
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3 text-[var(--text-secondary)]" />
          </button>
          
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-xs font-mono text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors min-w-[3rem] text-center"
          >
            {Math.round(project.canvas.zoom * 100)}%
          </button>
          
          <button
            onClick={zoomIn}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3 text-[var(--text-secondary)]" />
          </button>
        </div>
        
        <div className="w-px h-5 bg-[var(--border)]" />
        
        {/* Background Color Picker */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--text-secondary)]">BG:</span>
          <input
            type="color"
            value={project.canvas.backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border border-[var(--border)] bg-transparent"
            title="Canvas Background Color"
          />
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

      {/* Right - Theme Toggle */}
      <div className="flex items-center">
        <button
          onClick={toggleTheme}
          className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-[var(--text-secondary)]" />
          ) : (
            <Moon className="w-4 h-4 text-[var(--text-secondary)]" />
          )}
        </button>
      </div>
    </header>
  );
} 