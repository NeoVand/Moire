import { capturePng, captureSettle, captureSize } from './capture';
import { applyMotionAt, useTransportStore } from '../store/transport';

/**
 * Frame-by-frame capture, on a clock of its own making.
 *
 * The studio draws on requestAnimationFrame, which is the right thing for
 * something being watched and the wrong thing for something being recorded: it
 * runs at whatever rate the machine manages, stops altogether in a background
 * tab, and hands you whatever moment it happened to reach. So a recording does
 * not watch the studio at all. It asks for frame *n* at exactly `t0 + n/fps`,
 * puts the document there, renders once, and waits for the pixels — however long
 * that takes. Output is exact 60 fps even when the render is nowhere near it.
 *
 * That is also what makes a take reproducible: every frame is a pure function of
 * its own timestamp, so the same range recorded twice is the same file twice.
 *
 * `renderer.snapshot()` is what makes this possible. It cancels any pending
 * animation frame, renders the current state synchronously at an explicit size,
 * and encodes -- so the frame that comes back is the frame that was asked for
 * rather than the last one the browser felt like drawing.
 */

export interface RecordOptions {
  /** First and last moment on the transport clock, in seconds. */
  t0: number;
  t1: number;
  fps: number;
  /** Resolution multiplier over the canvas, as the still export uses. */
  scale?: number;
  /** Target aspect, or 0 for the canvas's own. */
  aspect?: number;
}

export interface RecordSink {
  /** Called once per frame, in order. */
  frame: (index: number, blob: Blob) => Promise<void>;
  /** Called after the last frame, successful or not. */
  close?: () => Promise<void>;
}

export interface RecordProgress {
  frame: number;
  frames: number;
  /** Seconds of wall time elapsed, for an honest estimate of what is left. */
  elapsed: number;
}

export function frameCount(opts: RecordOptions): number {
  return Math.max(1, Math.round((opts.t1 - opts.t0) * opts.fps));
}

/** Five digits: an hour at sixty frames a second still sorts correctly. */
export function frameName(index: number): string {
  return `frame_${String(index).padStart(5, '0')}.png`;
}

export async function recordFrames(
  opts: RecordOptions,
  sink: RecordSink,
  onProgress?: (p: RecordProgress) => void,
  signal?: AbortSignal
): Promise<{ frames: number; cancelled: boolean }> {
  const frames = frameCount(opts);
  const transport = useTransportStore.getState();
  const restore = { state: transport.state, t: transport.t };
  const started = performance.now();
  let written = 0;
  let cancelled = false;

  // Recording suspends every rule that exists for the sake of someone watching:
  // held animators run, a hand on a knob no longer yields, and the transport
  // stops advancing on its own because the recorder is the clock now.
  useTransportStore.setState({ recording: true, state: 'paused' });
  await captureSettle();

  try {
    for (let n = 0; n < frames; n++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      const t = opts.t0 + n / opts.fps;
      useTransportStore.setState({ t });
      applyMotionAt(t, { includeHeld: true });
      const blob = await capturePng({ scale: opts.scale, aspect: opts.aspect });
      await sink.frame(n, blob);
      written = n + 1;
      onProgress?.({ frame: written, frames, elapsed: (performance.now() - started) / 1000 });
    }
  } finally {
    await sink.close?.();
    useTransportStore.setState({ recording: false, ...restore });
    applyMotionAt(restore.t, { includeHeld: false });
  }

  return { frames: written, cancelled };
}

/** The pixel size a recording would have, for showing before starting one. */
export function recordSize(opts: { scale?: number; aspect?: number }) {
  return captureSize(opts);
}

// ---------------------------------------------------------------- sinks

interface DirectoryHandle {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

export function directoryPickerAvailable(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<DirectoryHandle | null> {
  const pick = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
    .showDirectoryPicker;
  if (!pick) return null;
  try {
    return await pick();
  } catch {
    // The picker was dismissed, which is not an error worth reporting.
    return null;
  }
}

/**
 * Straight to disk, one file at a time.
 *
 * Nine hundred frames at 4K is gigabytes; it cannot be held in memory and it
 * cannot be handed over as a download, so a zip is not an option either. A
 * directory handle streams at constant cost regardless of how long the take is.
 */
export function directorySink(dir: DirectoryHandle): RecordSink {
  return {
    async frame(index, blob) {
      const file = await dir.getFileHandle(frameName(index), { create: true });
      const stream = await file.createWritable();
      await stream.write(blob);
      await stream.close();
    },
  };
}
