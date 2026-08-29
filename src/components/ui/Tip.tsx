import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TIP_BUBBLE, placeTip } from './useHoverTip';

/**
 * The little circled i beside a parameter: a click opens a sentence about what
 * the knob actually does, and it stays until the next click, an outside press,
 * or Escape. Portal-positioned, so nothing clips it.
 */

const INFO_WIDTH = 232;

export function InfoTip({ text, label }: { text: string; label: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!rect) return;
    const onPointer = (e: PointerEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setRect(null);
    };
    // Capture phase, so Escape closes the bubble without also closing the
    // panel listening on the bubble phase behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setRect(null);
      }
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [rect]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${label}`}
        onClick={() =>
          setRect((open) => (open ? null : (btnRef.current?.getBoundingClientRect() ?? null)))
        }
        className={`grid size-3.5 shrink-0 place-items-center rounded-full text-[8px] leading-none font-semibold ${
          rect
            ? 'text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] opacity-60 hover:text-[var(--text-primary)] hover:opacity-100'
        }`}
      >
        <span className="grid size-3 place-items-center rounded-full border border-current">i</span>
      </button>
      {rect &&
        createPortal(
          <div className={TIP_BUBBLE} style={{ ...placeTip(rect, INFO_WIDTH), width: INFO_WIDTH }}>
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
