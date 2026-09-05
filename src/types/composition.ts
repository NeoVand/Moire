import { createTiming, scheduleOf, type MotionDoc } from './motion';

export interface LoopIssue {
  id: string;
  reason: string;
}

/** Check a complete range, not just equal values at its two ends. */
export function loopIssues(
  motion: MotionDoc,
  start: number,
  end: number,
  periodOf?: (path: string) => number | undefined
): LoopIssue[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const duration = end - start;
  const issues: LoopIssue[] = [];
  for (const a of motion.animators) {
    if (!a.enabled || a.from === a.to) continue;
    const s = scheduleOf(a, motion.timings);
    const delay = Math.max(0, s.delay);
    const period = Math.max(0.001, s.period);
    if (end <= delay) continue; // This track is constant throughout this range.
    let reason: string | null = null;
    if (s.mode === 'once') {
      if (start < delay + period) reason = 'A one-time transition does not return to its start.';
    } else if (start < delay) {
      reason = 'The initial delay is part of this range.';
    } else {
      const wrap = periodOf?.(a.path);
      const turns = wrap ? (a.to - a.from) / wrap : 0;
      if (s.mode === 'loop' && (!wrap || Math.abs(turns - Math.round(turns)) > 1e-7 || Math.round(turns) === 0)) {
        reason = 'Repeat jumps from its end value to its start value.';
      }
      const cycle = period * (s.mode === 'bounce' ? 2 : 1);
      const repeats = duration / cycle;
      if (!reason && Math.abs(repeats - Math.round(repeats)) > 1e-7) {
        reason = `${cycle.toFixed(2)}s cycle does not fit this range a whole number of times.`;
      }
    }
    if (reason) issues.push({ id: a.id, reason });
  }
  return issues;
}

/** Explicit authoring action: retain each range and phase, share one return cycle. */
export function composeLoop(motion: MotionDoc, ids: readonly string[], start: number, duration: number): MotionDoc {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 0.002 || ids.length === 0) return motion;
  const chosen = new Set(ids);
  const timing = createTiming({ name: 'Loop together', delay: start, period: duration / 2, mode: 'bounce', ease: 'inOut' });
  return {
    ...motion,
    timings: [...motion.timings, timing],
    animators: motion.animators.map((a) => chosen.has(a.id) ? { ...a, timing: timing.id } : a),
  };
}
