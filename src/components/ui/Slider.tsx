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

function snap(raw: number, step: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(raw / step) * step));
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
  const valueRef = useRef(value);
  const lastXRef = useRef(0);
  const fineOriginRef = useRef<{ x: number; value: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  valueRef.current = value;

  const applyFromClientX = useCallback(
    (clientX: number, shift: boolean) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      lastXRef.current = clientX;
      if (shift) {
        if (!fineOriginRef.current) {
          fineOriginRef.current = { x: clientX, value: valueRef.current };
        }
        const span = max - min;
        const raw =
          fineOriginRef.current.value +
          ((clientX - fineOriginRef.current.x) / Math.max(rect.width, 1)) * span * 0.12;
        const usedStep = step < 1 ? Math.max(step / 10, 1e-4) : step;
        onChange(snap(raw, usedStep, min, max));
        return;
      }
      fineOriginRef.current = { x: clientX, value: valueRef.current };
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(snap(min + t * (max - min), step, min, max));
    },
    [min, max, step, onChange]
  );

  useEffect(() => {
    if (!isDragging) {
      fineOriginRef.current = null;
      return;
    }
    const onMove = (e: MouseEvent) => applyFromClientX(e.clientX, e.shiftKey);
    const onUp = () => setIsDragging(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      fineOriginRef.current = { x: lastXRef.current, value: valueRef.current };
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
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
  const isDirty =
    defaultValue !== undefined &&
    (!nearlyEqual(value, defaultValue, step) ||
      formatValue(value, step) !== formatValue(defaultValue, step));

  return (
    <div className="grid gap-0.5">
      <div className="flex h-3.5 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--text-secondary)]">
          <span className="min-w-0 truncate">{label}</span>
          {isDirty && (
            <button
              type="button"
              title={`Reset ${label}`}
              aria-label={`Reset ${label}`}
              onClick={() => onChange(defaultValue)}
              className="grid size-3.5 shrink-0 place-items-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <Icon icon={RefreshCwIcon} size={10} />
            </button>
          )}
        </span>
        {isEditing ? (
          <input
            className="quiet-edit w-10 bg-transparent text-right font-mono text-[10px] tabular-nums text-[var(--text-primary)]"
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
            className="quiet-edit font-mono text-[10px] tabular-nums text-[var(--text-muted)]"
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
          applyFromClientX(e.clientX, e.shiftKey);
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
