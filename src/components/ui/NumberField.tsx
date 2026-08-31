import { useRef, useState } from 'react';

/**
 * A number you can drag or type, and nothing else.
 *
 * `<input type="number">` brings the browser's spinners with it: two tiny
 * arrows in whatever the platform thinks is a good grey, at whatever size it
 * likes, and a click target too small to hit. Dragging is also the gesture that
 * actually suits these values -- you are looking for a period that feels right,
 * not entering one you already know -- and clicking still opens a text field for
 * when you do know.
 */
export function NumberField({
  value,
  onChange,
  step = 0.1,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  suffix,
  width = 52,
  decimals,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  width?: number;
  decimals?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);

  const places = decimals ?? (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const shown = Number.isFinite(value) ? value.toFixed(places) : '0';

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isNaN(parsed)) onChange(clamp(parsed));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="quiet-edit rounded-md bg-[var(--bg-primary)] px-1.5 py-[3px] text-right font-mono text-[10px] tabular-nums text-[var(--text-primary)] outline-none"
        style={{ width }}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      style={{ width }}
      className="cursor-ew-resize rounded-md bg-[var(--bg-primary)] px-1.5 py-[3px] text-right font-mono text-[10px] tabular-nums text-[var(--text-primary)] select-none hover:bg-[var(--bg-hover)]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, v: value, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 3) return;
        d.moved = true;
        // Two pixels to the step, an eighth of that with shift, matching the
        // fine-adjust the sliders already answer to.
        const unit = e.shiftKey ? step / 8 : step;
        onChange(clamp(d.v + Math.round(dx / 2) * unit));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        const d = drag.current;
        drag.current = null;
        // A press that never moved was a click, and a click means type it.
        if (d && !d.moved) {
          setDraft(shown);
          setEditing(true);
        }
      }}
    >
      {shown}
      {suffix && <span className="text-[var(--text-muted)]">{suffix}</span>}
    </button>
  );
}
