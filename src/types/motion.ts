/**
 * Motion: what a knob does over time.
 *
 * The one rule the rest of the system leans on is that an animator is a *pure
 * function of the clock*. Nothing accumulates — no `value += rate * dt` — because
 * an accumulator cannot be scrubbed, drifts out of phase against its neighbours,
 * and never records the same take twice. Everything else here follows from that:
 * seeking is free, two animators sharing a timing stay locked together forever,
 * and re-recording a clip produces the same frames.
 */

export type MotionMode = 'loop' | 'bounce' | 'once';
export type MotionEase = 'linear' | 'in' | 'out' | 'inOut';

/**
 * A shared schedule. Several animators can point at one, which is how a dozen
 * knobs move as a single gesture: the tool's opening animation is one of these
 * and a thin animator per field, and three sliders bouncing to one period is a
 * shot where three sliders bouncing to three hand-typed periods is a shot that
 * drifts the moment one is adjusted.
 */
export interface Timing {
  id: string;
  name: string;
  /** Seconds held at the start before anything moves. */
  delay: number;
  /** Seconds for one traversal from `from` to `to`. */
  period: number;
  mode: MotionMode;
  ease: MotionEase;
}

export interface Animator {
  id: string;
  /** Which knob, in the `params.ts` grammar. */
  path: string;
  from: number;
  to: number;
  /** A shared timing by id, or null to use this animator's own schedule below. */
  timing: string | null;
  delay: number;
  period: number;
  mode: MotionMode;
  ease: MotionEase;
  /** Offset into the cycle at t = 0, in turns. Two knobs a quarter apart. */
  phase: number;
  /**
   * Hold at the start value until the transport is running, rather than moving
   * on its own while the tool sits idle. An authoring convenience only: a
   * recording ignores it, so a take never depends on which knobs were noodling.
   */
  hold: boolean;
  enabled: boolean;
}

export interface MotionDoc {
  timings: Timing[];
  animators: Animator[];
  /** Start the transport when this document is opened. */
  playOnLoad: boolean;
}

export const MOTION_NONE: MotionDoc = { timings: [], animators: [], playOnLoad: false };

export const TIMING_DEFAULTS: Omit<Timing, 'id' | 'name'> = {
  delay: 0,
  period: 6,
  mode: 'bounce',
  ease: 'inOut',
};

export function createTiming(partial: Partial<Timing> = {}): Timing {
  return {
    id: partial.id || `t-${Math.random().toString(36).slice(2, 9)}`,
    name: partial.name || 'Timing',
    ...TIMING_DEFAULTS,
    ...partial,
  };
}

export function createAnimator(path: string, partial: Partial<Animator> = {}): Animator {
  return {
    id: partial.id || `a-${Math.random().toString(36).slice(2, 9)}`,
    path,
    from: 0,
    to: 1,
    timing: null,
    ...TIMING_DEFAULTS,
    phase: 0,
    hold: false,
    enabled: true,
    ...partial,
  };
}

/** The schedule an animator actually runs on: its own, or the one it points at. */
export function scheduleOf(
  a: Animator,
  timings: Timing[]
): Pick<Timing, 'delay' | 'period' | 'mode' | 'ease'> {
  if (!a.timing) return a;
  return timings.find((t) => t.id === a.timing) ?? a;
}

const frac = (v: number) => v - Math.floor(v);
/** 0 → 1 → 0 across the unit interval: the there-and-back of a bounce. */
const triangle = (v: number) => (v < 0.5 ? v * 2 : 2 - v * 2);
/**
 * Cubic, all four of them. Cubic rather than quadratic because it is the shape
 * every other tool means by "eased", so a motion authored here reads the way it
 * would anywhere else.
 */
const EASE: Record<MotionEase, (v: number) => number> = {
  linear: (v) => v,
  in: (v) => v * v * v,
  out: (v) => 1 - (1 - v) ** 3,
  inOut: (v) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2),
};

/**
 * Where this animator's knob should be at time `t`. Pure, total, and defined for
 * negative t — before the delay elapses the knob sits at its starting value,
 * which is what makes `delay` a hold rather than a jump.
 */
export function sampleAnimator(a: Animator, timings: Timing[], t: number): number {
  const s = scheduleOf(a, timings);
  const period = Math.max(1e-3, s.period);
  const elapsed = Math.max(0, t - s.delay);

  let u: number;
  if (s.mode === 'once') {
    u = Math.min(1, elapsed / period);
  } else if (s.mode === 'bounce') {
    // A bounce covers the interval twice per cycle, so its cycle is two periods.
    // Period always means the same thing -- the time to cross from one end to the
    // other -- which is what lets the mode be changed without changing the speed.
    u = triangle(frac(elapsed / (period * 2) + a.phase));
  } else {
    u = frac(elapsed / period + a.phase);
  }

  const eased = (EASE[s.ease] ?? EASE.linear)(u);
  return a.from + eased * (a.to - a.from);
}

/**
 * Every knob's value at time `t`, as a plain map. Later animators on the same
 * path win, which is arbitrary but has to be something; the editor is what stops
 * two animators sharing a path in the first place.
 */
export function sampleMotion(
  motion: MotionDoc,
  t: number,
  opts: { includeHeld?: boolean; skip?: (a: Animator) => boolean } = {}
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of motion.animators) {
    if (!a.enabled) continue;
    if (!opts.includeHeld && a.hold) continue;
    if (opts.skip?.(a)) continue;
    out.set(a.path, sampleAnimator(a, motion.timings, t));
  }
  return out;
}
