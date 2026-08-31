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
 * Whether a `once` animation has finished and let go of its knob.
 *
 * A crossing that has arrived has nothing left to say, and going on writing its
 * destination every frame would mean the knob could never be touched again: a
 * hand would move it and the next frame would move it back. So `once` releases,
 * which is what makes it a transition rather than a clamp. Seeking back before
 * the end takes it again, so a recording is unaffected.
 *
 * Loop and bounce never release. They have no end to arrive at.
 */
export function isSpent(a: Animator, timings: Timing[], t: number): boolean {
  const s = scheduleOf(a, timings);
  return s.mode === 'once' && t > s.delay + Math.max(1e-3, s.period);
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
    if (isSpent(a, motion.timings, t)) continue;
    out.set(a.path, sampleAnimator(a, motion.timings, t));
  }
  return out;
}

/** Greatest common divisor over the quantised cycle lengths. */
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export interface MotionSpan {
  /** Where a clip of this document should end, in seconds. */
  end: number;
  /** True when playing that range back to back has no visible join. */
  seamless: boolean;
  /** Nothing enabled moves, so any range would be one still picture repeated. */
  empty: boolean;
}

/**
 * How long this document has something to say.
 *
 * A range picked by hand is either short enough to cut the motion off or long
 * enough to spend most of the file on a picture that has stopped changing, and
 * the document already knows better than a guess: every animator states its own
 * schedule.
 *
 * For a `once` the answer is when it lands. For anything cyclic it is a common
 * multiple of the cycles -- which is the difference between a clip that loops
 * and a clip that jumps, because a range that cuts a cycle part way through will
 * always jump when it repeats. Two knobs at 3s and 4s need 12s to come back
 * together; asking for 6 would look wrong every time round and it would not be
 * obvious why.
 *
 * The common multiple is taken over hundredths of a second, and abandoned if it
 * runs past a minute: cycles that share no reasonable multiple get the longest
 * of them instead, which does not loop and is not pretending to.
 */
const QUANTUM = 100; // hundredths of a second
const LOOP_CAP = 60 * QUANTUM;

export function motionSpan(motion: MotionDoc): MotionSpan {
  const live = motion.animators.filter((a) => a.enabled);
  if (live.length === 0) return { end: 6, seamless: false, empty: true };

  let onceEnd = 0;
  let maxDelay = 0;
  let cycleLcm = 0;
  let longestCycle = 0;
  let anyCyclic = false;
  let allPrompt = true;

  for (const a of live) {
    const s = scheduleOf(a, motion.timings);
    maxDelay = Math.max(maxDelay, s.delay);
    if (s.delay > 1e-6) allPrompt = false;
    if (s.mode === 'once') {
      onceEnd = Math.max(onceEnd, s.delay + s.period);
      continue;
    }
    anyCyclic = true;
    const cycle = s.mode === 'bounce' ? s.period * 2 : s.period;
    longestCycle = Math.max(longestCycle, cycle);
    const ticks = Math.max(1, Math.round(cycle * QUANTUM));
    cycleLcm = cycleLcm === 0 ? ticks : (cycleLcm / gcd(cycleLcm, ticks)) * ticks;
    if (cycleLcm > LOOP_CAP) cycleLcm = -1;
    if (cycleLcm === -1) break;
  }

  if (!anyCyclic) return { end: Math.max(0.1, onceEnd), seamless: false, empty: false };

  const usable = cycleLcm > 0 && cycleLcm <= LOOP_CAP;
  const loop = usable ? cycleLcm / QUANTUM : longestCycle;
  return {
    end: Math.max(0.1, Math.max(onceEnd, maxDelay + loop)),
    // A join is invisible only when the cycles all close together and nothing
    // was still waiting to start.
    seamless: usable && allPrompt && onceEnd <= 1e-6,
    empty: false,
  };
}
