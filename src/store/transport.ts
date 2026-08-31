import { create } from 'zustand';
import { sampleMotion, type Animator } from '../types/motion';
import { applyParams, type ParamPath } from './params';
import { easeInOutCubic, mixLayer, useProjectStore } from './project';
import type { PatternLayer } from '../types/moire';

/**
 * The clock, and the loop that pushes its readings into the document.
 *
 * There is one clock. Play advances it, pause holds it, stop returns it to zero,
 * and seek puts it anywhere. Every animator is a pure function of it, so all four
 * of those are the same operation with different arguments, and a take recorded
 * twice is the same take twice.
 *
 * The one place a second time base exists is idle preview: with the transport
 * stopped, an animator that is not marked `hold` runs off wall time, so setting
 * one up shows motion straight away instead of requiring a trip to the transport.
 * Preview never reaches a recording — the moment anything is being captured the
 * transport clock is the only clock, and `hold` is ignored — so the convenience
 * cannot leak into the output.
 *
 * Nothing here touches the renderer. The transport writes state and the renderer
 * draws state, exactly as when a hand moves a slider, which is what keeps the
 * paper's figures reproducible while this exists.
 */

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface TransportStore {
  state: TransportState;
  /** Seconds on the transport clock. */
  t: number;
  /** True while frames are being captured: preview rules are suspended. */
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
  setRecording: (recording: boolean) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  setInteracting: (interacting: boolean) => void;
}

export const useTransportStore = create<TransportStore>((set) => ({
  state: 'stopped',
  t: 0,
  recording: false,
  muted: [],
  solo: null,
  interacting: false,

  play: () => set({ state: 'playing' }),
  pause: () => set((s) => (s.state === 'playing' ? { state: 'paused' } : s)),
  stop: () => set({ state: 'stopped', t: 0 }),
  seek: (t) => set({ t: Math.max(0, t) }),
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
function silenced(a: Animator, muted: string[], solo: string | null): boolean {
  if (solo) return a.id !== solo;
  return muted.includes(a.id);
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
export function motionAt(t: number, opts: { includeHeld?: boolean } = {}): Map<ParamPath, number> {
  const { motion } = useProjectStore.getState();
  const { muted, solo } = useTransportStore.getState();
  return sampleMotion(motion, t, {
    includeHeld: opts.includeHeld,
    skip: (a) => silenced(a, muted, solo),
  });
}

/** Put the document where it would be at `t`. Used by seeking and by capture. */
export function applyMotionAt(t: number, opts: { includeHeld?: boolean } = {}): void {
  applying = true;
  try {
    applyParams(motionAt(t, opts));
  } finally {
    applying = false;
  }
}

/**
 * The opening transition: the whole stack eased from one pose to another, once,
 * at load.
 *
 * Deliberately *not* document motion, and the attempt to make it so is what
 * settled the question. An animator owns its path's value -- that is the rule
 * that lets a hand grab an animated knob and lets a document be saved at rest --
 * so an intro built from animators would leave every field of every layer owned
 * by one forever after, unable to be edited and saved back to the pose the
 * animation departs from. The intro is a transition *into* a document, not a
 * property of one.
 *
 * What it does share is the clock, the yield-to-a-hand rule, and the writes-state
 * -only discipline. It has no rAF of its own, no abort flag, and no six scattered
 * calls to cancel it: touching anything ends it, through the same subscription
 * that pauses the transport.
 */
let intro: {
  from: PatternLayer[];
  to: PatternLayer[];
  start: number;
  delay: number;
  span: number;
} | null = null;

export function playIntro(
  from: PatternLayer[],
  to: PatternLayer[],
  delay = 0.28,
  span = 1.7
): void {
  intro = { from, to, start: preview, delay, span };
}

export function endIntro(): void {
  intro = null;
}

let raf = 0;
let lastFrame = 0;
/** Wall time for idle preview, in seconds since the loop started. */
let preview = 0;

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = lastFrame ? Math.min(0.25, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  preview += dt;

  const transport = useTransportStore.getState();

  if (intro) {
    const u = Math.min(1, Math.max(0, (preview - intro.start - intro.delay) / intro.span));
    const e = easeInOutCubic(u);
    const { from, to } = intro;
    applying = true;
    try {
      useProjectStore.setState({
        layers: from.map((layer, i) => mixLayer(layer, to[i] ?? layer, e)),
      });
    } finally {
      applying = false;
    }
    if (u >= 1) intro = null;
    return;
  }

  const { motion } = useProjectStore.getState();
  if (motion.animators.length === 0) return;
  // A hand on a knob wins for as long as it is there. Recording never yields:
  // nothing should be touching the controls then, and a stray event must not
  // put a gap in a take.
  if (transport.interacting && !transport.recording) return;

  if (transport.state === 'playing') {
    const t = transport.t + dt;
    useTransportStore.setState({ t });
    // While recording, held animators run too: `hold` is about what noodles
    // while the tool is idle, and a take must not depend on that.
    applyMotionAt(t, { includeHeld: transport.recording });
    return;
  }

  if (transport.state === 'stopped' && !transport.recording) {
    // Idle preview. Held animators sit still, which is what `hold` is for.
    applyMotionAt(preview);
  }
}

export function startTransport(): void {
  if (raf) return;
  lastFrame = 0;
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
useProjectStore.subscribe(() => {
  if (applying) return;
  intro = null;
  const { state, recording } = useTransportStore.getState();
  if (state === 'playing' && !recording) useTransportStore.setState({ state: 'paused' });
});
