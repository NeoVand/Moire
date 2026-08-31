import { useEffect, useRef, useState } from 'react';
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
import { NumberField } from './ui/NumberField';

/**
 * What one knob does over time.
 *
 * The curve is the centre of it rather than decoration: mode, easing and period
 * are three abstractions whose combined effect is one shape, and the shape is
 * the thing being chosen. Drawn from the same `sampleAnimator` the transport
 * uses, so it cannot describe an animation the tool would not produce.
 *
 * A movable window rather than a popover pinned to the slider. The knob is often
 * under where the panel wants to be, and being able to put it somewhere and have
 * it stay there across knobs is worth more than the anchoring.
 */

/**
 * The five selectors are drawn rather than borrowed, and the reason is legibility
 * rather than taste: at thirteen pixels a stock "repeat" glyph is a rounded
 * rectangle and a stock "transfer" glyph is two arrows, and neither says what
 * the value will do. These say exactly what it will do, because they are the
 * shape it will make -- the same trick the curve above uses, at button size.
 */
const MODES: { id: MotionMode; label: string; hint: string; d: string }[] = [
  { id: 'bounce', label: 'Bounce', hint: 'There and back, forever.', d: 'M1 12 L5 4 L9 12 L13 4' },
  {
    id: 'loop',
    label: 'Loop',
    hint: 'To the end, jump back, again.',
    d: 'M1 12 L6 4 L6 12 L11 4 L11 12 L14 7',
  },
  { id: 'once', label: 'Once', hint: 'Cross once and stay there.', d: 'M1 12 L8 4 L14 4' },
];

const EASES: { id: MotionEase; label: string; hint: string; d: string }[] = [
  { id: 'inOut', label: 'Eased', hint: 'Slow at both ends.', d: 'M2 12 C6 12, 9 4, 13 4' },
  { id: 'linear', label: 'Linear', hint: 'Constant rate throughout.', d: 'M2 12 L13 4' },
];

/** One little curve, at button size. */
function Glyph({ d }: { d: string }) {
  return (
    <svg width="15" height="16" viewBox="0 0 15 16" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const seg = (active: boolean) =>
  `grid h-[22px] place-items-center rounded-[5px] transition-colors ${
    active
      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_22%,transparent)]'
      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
  }`;

/** A segmented control: one sunken group, one raised choice inside it. */
const group = 'grid gap-0.5 rounded-md bg-[var(--bg-primary)] p-0.5';

const W = 196;
const H = 54;

/** The animation as a shape, over two crossings, with a dot for where it is now. */
function Curve({ a, timings }: { a: Animator; timings: Timing[] }) {
  const dot = useRef<SVGCircleElement>(null);
  const s = scheduleOf(a, timings);
  const window = s.delay + s.period * (s.mode === 'once' ? 1.6 : s.mode === 'bounce' ? 2 : 2);
  const lo = Math.min(a.from, a.to);
  const hi = Math.max(a.from, a.to);
  const span = Math.max(1e-6, hi - lo);

  const x = (t: number) => 2 + (t / window) * (W - 4);
  const y = (v: number) => H - 8 - ((v - lo) / span) * (H - 16);

  let d = '';
  const N = 96;
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
      <line x1="2" y1={y(a.from)} x2={W - 2} y2={y(a.from)} className="stroke-[var(--track)]" strokeWidth="1" strokeDasharray="2 3" />
      <line x1="2" y1={y(a.to)} x2={W - 2} y2={y(a.to)} className="stroke-[var(--track)]" strokeWidth="1" strokeDasharray="2 3" />
      <path d={d} fill="none" className="stroke-[var(--text-primary)]" strokeWidth="1.5" strokeLinejoin="round" />
      <circle ref={dot} r="2.5" className="fill-[var(--text-primary)]" />
    </svg>
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

  const edit = (patch: Partial<Animator>) => {
    const next = { ...a, ...patch };
    if (live) putAnimator(next);
    else setDraft(next);
  };

  return (
    <FloatingPanel
      id="motion"
      width={228}
      defaultPosition={{ x: 248, y: 120 }}
      onClose={close}
      title={desc.label}
      mark={<span className="font-mono text-[9px] text-[var(--text-muted)]">motion</span>}
    >
      <div className="grid gap-2.5">
        <Curve a={a} timings={motion.timings} />

        <div className="flex items-center gap-2">
          <span className="text-[10.5px] text-[var(--text-secondary)]">From</span>
          <NumberField
            value={a.from}
            step={Math.max(desc.step, (desc.max - desc.min) / 200)}
            min={desc.min}
            max={desc.max}
            suffix={desc.unit || undefined}
            onChange={(from) => edit({ from })}
          />
          <span className="flex-1" />
          <span className="text-[10.5px] text-[var(--text-secondary)]">To</span>
          <NumberField
            value={a.to}
            step={Math.max(desc.step, (desc.max - desc.min) / 200)}
            min={desc.min}
            max={desc.max}
            suffix={desc.unit || undefined}
            onChange={(to) => edit({ to })}
          />
        </div>

        <div className="flex gap-1.5 border-t border-[var(--border)] pt-2.5">
          <div className={`${group} flex-[3] grid-cols-3`}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={`${m.label} — ${m.hint}`}
                aria-label={m.label}
                className={seg(s.mode === m.id)}
                onClick={() => edit({ mode: m.id, timing: null })}
              >
                <Glyph d={m.d} />
              </button>
            ))}
          </div>
          <div className={`${group} flex-[2] grid-cols-2`}>
            {EASES.map((e) => (
              <button
                key={e.id}
                type="button"
                title={`${e.label} — ${e.hint}`}
                aria-label={e.label}
                className={seg(s.ease === e.id)}
                onClick={() => edit({ ease: e.id, timing: null })}
              >
                <Glyph d={e.d} />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <label className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">
              Seconds across
              {s.mode !== 'once' && (
                <span className="ml-1 text-[9px] text-[var(--text-muted)]">
                  {Math.round(s.period * (s.mode === 'bounce' ? 2 : 1) * 10) / 10}s a cycle
                </span>
              )}
            </span>
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
