import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { IconButton } from './IconButton';

/**
 * A movable panel over the canvas — the editors' chrome. Unlike the Popover it
 * has no backdrop and takes no anchor: it floats where the author drags it, so
 * the picture stays fully visible and live while its parameters move. The
 * position survives reloads per panel id, because "put it in a corner" is a
 * decision, not a session.
 *
 * Dragging is the header's job; everything below it is the caller's. Escape
 * closes, clicks inside neither reach the canvas nor dismiss anything, and a
 * pointer-down anywhere on a panel raises it above its siblings.
 */

const PAD = 8;

let zTop = 60;

/** Open panels, bottom to top, so Escape can peel just the topmost. */
const stack: symbol[] = [];

interface Point {
  x: number;
  y: number;
}

function storageKey(id: string) {
  return `moire-panel-${id}`;
}

function readPosition(id: string): Point | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Point;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePosition(id: string, p: Point) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(p));
  } catch {
    // A private window forgets the corner; the panel still works.
  }
}

function clamp(p: Point, el: HTMLElement | null): Point {
  const w = el?.offsetWidth ?? 320;
  const h = el?.offsetHeight ?? 200;
  return {
    x: Math.min(Math.max(PAD, p.x), Math.max(PAD, window.innerWidth - w - PAD)),
    y: Math.min(Math.max(PAD, p.y), Math.max(PAD, window.innerHeight - h - PAD)),
  };
}

export function FloatingPanel({
  id,
  title,
  mark,
  width,
  defaultPosition,
  onClose,
  headerExtra,
  children,
}: {
  /** Stable key: names the remembered position. */
  id: string;
  title: ReactNode;
  /** Small leading glyph next to the title, e.g. the calligraphic f. */
  mark?: ReactNode;
  width: number;
  defaultPosition: Point;
  onClose: () => void;
  /** Controls that live in the header row, before the close button. */
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Point>(() => readPosition(id) ?? defaultPosition);
  const [z, setZ] = useState(() => ++zTop);
  const key = useRef(Symbol(id));
  const grip = useRef<{ dx: number; dy: number } | null>(null);

  // A panel restored off-screen (window shrank since) walks back inside.
  useEffect(() => {
    const replace = () => setPos((p) => clamp(p, panelRef.current));
    replace();
    window.addEventListener('resize', replace);
    return () => window.removeEventListener('resize', replace);
  }, []);

  // Escape peels panels top-down, one per press, so stacked editors close in
  // the order they were raised rather than all at once.
  useEffect(() => {
    const me = key.current;
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const raise = useCallback(() => {
    setZ(++zTop);
    const at = stack.indexOf(key.current);
    if (at >= 0) {
      stack.splice(at, 1);
      stack.push(key.current);
    }
  }, []);

  const beginDrag = (e: React.PointerEvent) => {
    // Buttons in the header keep their clicks; the header's empty run drags.
    if ((e.target as HTMLElement).closest('button, input, textarea')) return;
    e.preventDefault();
    // Capture pins every event of this gesture to the header. Without it a fast
    // drag outruns the re-render, the pointer slides off the header, and the
    // stream lands on whatever the panel body has underneath — sliders.
    e.currentTarget.setPointerCapture(e.pointerId);
    grip.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!grip.current) return;
    setPos(clamp({ x: e.clientX - grip.current.dx, y: e.clientY - grip.current.dy }, panelRef.current));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!grip.current) return;
    writePosition(
      id,
      clamp({ x: e.clientX - grip.current.dx, y: e.clientY - grip.current.dy }, panelRef.current)
    );
    grip.current = null;
  };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed rounded-2xl bg-[var(--bg-secondary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_30%,transparent),var(--hud-shadow)]"
      style={{ left: pos.x, top: pos.y, width, zIndex: z }}
      onPointerDown={(e) => {
        raise();
        e.stopPropagation();
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="flex cursor-grab items-center gap-2 px-4 pt-3 pb-2 select-none active:cursor-grabbing"
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {mark}
        <span className="text-[12px] font-medium text-[var(--text-primary)]">{title}</span>
        <span className="min-w-0 flex-1" />
        {headerExtra}
        <IconButton icon={Cancel01Icon} label="Close" onClick={onClose} size={14} dense />
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>,
    document.body
  );
}
