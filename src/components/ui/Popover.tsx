import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * A panel anchored under a trigger, in a portal so it escapes the studio's
 * scroll container and its rounded clip.
 *
 * The trigger stays the caller's, because every use has its own shape — a colour
 * swatch, a header icon, a letter on a layer row — and only the placement, the
 * dismissal, and the portal are shared.
 */
export function usePopoverAnchor(
  open: boolean,
  width: number,
  triggerRef: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 240;
      const gap = 6;
      const pad = 8;
      const left = Math.min(
        Math.max(pad, rect.right - width),
        Math.max(pad, window.innerWidth - width - pad)
      );
      const below = rect.bottom + gap;
      const above = rect.top - gap - height;
      const top =
        below + height <= window.innerHeight - pad || above < pad
          ? Math.min(below, Math.max(pad, window.innerHeight - height - pad))
          : above;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, width, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, triggerRef]);

  return { panelRef, pos };
}

export function Popover({
  open,
  width,
  triggerRef,
  onClose,
  children,
}: {
  open: boolean;
  width: number;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const { panelRef, pos } = usePopoverAnchor(open, width, triggerRef, onClose);
  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 rounded-xl bg-[var(--bg-secondary)] p-3.5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_34%,transparent),var(--hud-shadow)]"
      style={{ top: pos.top, left: pos.left, width }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
