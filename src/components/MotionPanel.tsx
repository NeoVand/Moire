import { useEffect, useRef, useState } from 'react';
import {
  ArrowHorizontalIcon,
  ArrowReloadHorizontalIcon,
  ArrowRightToLineIcon,
  EaseInOutIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  SlashIcon,
  StopIcon,
} from '@hugeicons/core-free-icons';
import {
  createAnimator,
  sampleAnimator,
  scheduleOf,
  type Animator,
  type MotionEase,
  type MotionMode,
  type Timing,
} from '../types/motion';
import { useEditorStore } from '../store/editor';
import { paramDescriptor, readParam } from '../store/params';
import { useProjectStore } from '../store/project';
import { useTransportStore } from '../store/transport';
import { FloatingPanel } from './ui/FloatingPanel';
import { Icon, type HugeIcon } from './ui/Icon';
import { NumberField } from './ui/NumberField';

/**
 * What one knob does over time.
 *
 * The curve is the centre of it rather than decoration: mode, easing and period
 * are three abstractions whose combined effect is one shape, and the shape is
 * the thing being chosen. Drawn from the same `sampleAnimator` the transport
 * uses, so it cannot show an animation the tool would not produce.
 *
 * A movable window rather than a popover pinned to the slider. The knob is often
 * under where the panel wants to be, and being able to put it somewhere and have
 * it stay there across knobs is worth more than the anchoring.
 *
 * Every choice is named on its face. An icon-only segmented control makes the
 * reader hover five things to find out what they are, and a faster tooltip would
 * only make that quicker rather than unnecessary.
 */

const MODES: { id: MotionMode; label: string; hint: string; icon: HugeIcon }[] = [
  { id: 'bounce', label: 'Bounce', hint: 'There and back, forever.', icon: ArrowHorizontalIcon },
  {
    id: 'loop',
    label: 'Loop',
    hint: 'To the end, jump back, again.',
    icon: ArrowReloadHorizontalIcon,
  },
  { id: 'once', label: 'Once', hint: 'Cross once and stay.', icon: ArrowRightToLineIcon },
];

const EASES: { id: MotionEase; label: string; hint: string; icon: HugeIcon }[] = [
  { id: 'inOut', label: 'Eased', hint: 'Slow at both ends.', icon: EaseInOutIcon },
  { id: 'linear', label: 'Linear', hint: 'Constant rate throughout.', icon: SlashIcon },
];

const seg = (active: boolean) =>
  `flex h-[26px] items-center justify-center gap-1 rounded-[5px] text-[10px] transition-colors ${
    active
      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_22%,transparent)]'
      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
  }`;

const group = 'grid gap-0.5 rounded-md bg-[var(--bg-primary)] p-0.5';
const rowLabel = 'text-[9px] uppercase tracking-[0.09em] text-[var(--text-muted)]';

const W = 248;
const H = 62;

/** The animation as a shape, over two crossings, with a dot for where it is now. */
function Curve({ a, timings }: { a: Animator; timings: Timing[] }) {
  const dot = useRef<SVGCircleElement>(null);
  const s = scheduleOf(a, timings);
  const window = s.delay + s.period * (s.mode === 'once' ? 1.6 : 2);
  const lo = Math.min(a.from, a.to);
  const hi = Math.max(a.from, a.to);
  const span = Math.max(1e-6, hi - lo);

  const x = (t: number) => 3 + (t / window) * (W - 6);
  const y = (v: number) => H - 9 - ((v - lo) / span) * (H - 18);

  let d = '';
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * window;
    d += `${i ? 'L' : 'M'}${x(t).toFixed(2)} ${y(sampleAnimator(a, timings, t)).toFixed(2)}`;
  }

  // The playhead moves every frame; moving it through React would re-render the
  // whole panel sixty times a second to shift one circle two pixels.
  useEffect(() => {
    let raf = 0;
    const step = () => {
      raf = requestAnimationFrame(step);
      const node = dot.current;
      if (!node) return;
      const { state, t } = useTransportStore.getState();
      const now = state === 'stopped' ? performance.now() / 1000 : t;
      const wrapped = now % window;
      node.setAttribute('cx', String(x(wrapped)));
      node.setAttribute('cy', String(y(sampleAnimator(a, timings, wrapped))));
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="rounded-lg bg-[var(--bg-primary)]"
      aria-hidden
    >
      <line
        x1="3"
        y1={y(a.from)}
        x2={W - 3}
        y2={y(a.from)}
        className="stroke-[var(--track)]"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <line
        x1="3"
        y1={y(a.to)}
        x2={W - 3}
        y2={y(a.to)}
        className="stroke-[var(--track)]"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <path
        d={d}
        fill="none"
        className="stroke-[var(--text-primary)]"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle ref={dot} r="2.5" className="fill-[var(--text-primary)]" />
    </svg>
  );
}

/**
 * The transport, here as well as in the capture panel. Setting an animation up
 * and running it are the same activity, and sending someone to another window to
 * press play would make composing a shot a two-window job.
 */
function Transport() {
  const state = useTransportStore((s) => s.state);
  const t = useTransportStore((s) => s.t);
  const play = useTransportStore((s) => s.play);
  const pause = useTransportStore((s) => s.pause);
  const stop = useTransportStore((s) => s.stop);
  const seek = useTransportStore((s) => s.seek);
  const playing = state === 'playing';

  const btn =
    'grid size-7 place-items-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]';

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        className={btn}
        title="Back to the start"
        aria-label="Back to the start"
        onClick={() => seek(0)}
      >
        <Icon icon={PreviousIcon} size={13} />
      </button>
      <button
        type="button"
        className={`${btn} ${playing ? 'text-[var(--text-primary)]' : ''}`}
        title={playing ? 'Pause' : 'Play'}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => (playing ? pause() : play())}
      >
        <Icon icon={playing ? PauseIcon : PlayIcon} size={13} />
      </button>
      <button
        type="button"
        className={btn}
        title="Stop and rewind"
        aria-label="Stop and rewind"
        onClick={stop}
      >
        <Icon icon={StopIcon} size={13} />
      </button>
      <span className="flex-1" />
      <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
        {state === 'stopped' ? 'idle' : `${t.toFixed(1)}s`}
      </span>
    </div>
  );
}

export function MotionPanel() {
  const path = useEditorStore((s) => s.motionPath);
  const close = useEditorStore((s) => s.closeMotion);
  const motion = useProjectStore((s) => s.motion);
  const putAnimator = useProjectStore((s) => s.putAnimator);
  const removeAnimator = useProjectStore((s) => s.removeAnimator);

  const existing = path ? motion.animators.find((a) => a.path === path) : undefined;
  const desc = path ? paramDescriptor(path) : undefined;
  const [draft, setDraft] = useState<Animator | null>(null);

  // A knob with no motion gets a proposal rather than an empty form: from where
  // it stands to the far end of its range. A wrong suggestion is quicker to
  // correct than a blank one is to fill.
  useEffect(() => {
    if (!path || existing || !desc) {
      setDraft(null);
      return;
    }
    const now = readParam(path) ?? (desc.min + desc.max) / 2;
    const far = Math.abs(desc.max - now) >= Math.abs(now - desc.min) ? desc.max : desc.min;
    setDraft(createAnimator(path, { from: now, to: far }));
  }, [path, existing, desc]);

  if (!path || !desc) return null;
  const a = existing ?? draft;
  if (!a) return null;
  const live = !!existing;
  const s = scheduleOf(a, motion.timings);
  const step = Math.max(desc.step, (desc.max - desc.min) / 200);

  const edit = (patch: Partial<Animator>) => {
    const next = { ...a, ...patch };
    if (live) putAnimator(next);
    else setDraft(next);
  };

  return (
    <FloatingPanel
      id="motion"
      width={276}
      defaultPosition={{ x: 268, y: 120 }}
      onClose={close}
      title={desc.label}
      mark={<span className="font-mono text-[9px] text-[var(--text-muted)]">motion</span>}
    >
      <div className="grid gap-3">
        <Curve a={a} timings={motion.timings} />
        <Transport />

        <div className="grid gap-1.5 border-t border-[var(--border)] pt-2.5">
          <span className={rowLabel}>Interval</span>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">From</span>
            <NumberField
              value={a.from}
              step={step}
              min={desc.min}
              max={desc.max}
              suffix={desc.unit || undefined}
              onChange={(from) => edit({ from })}
            />
            <span className="flex-1" />
            <span className="text-[10.5px] text-[var(--text-secondary)]">To</span>
            <NumberField
              value={a.to}
              step={step}
              min={desc.min}
              max={desc.max}
              suffix={desc.unit || undefined}
              onChange={(to) => edit({ to })}
            />
          </div>
        </div>

        <div className="grid gap-1.5 border-t border-[var(--border)] pt-2.5">
          <span className={rowLabel}>Repeat</span>
          <div className={`${group} grid-cols-3`}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.hint}
                className={seg(s.mode === m.id)}
                onClick={() => edit({ mode: m.id, timing: null })}
              >
                <Icon icon={m.icon} size={12} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <span className={rowLabel}>Easing</span>
          <div className={`${group} grid-cols-2`}>
            {EASES.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.hint}
                className={seg(s.ease === e.id)}
                onClick={() => edit({ ease: e.id, timing: null })}
              >
                <Icon icon={e.icon} size={12} />
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5 border-t border-[var(--border)] pt-2.5">
          <span className={rowLabel}>Timing</span>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">Seconds across</span>
            <NumberField
              value={s.period}
              step={0.5}
              min={0.05}
              suffix="s"
              onChange={(period) => edit({ period, timing: null })}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">Wait first</span>
            <NumberField
              value={s.delay}
              step={0.5}
              min={0}
              suffix="s"
              onChange={(delay) => edit({ delay, timing: null })}
            />
          </label>
          {s.mode !== 'once' && (
            <p className="text-[9px] leading-[1.4] text-[var(--text-muted)]">
              {Math.round(s.period * (s.mode === 'bounce' ? 2 : 1) * 10) / 10}s for a full cycle,
              which is the length a clip has to fit.
            </p>
          )}
        </div>

        <label className="flex items-start gap-2 border-t border-[var(--border)] pt-2.5">
          <input
            type="checkbox"
            checked={a.hold}
            onChange={(e) => edit({ hold: e.target.checked })}
            className="mt-[1px] accent-[var(--text-primary)]"
          />
          <span className="text-[10px] leading-[1.35] text-[var(--text-secondary)]">
            Only on play
            <span className="block text-[9px] text-[var(--text-muted)]">
              Otherwise it moves as soon as it is set. Recording ignores this.
            </span>
          </span>
        </label>

        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-[10.5px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          onClick={() => {
            if (live) {
              removeAnimator(a.id);
              close();
            } else {
              putAnimator(a);
            }
          }}
        >
          {live ? 'Remove motion' : 'Animate this'}
        </button>
      </div>
    </FloatingPanel>
  );
}
