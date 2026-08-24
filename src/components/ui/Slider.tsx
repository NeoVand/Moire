import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCwIcon } from '@hugeicons/core-free-icons';
import { Icon } from './Icon';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  defaultValue?: number;
  onChange: (value: number) => void;
}

function formatValue(value: number, step: number): string {
  if (value === 0) return '0';
  if (Number.isInteger(value)) return String(value);
  const decimals = step <= 0.001 ? 3 : step < 1 ? 2 : 1;
  return String(Number(value.toFixed(decimals)));
}

function nearlyEqual(a: number, b: number, step: number) {
  return Math.abs(a - b) <= Math.max(step * 0.51, 1e-6);
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  defaultValue,
  onChange,
}: SliderProps) {
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
  const mid = min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : 0;
  const fillLeft = min < 0 && max > 0 ? Math.min(pct, mid) : 0;
  const fillWidth = min < 0 && max > 0 ? Math.abs(pct - mid) : pct;
  const isDirty = defaultValue !== undefined && !nearlyEqual(value, defaultValue, step);

  return (
    <div className="grid gap-0.5">
      <div className="flex h-3.5 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--text-secondary)]">
          <span className="truncate">{label}</span>
          {isDirty && (
            <button
              type="button"
              title={`Reset ${label}`}
              aria-label={`Reset ${label}`}
              onClick={() => onChange(defaultValue)}
              className="grid size-3.5 place-items-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <Icon icon={RefreshCwIcon} size={10} />
            </button>
          )}
        </span>
        {isEditing ? (
          <input
            className="w-10 bg-transparent text-right font-mono text-[10px] tabular-nums text-[var(--text-primary)] outline-none"
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
            className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]"
            onClick={() => {
              setDraft(String(value));
              setIsEditing(true);
            }}
          >
            {formatValue(value, step)}
            {unit && <span>{unit}</span>}
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
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--track)]" />
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--text-primary)]"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--text-primary)] bg-[var(--bg-secondary)]"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
