import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayIcon, RefreshCwIcon } from '@hugeicons/core-free-icons';
import { Icon } from './Icon';
import { InfoTip } from './Tip';
import { useParamRegistration, type ParamPath } from '../../store/params';
import { useEditorStore } from '../../store/editor';
import { useProjectStore } from '../../store/project';
import { useTransportStore } from '../../store/transport';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  defaultValue?: number;
  /** One sentence on what the knob does, behind a little circled i. */
  info?: string;
  /**
   * Where this knob lives in the document, e.g. `view.envelopeContrast` or
   * `layer.abc.spacing`. Publishing it is what lets motion name the same knob
   * across a reload. A slider that addresses nothing storable -- a preview
   * control, a colour component -- passes none and simply cannot be animated.
   */
  path?: ParamPath;
  /** Whole numbers only: taps, sides, counts. See ParamDescriptor. */
  quantize?: 'int';
  /** Stored value times this is what is shown; only the wave's phase needs it. */
  display?: number;
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
  info,
  path,
  quantize,
  display,
  onChange,
}: SliderProps) {
  // What the knob is, for anything that needs to talk about it rather than to
  // it. Ranges live in the markup; copying them into a table elsewhere would
  // only give them somewhere to go stale.
  useParamRegistration(path ? { path, label, min, max, step, unit, quantize, display } : null);
  const trackRef = useRef<HTMLDivElement>(null);
  // Whether this knob already has motion, so the button can say so at a glance
  // rather than only inside the panel behind it.
  const animated = useProjectStore((s) =>
    path ? s.motion.animators.some((a) => a.path === path && a.enabled) : false
  );
  const editing = useEditorStore((s) => path !== undefined && s.motionPath === path);
  const toggleMotion = useEditorStore((s) => s.toggleMotion);
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
    const onUp = () => {
      setIsDragging(false);
      useTransportStore.getState().setInteracting(false);
    };
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
      // A panel that closes mid-drag would otherwise leave motion yielding to a
      // hand that is no longer there, and nothing would ever move again.
      useTransportStore.getState().setInteracting(false);
    };
  }, [isDragging, applyFromClientX]);

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setIsEditing(false);
  };

  // A stored value can sit outside the range the markup allows (an image field
  // widens Extent, and removing the image narrows it again); the thumb stays on
  // the track either way.
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const mid = min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : 0;
  const fillLeft = min < 0 && max > 0 ? Math.min(pct, mid) : 0;
  const fillWidth = min < 0 && max > 0 ? Math.abs(pct - mid) : pct;
  const isDirty =
    defaultValue !== undefined &&
    (!nearlyEqual(value, defaultValue, step) ||
      formatValue(value, step) !== formatValue(defaultValue, step));

  return (
    <div className="group/slider grid gap-0.5">
      <div className="flex h-3.5 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--text-secondary)]">
          <span className="min-w-0 truncate">{label}</span>
          {info && <InfoTip text={info} label={label} />}
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
          {path && (
            <button
              type="button"
              title={animated ? `${label} is animated` : `Animate ${label}`}
              aria-label={animated ? `${label} is animated` : `Animate ${label}`}
              onClick={() => toggleMotion(path)}
              className={`grid size-4 shrink-0 place-items-center ${
                animated || editing
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] opacity-0 group-hover/slider:opacity-100 focus-visible:opacity-100'
              } hover:text-[var(--text-primary)]`}
            >
              <Icon icon={PlayIcon} size={11} />
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
        className="relative h-4 overflow-visible cursor-ew-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
          // Motion yields while the knob is held, so an animated one can be
          // grabbed and looked at rather than fighting the clock for its value.
          useTransportStore.getState().setInteracting(true);
          applyFromClientX(e.clientX, e.shiftKey);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 rounded-full bg-[var(--track)]" />
        <div
          className="absolute top-1/2 h-[1.5px] -translate-y-1/2 rounded-full bg-[var(--text-primary)]"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        <div
          className="absolute top-1/2 size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-solid border-[var(--text-primary)] bg-[var(--bg-secondary)]"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
