import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A prompt name-on-hover for controls whose icon is their whole label — the
 * native title tooltip takes a second nobody waits for. The bubble renders
 * through a portal at a fixed position, so no scroll container or panel edge
 * clips it. `InfoTip` in Tip.tsx shares the look for click-to-explain.
 */

export const TIP_BUBBLE =
  'fixed z-[9999] rounded-md bg-[var(--bg-secondary)] px-2.5 py-1.5 text-[10.5px] ' +
  'leading-[1.45] text-[var(--text-primary)] ' +
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_32%,transparent),var(--hud-shadow)]';

export function placeTip(rect: DOMRect, width: number) {
  const pad = 8;
  const left = Math.min(
    Math.max(pad, rect.left + rect.width / 2 - width / 2),
    Math.max(pad, window.innerWidth - width - pad)
  );
  return { left, top: rect.bottom + 6 };
}

export function useHoverTip(text: string): {
  handlers: {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
  };
  bubble: ReactNode;
  clear: () => void;
} {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRect(null);
  }, []);

  useEffect(() => clear, [clear]);

  const onMouseEnter = useCallback((e: React.MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRect(target.getBoundingClientRect()), 350);
  }, []);

  const width = 10 + text.length * 5.4;
  const bubble = rect
    ? createPortal(
        <div
          className={`${TIP_BUBBLE} pointer-events-none whitespace-nowrap`}
          style={placeTip(rect, Math.min(width, 260))}
        >
          {text}
        </div>,
        document.body
      )
    : null;

  return { handlers: { onMouseEnter, onMouseLeave: clear }, bubble, clear };
}
