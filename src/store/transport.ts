import { create } from 'zustand';
import {
  isSpent,
  sampleAnimator,
  sampleMotion,
  scheduleOf,
  type Animator,
  type MotionDoc,
} from '../types/motion';
import { applyParams, type ParamPath } from './params';
import { useProjectStore } from './project';

/**
 * The clock, and the loop that pushes its readings into the document.
 *
 * There is one clock. Play advances it, pause holds it, stop returns it to zero,
 * and seek puts it anywhere. Every animator is a pure function of it, so all four
 * of those are the same operation with different arguments, and a take recorded
 * twice is the same take twice.
 *
 * Stopped and paused both hold a picture. There is no idle wall clock: the graph,
 * the canvas and an exported frame all refer to the same timestamp. Older scene
 * files may carry `hold`, but every enabled animator now waits for explicit play.
 *
 * Nothing here touches the renderer. The transport writes state and the renderer
 * draws state, exactly as when a hand moves a slider, which is what keeps the
 * paper's figures reproducible while this exists.
 */

export type TransportState = 'stopped' | 'playing' | 'paused';
export interface PreviewRange { start: number; end: number; loop: boolean }

export interface TransportStore {
  state: TransportState;
  /** Seconds on the transport clock. */
  t: number;
  /** A bounded capture preview; ordinary playback has no range. */
  range: PreviewRange | null;
  /** True while frames are being captured: the recorder owns the clock. */
  recording: boolean;
  /** Animator ids silenced by hand, and the one soloed, if any. Session only. */
  muted: string[];
  solo: string | null;
  /**
   * A slider is under the pointer. Motion yields for the duration, so an animated
   * knob can be grabbed and felt; on release the animation takes it back, because
   * an animated knob's value belongs to its animation and the way to change it is
   * to change the interval. Without this a hand and the clock fight over the same
   * number sixty times a second and the hand always loses.
   */
  interacting: boolean;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  previewRange: (start: number, end: number, loop: boolean, resume?: boolean) => void;
  setRecording: (recording: boolean) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  setInteracting: (interacting: boolean) => void;
}

export const useTransportStore = create<TransportStore>((set, get) => ({
  state: 'stopped',
  t: 0,
  range: null,
  recording: false,
  muted: [],
  solo: null,
  interacting: false,

  play: () => {
    if (get().recording) return;
    const end = playbackEnd();
    if (end === undefined) {
      set({ state: get().state === 'stopped' ? 'stopped' : 'paused', range: null });
      return;
    }
    const t = end !== null && get().t >= end ? 0 : get().t;
    set({ state: 'playing', range: null, t });
    applyMotionAt(t);
  },
  pause: () => set((s) => (s.state === 'playing' ? { state: 'paused' } : s)),
  stop: () => {
    if (get().recording) return;
    set({ state: 'stopped', t: 0, range: null });
    applyMotionAt(0);
  },
  seek: (t) => {
    if (get().recording) return;
    const time = Number.isFinite(t) ? Math.max(0, t) : 0;
    set({ t: time, state: get().state === 'playing' ? 'playing' : 'paused', range: null });
    applyMotionAt(time);
  },
  previewRange: (start, end, loop, resume = false) => {
    if (get().recording || !Number.isFinite(start) || !Number.isFinite(end) || end <= Math.max(0, start)) return;
    const range = { start: Math.max(0, start), end, loop };
    const t = resume && get().t >= range.start && get().t < range.end ? get().t : range.start;
    set({ t, state: 'playing', range });
    applyMotionAt(t);
  },
  setRecording: (recording) => set({ recording }),
  setInteracting: (interacting) => set({ interacting }),

  toggleMute: (id) =>
    set((s) => ({
      muted: s.muted.includes(id) ? s.muted.filter((m) => m !== id) : [...s.muted, id],
    })),

  // Solo is the control that gets used constantly while composing a shot: one
  // motion at a time, everything else out of the way. Clicking the soloed one
  // again lets the rest back in.
  toggleSolo: (id) => set((s) => ({ solo: s.solo === id ? null : id })),
}));

/** Whether this animator should be heard, given the mute and solo state. */
function silenced(a: Animator, muted: readonly string[], solo: string | null): boolean {
  if (solo) return a.id !== solo;
  return muted.includes(a.id);
}

/** Undefined is a still, null is endless, otherwise every live track lands here. */
function playbackEnd(): number | null | undefined {
  const { motion } = useProjectStore.getState();
  const { muted, solo } = useTransportStore.getState();
  const active = motion.animators.filter((a) => a.enabled && a.from !== a.to && !silenced(a, muted, solo));
  if (active.length === 0) return undefined;
  let end = 0;
  for (const a of active) {
    const s = scheduleOf(a, motion.timings);
    if (s.mode !== 'once') return null;
    end = Math.max(end, Math.max(0, s.delay) + Math.max(1e-3, s.period));
  }
  return end;
}

/**
 * Marks the writes this module makes, so the store subscription below can tell a
 * knob the clock moved from a knob a hand moved.
 */
let applying = false;

export function isApplyingMotion(): boolean {
  return applying;
}

/** Every knob's value at `t`, as the transport would set them. */
type SamplingOptions = {
  includeHeld?: boolean;
  releaseFinished?: boolean;
  /** A recorder can freeze the authoring and audition state for an entire take. */
  motion?: MotionDoc;
  muted?: readonly string[];
  solo?: string | null;
};

export function motionAt(t: number, opts: SamplingOptions = {}): Map<ParamPath, number> {
  const motion = opts.motion ?? useProjectStore.getState().motion;
  const transport = useTransportStore.getState();
  const muted = opts.muted ?? transport.muted;
  const solo = opts.solo === undefined ? transport.solo : opts.solo;
  return sampleMotion(motion, t, {
    includeHeld: opts.includeHeld,
    releaseFinished: opts.releaseFinished,
    skip: (a) => silenced(a, muted, solo),
  });
}

/** Put the document where it would be at `t`. Used by seeking and by capture. */
export function applyMotionAt(t: number, opts: SamplingOptions = {}): void {
  applying = true;
  try {
    applyParams(motionAt(t, opts));
  } finally {
    applying = false;
  }
}

let raf = 0;
let lastFrame: number | null = null;

/**
 * The exact-end write a `once` animation owes the document. `isSpent` releases
 * the knob strictly after the end, so the last live tick lands wherever the
 * frame clock happened to fall — a hair short of the destination — and that
 * near-miss would otherwise stay in the document forever, be autosaved, and
 * ride into exports (a rotation of 49.9999 where the author animated to 50).
 * So the tick that crosses an animator into spent writes its terminal value
 * once, exactly. Seeking stays pure: this lives only in the live loop.
 */
function settleFinished(prev: number, now: number): void {
  const { motion } = useProjectStore.getState();
  const { muted, solo } = useTransportStore.getState();
  const out = new Map<ParamPath, number>();
  for (const a of motion.animators) {
    if (!a.enabled) continue;
    if (silenced(a, muted, solo)) continue;
    if (!isSpent(a, motion.timings, now) || isSpent(a, motion.timings, prev)) continue;
    const s = scheduleOf(a, motion.timings);
    out.set(a.path, sampleAnimator(a, motion.timings, Math.max(0, s.delay) + Math.max(1e-3, s.period)));
  }
  if (out.size === 0) return;
  applying = true;
  try {
    applyParams(out);
  } finally {
    applying = false;
  }
}

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  // Expensive full-quality frames may arrive less than four times a second.
  // Keep authored durations in wall-clock seconds instead of slowing the clock
  // whenever rendering exceeds a fixed frame budget.
  const dt = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000);
  lastFrame = now;
  const transport = useTransportStore.getState();

  // A hand on a knob wins for as long as it is there. Recording never yields:
  // nothing should be touching the controls then, and a stray event must not
  // put a gap in a take.
  if (transport.interacting && !transport.recording) return;

  if (transport.state === 'playing' && !transport.recording) {
    let t = transport.t + dt;
    if (transport.range) {
      const { start, end, loop } = transport.range;
      if (t >= end) {
        t = loop ? start + ((t - start) % (end - start)) : end;
        useTransportStore.setState({ t, state: loop ? 'playing' : 'paused' });
      } else {
        useTransportStore.setState({ t });
      }
      applyMotionAt(t);
    } else {
      const end = playbackEnd();
      if (end === undefined) {
        useTransportStore.setState({ state: 'paused' });
        return;
      }
      if (end !== null && t >= end) {
        useTransportStore.setState({ t: end, state: 'paused' });
        applyMotionAt(end);
        return;
      }
      useTransportStore.setState({ t });
      applyMotionAt(t, { releaseFinished: true });
      settleFinished(transport.t, t);
    }
  }
}

export function startTransport(): void {
  if (raf) return;
  lastFrame = null;
  raf = requestAnimationFrame(tick);
}

export function stopTransport(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/**
 * A hand on a slider wins. Six scattered abort calls used to do this for the
 * opening animation alone; one rule does it for everything that moves, and it
 * means nothing ever fights the author for a value.
 *
 * Not while recording: there the parameter panels are disabled anyway, and a
 * stray event must not be able to end a take half way through.
 */
useProjectStore.subscribe((scene, previous) => {
  if (applying) return;
  if (scene.documentRevision !== previous.documentRevision) {
    useTransportStore.setState({ state: 'stopped', t: 0, range: null, muted: [], solo: null, interacting: false });
    return;
  }
  // Selecting a different layer changes the editor, not the composition.
  if (
    scene.layers === previous.layers && scene.camera === previous.camera &&
    scene.view === previous.view && scene.motion === previous.motion &&
    scene.backgroundColor === previous.backgroundColor
  ) return;
  const { state, recording } = useTransportStore.getState();
  if (state === 'playing' && !recording) useTransportStore.setState({ state: 'paused' });
});
