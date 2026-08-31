import { useRef, type RefObject } from 'react';
import {
  createAnimator,
  scheduleOf,
  type Animator,
  type MotionEase,
  type MotionMode,
} from '../types/motion';
import { useProjectStore } from '../store/project';
import { useTransportStore } from '../store/transport';
import { Popover } from './ui/Popover';

/**
 * What one knob does over time, set where the knob is, so the pattern is moving
 * behind the panel while the interval is being chosen. That is the whole reason
 * this is a popover and not a modal: a dialog would cover the thing being tuned.
 *
 * Speed is a period rather than a rate. Units per second is the obvious encoding
 * and the wrong one for composing a shot, where what is known is that the clip is
 * eight seconds and wants two crossings in it. The rate is shown underneath, for
 * anyone who wants it.
 */

const MODES: { id: MotionMode; label: string; hint: string }[] = [
  { id: 'bounce', label: 'Bounce', hint: 'There and back, forever.' },
  { id: 'loop', label: 'Loop', hint: 'To the end, then jump back and repeat.' },
  { id: 'once', label: 'Once', hint: 'Cross once and stay there.' },
];

const EASES: { id: MotionEase; label: string }[] = [
  { id: 'inOut', label: 'Eased' },
  { id: 'linear', label: 'Linear' },
];

const chip = (active: boolean) =>
  `rounded-md px-2 py-[3px] text-[10.5px] ${
    active
      ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
  }`;

function Num({
  label,
  value,
  onChange,
  step = 0.1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[10.5px] text-[var(--text-secondary)]">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
          step={step}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="quiet-edit w-14 rounded-md bg-[var(--bg-primary)] px-1.5 py-0.5 text-right font-mono text-[10px] tabular-nums text-[var(--text-primary)] outline-none"
        />
        {suffix && <span className="w-3 text-[9px] text-[var(--text-muted)]">{suffix}</span>}
      </span>
    </label>
  );
}

export function MotionPopover({
  open,
  onClose,
  triggerRef,
  path,
  label,
  min,
  max,
  value,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  path: string;
  label: string;
  min: number;
  max: number;
  /** The knob's value right now, which is where a fresh animation starts from. */
  value: number;
}) {
  const motion = useProjectStore((s) => s.motion);
  const putAnimator = useProjectStore((s) => s.putAnimator);
  const removeAnimator = useProjectStore((s) => s.removeAnimator);
  const timings = motion.timings;
  const existing = motion.animators.find((a) => a.path === path);
  const draft = useRef<Animator | null>(null);

  // Opening on an un-animated knob proposes one rather than showing an empty
  // panel: from where the knob is now to the far end of its range, which is the
  // sweep most often wanted and always the one easiest to correct.
  if (open && !existing && !draft.current) {
    const far = Math.abs(max - value) >= Math.abs(value - min) ? max : min;
    draft.current = createAnimator(path, { from: value, to: far });
  }
  if (!open) draft.current = null;

  const a = existing ?? draft.current;
  const live = !!existing;

  const edit = (patch: Partial<Animator>) => {
    if (!a) return;
    const next = { ...a, ...patch };
    draft.current = next;
    if (live) putAnimator(next);
  };

  const enable = () => {
    if (!a) return;
    putAnimator(a);
    // A knob that has just been given motion should be seen to move.
    if (!a.hold) useTransportStore.getState().stop();
  };

  if (!a) return null;
  const s = scheduleOf(a, timings);
  const span = Math.abs(a.to - a.from);
  const rate = span / Math.max(1e-3, s.period);

  return (
    <Popover open={open} width={224} triggerRef={triggerRef} onClose={onClose}>
      <div className="grid gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium text-[var(--text-primary)]">{label}</span>
          <span className="font-mono text-[9px] text-[var(--text-muted)]">motion</span>
        </div>

        <div className="grid gap-1.5">
          <span className="text-[10px] text-[var(--text-muted)]">Interval</span>
          <Num label="From" value={a.from} onChange={(from) => edit({ from })} />
          <Num label="To" value={a.to} onChange={(to) => edit({ to })} />
        </div>

        <div className="grid gap-1.5 border-t border-[var(--border)] pt-2">
          <Num
            label="Seconds across"
            value={s.period}
            step={0.5}
            onChange={(period) => edit({ period: Math.max(0.05, period), timing: null })}
          />
          <p className="text-[9px] leading-[1.4] text-[var(--text-muted)]">
            {rate < 1000 ? `${(Math.round(rate * 100) / 100).toString()} per second` : 'very fast'}
            {s.mode === 'bounce' && ` · ${Math.round(s.period * 2 * 10) / 10}s there and back`}
          </p>
        </div>

        <div className="flex gap-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              className={chip(s.mode === m.id)}
              onClick={() => edit({ mode: m.id, timing: null })}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          {EASES.map((e) => (
            <button
              key={e.id}
              type="button"
              className={chip(s.ease === e.id)}
              onClick={() => edit({ ease: e.id, timing: null })}
            >
              {e.label}
            </button>
          ))}
          <span className="flex-1" />
          <Num
            label="Delay"
            value={s.delay}
            step={0.5}
            suffix="s"
            onChange={(delay) => edit({ delay: Math.max(0, delay), timing: null })}
          />
        </div>

        <label className="flex items-start gap-2 border-t border-[var(--border)] pt-2">
          <input
            type="checkbox"
            checked={a.hold}
            onChange={(e) => edit({ hold: e.target.checked })}
            className="mt-[2px]"
          />
          <span className="text-[10px] leading-[1.35] text-[var(--text-secondary)]">
            Only on play
            <span className="block text-[9px] text-[var(--text-muted)]">
              Otherwise it moves as soon as it is set. Recording ignores this.
            </span>
          </span>
        </label>

        <div className="flex gap-2 border-t border-[var(--border)] pt-2">
          {live ? (
            <button
              type="button"
              className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[10.5px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                removeAnimator(a.id);
                draft.current = null;
                onClose();
              }}
            >
              Remove motion
            </button>
          ) : (
            <button
              type="button"
              className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[10.5px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              onClick={enable}
            >
              Animate this
            </button>
          )}
        </div>
      </div>
    </Popover>
  );
}
