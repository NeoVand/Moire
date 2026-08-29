import { useEffect, useState } from 'react';
import {
  BlurIcon,
  Copy01Icon,
  Delete02Icon,
  GaugeIcon,
  ImageDownloadIcon,
  KeyboardIcon,
  Move01Icon,
  Rotate01Icon,
  SlidersHorizontalIcon,
  ViewOffIcon,
  ZoomInAreaIcon,
} from '@hugeicons/core-free-icons';
import { isTypingTarget } from '../lib/keyboard';
import { Icon } from './ui/Icon';

const ROWS: { icon: typeof KeyboardIcon; keys: string; detail: string }[] = [
  { icon: Move01Icon, keys: 'Drag', detail: 'Move the selected field' },
  { icon: Rotate01Icon, keys: '⌥-drag', detail: 'Rotate around the origin' },
  { icon: Move01Icon, keys: 'Space-drag', detail: 'Pan the canvas' },
  { icon: ZoomInAreaIcon, keys: 'Scroll', detail: 'Zoom to the cursor' },
  { icon: SlidersHorizontalIcon, keys: 'Shift-drag', detail: 'Fine-tune — sliders, moves, rotations' },
  { icon: ViewOffIcon, keys: 'H', detail: 'Hide or show' },
  { icon: Copy01Icon, keys: 'D', detail: 'Duplicate' },
  { icon: Delete02Icon, keys: '⌫', detail: 'Remove' },
  { icon: KeyboardIcon, keys: '1–9', detail: 'Select a layer' },
  { icon: ZoomInAreaIcon, keys: 'F', detail: 'Reset view' },
  { icon: ImageDownloadIcon, keys: 'E', detail: 'Export a PNG' },
  { icon: BlurIcon, keys: 'V', detail: 'Pattern or envelope' },
  { icon: GaugeIcon, keys: 'R', detail: 'Fringe ratio map' },
  { icon: KeyboardIcon, keys: 'I', detail: 'Hide or show the studio' },
];

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onToggle = () => setOpen((prev) => !prev);
    window.addEventListener('keydown', onKey);
    window.addEventListener('moire-shortcuts', onToggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('moire-shortcuts', onToggle);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6">
      <div className="hud-card pointer-events-auto w-[22rem] p-5">
        <div className="mb-4 flex items-center gap-2 text-[var(--text-primary)]">
          <Icon icon={KeyboardIcon} size={18} />
          <span className="text-sm font-medium">Shortcuts</span>
        </div>
        <ul className="grid gap-2.5">
          {ROWS.map((row) => (
            <li key={row.keys} className="flex items-center gap-3 text-[12px]">
              <span className="text-[var(--text-muted)]">
                <Icon icon={row.icon} size={15} />
              </span>
              <span className="flex-1 text-[var(--text-secondary)]">{row.detail}</span>
              <kbd className="font-mono text-[11px] text-[var(--text-primary)]">{row.keys}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
