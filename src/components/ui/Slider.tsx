import { useCallback, useEffect, useRef, useState } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

function formatValue(value: number, step: number): string {
  if (value === 0) return '0';
  if (Number.isInteger(value)) return String(value);
  if (step <= 0.001) return value.toFixed(3);
  if (step <= 0.01) return value.toFixed(3);
  return value.toFixed(2);
}

export function Slider({ label, value, min, max, step, unit = '', onChange }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const applyFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = min + t * (max - min);
      const stepped = Math.round(raw / step) * step;
      onChange(Math.min(max, Math.max(min, stepped)));
    },
    [min, max, step, onChange]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => applyFromClientX(e.clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, applyFromClientX]);

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setIsEditing(false);
  };

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
          {label}
        </span>
        {isEditing ? (
          <input
            className="w-16 bg-transparent text-right font-mono text-[11px] text-[var(--text-primary)] outline-none"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setIsEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="font-mono text-[11px] text-[var(--text-primary)]"
            onClick={() => {
              setDraft(String(value));
              setIsEditing(true);
            }}
          >
            {formatValue(value, step)}
            {unit && <span className="text-[var(--text-muted)]">{unit}</span>}
          </button>
        )}
      </div>
      <div
        ref={trackRef}
        className="relative h-3 cursor-ew-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
          applyFromClientX(e.clientX);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--border)]" />
        <div
          className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--text-primary)]"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-primary)]"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
