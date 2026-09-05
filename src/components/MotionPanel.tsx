import { useEffect, useRef, useState } from 'react';
import {
  ArrowHorizontalIcon,
  ArrowReloadHorizontalIcon,
  ArrowRightToLineIcon,
  EaseInIcon,
  EaseInOutIcon,
  EaseOutIcon,
  Delete02Icon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  SlashIcon,
  StopIcon,
} from '@hugeicons/core-free-icons';
import {
  createAnimator,
  createTiming,
  detachTiming,
  sampleAnimator,
  scheduleOf,
  type Animator,
  type MotionEase,
  type MotionMode,
  type Timing,
} from '../types/motion';
import { useEditorStore } from '../store/editor';
import { useParamDescriptor, readParam } from '../store/params';
import { displayValue, storedValue, suggestedInterval } from '../store/paramMetadata';
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
    label: 'Repeat',
    hint: 'Go to the end, then jump back to the start. This can make a visible cut.',
    icon: ArrowReloadHorizontalIcon,
  },
  { id: 'once', label: 'Once', hint: 'Cross once and stay.', icon: ArrowRightToLineIcon },
];

const EASES: { id: MotionEase; label: string; hint: string; icon: HugeIcon }[] = [
  { id: 'linear', label: 'Linear', hint: 'Constant rate throughout.', icon: SlashIcon },
  { id: 'in', label: 'In', hint: 'Starts slowly, arrives at speed.', icon: EaseInIcon },
  { id: 'out', label: 'Out', hint: 'Leaves at speed, settles slowly.', icon: EaseOutIcon },
  { id: 'inOut', label: 'Both', hint: 'Slow at both ends.', icon: EaseInOutIcon },
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
function Curve({ a, timings, active }: { a: Animator; timings: Timing[]; active: boolean }) {
  const dot = useRef<SVGCircleElement>(null);
  const s = scheduleOf(a, timings);
  const cycle = s.period * (s.mode === 'bounce' ? 2 : 1);
  const window = s.delay + (s.mode === 'once' ? s.period * 1.6 : cycle * 2);
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
      const { t } = useTransportStore.getState();
      const wrapped = s.mode === 'once' ? Math.min(t, window)
        : t <= s.delay ? t : s.delay + ((t - s.delay) % (cycle * 2));
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
      {active && <circle ref={dot} r="2.5" className="fill-[var(--text-primary)]" />}
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
      <span title={state} className="ml-1 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
        {t.toFixed(1)}s
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
  const putTiming = useProjectStore((s) => s.putTiming);

  const existing = path ? motion.animators.find((a) => a.path === path) : undefined;
  const desc = useParamDescriptor(path);
  const recording = useTransportStore((s) => s.recording);
  const muted = useTransportStore((s) => s.muted);
  const solo = useTransportStore((s) => s.solo);
  const [draft, setDraft] = useState<Animator | null>(null);
  const ownerName = useProjectStore((state) => {
    if (!path) return '';
    const [owner, id] = path.split('.');
    return owner === 'layer' ? state.layers.find((layer) => layer.id === id)?.name ?? ''
      : owner === 'camera' ? 'Camera' : 'View';
  });

  // Start from the current pose with a modest change. Opening this editor never
  // changes the scene; the explicit Add and play action starts the proposal.
  useEffect(() => {
    if (!path || existing || !desc) {
      setDraft(null);
      return;
    }
    const now = readParam(path) ?? (desc.min + desc.max) / 2;
    setDraft(createAnimator(path, suggestedInterval(now, desc)));
  }, [path, existing, desc]);

  if (!path || !desc) return null;
  const a = existing ?? draft;
  if (!a) return null;
  const live = !!existing;
  const s = scheduleOf(a, motion.timings);
  const step = desc.step;
  const fromShown = displayValue(a.from, desc);
  const toShown = displayValue(a.to, desc);
  // Imported intervals may deliberately extend past a slider's normal range.
  const min = Math.min(desc.min, fromShown, toShown);
  const max = Math.max(desc.max, fromShown, toShown);
  const sharedTiming = motion.timings.find((timing) => timing.id === a.timing);
  const groupSize = (id: string) => motion.animators.filter((item) => item.timing === id).length + (!live && a.timing === id ? 1 : 0);
  const active = live && a.enabled && (solo ? solo === a.id : !muted.includes(a.id));

  const edit = (patch: Partial<Animator>) => {
    if (recording) return;
    const base = patch.timing === null ? detachTiming(a, motion.timings) : a;
    const next = { ...base, ...patch };
    if (live) putAnimator(next);
    else setDraft(next);
  };

  const editSchedule = (patch: Partial<Timing>) => {
    if (recording) return;
    if (sharedTiming) putTiming({ ...sharedTiming, ...patch });
    else edit(patch);
  };

  const motionName = (other: Animator) => {
    const [owner, id] = other.path.split('.');
    const layer = useProjectStore.getState().layers.find((item) => item.id === id);
    const label = other.path.split('.').slice(owner === 'layer' ? 2 : 1).join(' ');
    return `${owner === 'layer' ? layer?.name ?? 'Layer' : owner} · ${label}`;
  };

  const chooseTiming = (choice: string) => {
    if (recording) return;
    if (choice === 'own') {
      edit(detachTiming(a, motion.timings));
      return;
    }
    if (choice.startsWith('shared:')) {
      const timing = motion.timings.find((item) => item.id === choice.slice(7));
      if (timing) edit({ delay: timing.delay, period: timing.period, mode: timing.mode, ease: timing.ease, timing: timing.id });
      return;
    }
    const other = motion.animators.find((item) => item.id === choice.slice(6));
    if (!other) return;
    // Make linking two independent motions a single recoverable edit.
    const transport = useTransportStore.getState();
    const wasInteracting = transport.interacting;
    transport.setInteracting(true);
    try {
      const source = scheduleOf(other, motion.timings);
      const timing = createTiming({ name: motionName(other), delay: source.delay, period: source.period, mode: source.mode, ease: source.ease });
      putTiming(timing);
      putAnimator({ ...other, timing: timing.id });
      edit({ delay: timing.delay, period: timing.period, mode: timing.mode, ease: timing.ease, timing: timing.id });
    } finally {
      transport.setInteracting(wasInteracting);
    }
  };

  return (
    <FloatingPanel
      id="motion"
      width={276}
      defaultPosition={{ x: 268, y: 120 }}
      onClose={close}
      title={<span title={ownerName}>{desc.label}</span>}
      mark={<span className="font-mono text-[9px] text-[var(--text-muted)]">motion</span>}
    >
      <fieldset disabled={recording} className="grid max-h-[calc(100dvh-110px)] min-w-0 gap-3 overflow-y-auto overscroll-contain disabled:opacity-60">
        <Curve a={a} timings={motion.timings} active={active} />
        <div className="grid gap-1.5 border-t border-[var(--border)] pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={rowLabel}>Interval</span>
            {live && (
              <label className="flex items-center gap-1.5 text-[9px] text-[var(--text-muted)]" title="Include this motion in playback and export">
                <input type="checkbox" checked={a.enabled}
                  onChange={(e) => edit({ enabled: e.target.checked })}
                  className="accent-[var(--text-primary)]" />
                Enabled
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">From</span>
            <NumberField
              label="Motion from"
              value={fromShown}
              step={step}
              min={desc.period ? undefined : min}
              max={desc.period ? undefined : max}
              suffix={desc.unit || undefined}
              onChange={(from) => edit({ from: storedValue(from, desc) })}
            />
            <span className="flex-1" />
            <span className="text-[10.5px] text-[var(--text-secondary)]">To</span>
            <NumberField
              label="Motion to"
              value={toShown}
              step={step}
              min={desc.period ? undefined : min}
              max={desc.period ? undefined : max}
              suffix={desc.unit || undefined}
              onChange={(to) => edit({ to: storedValue(to, desc) })}
            />
          </div>
        </div>

        <div className="grid gap-1.5 border-t border-[var(--border)] pt-2.5">
          <span className={rowLabel}>Playback</span>
          <div className={`${group} grid-cols-3`}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.id === 'loop' && desc.period
                  ? `Repeat from the start. A change of ${displayValue(desc.period, desc)}${desc.unit ?? ''} makes one full turn.`
                  : m.hint}
                className={seg(s.mode === m.id)}
                onClick={() => editSchedule({ mode: m.id })}
              >
                <Icon icon={m.icon} size={12} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <span className={rowLabel}>Easing</span>
          <div className={`${group} grid-cols-4`}>
            {EASES.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.hint}
                className={seg(s.ease === e.id)}
                onClick={() => editSchedule({ ease: e.id })}
              >
                <Icon icon={e.icon} size={12} />
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5 border-t border-[var(--border)] pt-2.5">
          <div className="flex items-center gap-2">
            <span className={rowLabel}>Timing</span>
            <select
              aria-label="Timing group"
              title={sharedTiming
                ? `${groupSize(sharedTiming.id)} motions share playback, easing and timing. Choose Own timing to separate this one.`
                : 'Use an independent schedule, or match another motion.'}
              value={sharedTiming ? `shared:${sharedTiming.id}` : 'own'}
              onChange={(e) => chooseTiming(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-1 text-[10px] text-[var(--text-secondary)]"
            >
              <option value="own">Own timing</option>
              {motion.timings.map((timing) => (
                <option key={timing.id} value={`shared:${timing.id}`}>{timing.name} · {groupSize(timing.id)}</option>
              ))}
              {motion.animators.filter((other) => other.id !== a.id && !other.timing).map((other) => (
                <option key={other.id} value={`match:${other.id}`}>Match {motionName(other)}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center justify-between gap-2" title="Time for one crossing. Bounce takes the same time to return.">
            <span className="text-[10.5px] text-[var(--text-secondary)]">Across</span>
            <span className="flex-1" />
            {s.mode === 'bounce' && <span className="text-[9px] tabular-nums text-[var(--text-muted)]">
              {Math.round(s.period * 200) / 100}s cycle
            </span>}
            <NumberField
              label="One-way duration"
              value={s.period}
              step={0.5}
              min={0.05}
              suffix="s"
              onChange={(period) => editSchedule({ period })}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">Wait first</span>
            <NumberField
              label="Wait first"
              value={s.delay}
              step={0.5}
              min={0}
              suffix="s"
              onChange={(delay) => editSchedule({ delay })}
            />
          </label>
          {/* Waiting and starting part way round are different things, and only
              one of them is any use to a loop: a delay moves the whole cycle
              later, which for something endless is invisible after the first
              pass. An offset is what puts two knobs permanently out of step. */}
          {s.mode !== 'once' && (
              <label
                className="flex items-center justify-between gap-2"
                title="Where in its cycle this begins. Two knobs 25% apart stay a quarter-cycle out of step."
              >
                <span className="text-[10.5px] text-[var(--text-secondary)]">Start part way</span>
                <NumberField
                  label="Start part way"
                  value={Math.round((a.phase || 0) * 1000) / 10}
                  step={5}
                  min={0}
                  max={100}
                  decimals={0}
                  suffix="%"
                  onChange={(pct) => edit({ phase: (pct % 100) / 100 })}
                />
              </label>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2.5">
          <Transport />
          <span className="flex-1" />
          {live ? (
            <button
              type="button"
              title="Remove this motion"
              aria-label="Remove this motion"
              onClick={() => {
                if (recording) return;
                removeAnimator(a.id);
                close();
              }}
              className="grid size-7 place-items-center rounded-md text-[#c0392b] hover:bg-[color-mix(in_srgb,#c0392b_16%,transparent)]"
            >
              <Icon icon={Delete02Icon} size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (recording) return;
                putAnimator(a);
                useTransportStore.getState().seek(0);
                useTransportStore.getState().play();
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[10.5px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              Add and play
            </button>
          )}
        </div>
      </fieldset>
    </FloatingPanel>
  );
}
