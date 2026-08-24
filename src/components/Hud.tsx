import {
  ColorsIcon,
  GeometricShapes01Icon,
  KeyboardIcon,
  Moon02Icon,
  Sun03Icon,
  ZoomInAreaIcon,
} from '@hugeicons/core-free-icons';
import { useTheme } from '../hooks/useTheme';
import { useProjectStore } from '../store/project';
import { ColorField } from './ui/ColorField';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/IconButton';

export function Hud() {
  const zoom = useProjectStore((s) => s.camera.zoom);
  const backgroundColor = useProjectStore((s) => s.backgroundColor);
  const resetView = useProjectStore((s) => s.resetView);
  const setBackgroundColor = useProjectStore((s) => s.setBackgroundColor);
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
      <div
        className="pointer-events-auto flex items-center gap-2 text-[var(--text-primary)]"
        title="Press ? for shortcuts"
      >
        <Icon icon={GeometricShapes01Icon} size={18} />
        <span className="text-sm font-medium tracking-tight">Moire</span>
      </div>
      <div className="hud-card pointer-events-auto flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          title="Reset view"
          onClick={resetView}
          onMouseDown={(e) => e.currentTarget.blur()}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-mono text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          <Icon icon={ZoomInAreaIcon} size={15} />
          {Math.round(zoom * 100)}%
        </button>
        <span className="flex items-center gap-1.5 px-2">
          <span className="text-[var(--text-muted)]">
            <Icon icon={ColorsIcon} size={15} />
          </span>
          <ColorField value={backgroundColor} onChange={setBackgroundColor} />
        </span>
        <IconButton
          icon={theme === 'dark' ? Sun03Icon : Moon02Icon}
          label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={toggleTheme}
        />
        <IconButton
          icon={KeyboardIcon}
          label="Shortcuts"
          onClick={() => window.dispatchEvent(new Event('moire-shortcuts'))}
        />
      </div>
    </header>
  );
}
