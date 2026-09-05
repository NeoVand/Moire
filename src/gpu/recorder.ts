import { captureSettle, captureSize, captureWith } from './capture';
import { applyParams, readParam } from '../store/params';
import { useProjectStore } from '../store/project';
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
 * its own timestamp, so the same construction and range produce the same sampled frames.
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
  /** An exact frame height, for a recording that must land on a stated size. */
  height?: number;
}

/**
 * One captured frame, offered two ways.
 *
 * A sink writing files wants a PNG; a sink feeding an encoder wants the pixels.
 * Neither should pay for the other, so both are lazy: the canvas is the render
 * itself, and the PNG is only encoded if somebody asks for one.
 */
export interface CapturedFrame {
  canvas: () => Promise<HTMLCanvasElement>;
  png: () => Promise<Blob>;
}

export interface RecordSink {
  /** Called once per frame, in order. */
  frame: (index: number, frame: CapturedFrame) => Promise<void>;
  /**
   * Called once the run is over. `ok` is false if a frame threw or the take was
   * abandoned, which matters to a sink holding an encoder: finishing a file and
   * throwing one away are different operations, and asking a broken encoder to
   * finish reports its own failure instead of the one that caused it.
   */
  close?: (ok: boolean) => Promise<void>;
}

export interface RecordProgress {
  frame: number;
  frames: number;
  /** Seconds of wall time elapsed, for an honest estimate of what is left. */
  elapsed: number;
  stage?: 'preparing' | 'rendering' | 'finalizing';
}

export function recordingError(opts: RecordOptions): string | null {
  if (![opts.t0, opts.t1, opts.fps].every(Number.isFinite)) return 'Enter a valid range and frame rate.';
  if (opts.t0 < 0 || opts.t1 <= opts.t0) return 'The end must be later than the start.';
  if (opts.fps <= 0) return 'The frame rate must be greater than zero.';
  const count = Math.round((opts.t1 - opts.t0) * opts.fps);
  if (!Number.isSafeInteger(count) || count < 1) return 'The range must contain at least one frame.';
  if (opts.height !== undefined && (!Number.isFinite(opts.height) || opts.height <= 0)) return 'Enter a valid frame height.';
  if (opts.scale !== undefined && (!Number.isFinite(opts.scale) || opts.scale <= 0)) return 'Enter a valid resolution scale.';
  if (opts.aspect !== undefined && (!Number.isFinite(opts.aspect) || opts.aspect < 0)) return 'Enter a valid frame shape.';
  return null;
}

export function frameCount(opts: RecordOptions): number {
  return recordingError(opts) ? 0 : Math.round((opts.t1 - opts.t0) * opts.fps);
}

/** Six digits cover an hour at sixty frames a second. */
export function frameName(index: number): string {
  return `frame_${String(index).padStart(6, '0')}.png`;
}

export async function recordFrames(
  opts: RecordOptions,
  sink: RecordSink,
  onProgress?: (p: RecordProgress) => void,
  signal?: AbortSignal
): Promise<{ frames: number; cancelled: boolean }> {
  const error = recordingError(opts);
  if (error) throw new Error(error);
  const frames = frameCount(opts);
  const transport = useTransportStore.getState();
  if (transport.recording) throw new Error('A recording is already in progress.');
  // Freeze the viewport used to frame this take, even if the window is resized.
  const framing = captureSize() ?? undefined;
  const restore = { state: transport.state, t: transport.t };
  const motion = structuredClone(useProjectStore.getState().motion);
  const muted = [...transport.muted];
  const solo = transport.solo;
  // Where every animated knob stood before the take. Putting the clock back is
  // not enough to restore a manual pose after a completed transition. Preserve
  // the actual values, rather than resampling the animation over the user's pose.
  const held = new Map<string, number>();
  for (const a of motion.animators) {
    const v = readParam(a.path);
    if (v !== undefined) held.set(a.path, v);
  }
  const started = performance.now();
  let written = 0;
  let cancelled = false;
  let failed = false;
  let failure: unknown;

  // Recording suspends every rule that exists for the sake of someone watching:
  // held animators run, a hand on a knob no longer yields, and the transport
  // stops advancing on its own because the recorder is the clock now.
  useTransportStore.setState({ recording: true, state: 'paused' });
  try {
    onProgress?.({ frame: 0, frames, elapsed: 0, stage: 'preparing' });
    if (!signal?.aborted) await captureSettle();
    for (let n = 0; n < frames; n++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      const t = opts.t0 + n / opts.fps;
      useTransportStore.setState({ t });
      applyMotionAt(t, { includeHeld: true, motion, muted, solo });
      // The canvas is only valid inside this callback -- the renderer restores
      // its display size as soon as it returns -- so the sink does its work here
      // rather than being handed something that will change under it.
      await captureWith({ scale: opts.scale, aspect: opts.aspect, height: opts.height, framing }, async (canvas) => {
        await sink.frame(n, {
          canvas: async () => canvas,
          png: () =>
            new Promise<Blob>((res, rej) =>
              canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the frame.'))), 'image/png')
            ),
        });
      });
      written = n + 1;
      onProgress?.({ frame: written, frames, elapsed: (performance.now() - started) / 1000, stage: 'rendering' });
    }
  } catch (err) {
    failed = true;
    failure = err;
  } finally {
    cancelled ||= signal?.aborted ?? false;
    try {
      if (!failed && !cancelled) {
        try {
          onProgress?.({ frame: written, frames, elapsed: (performance.now() - started) / 1000, stage: 'finalizing' });
        } catch (error) {
          failed = true;
          failure = error;
        }
      }
      try {
        await sink.close?.(!failed && !cancelled);
      } catch (error) {
        // Keep the frame failure when closing a broken sink also fails.
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    } finally {
      try {
        // Restore while the recorder still owns the clock; a project write after
        // resuming Play would otherwise be mistaken for a hand edit and pause it.
        applyParams(held);
      } finally {
        useTransportStore.setState({ recording: false, ...restore });
      }
    }
  }

  cancelled ||= signal?.aborted ?? false;
  if (failed) throw failure;
  return { frames: written, cancelled };
}

/** The pixel size a recording would have, for showing before starting one. */
export function recordSize(opts: { scale?: number; aspect?: number; height?: number }) {
  return captureSize(opts);
}

// ---------------------------------------------------------------- sinks

type PermissionState = 'granted' | 'denied' | 'prompt';

interface DirectoryHandle {
  name?: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  }>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/**
 * Whether writing was actually refused, as opposed to failing for some other
 * reason. Only the browser knows, and it says so with this name.
 */
function isRefusal(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
}

export function directoryPickerAvailable(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

/**
 * A folder, opened for writing.
 *
 * The mode is the whole of it, and it is easy to miss: a picker called with no
 * options hands back a handle that can only be read, and the failure surfaces
 * much later from the first getFileHandle as "the request is not allowed by the
 * user agent" -- which sounds like the browser refusing the feature rather than
 * the page never having asked for the right thing.
 *
 * There is deliberately no queryPermission/requestPermission dance afterwards.
 * requestPermission needs transient user activation, and awaiting the picker
 * spends it, so the call returns "prompt" without ever showing a prompt and a
 * perfectly writable folder gets reported as refused. The picker has already put
 * the question to the author; asking again from outside a gesture can only lie.
 */
export async function pickDirectory(): Promise<DirectoryHandle | null> {
  const pick = (
    window as unknown as {
      showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!pick) return null;
  try {
    return await pick({ mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
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
  // A fresh take never overwrites an earlier sequence or leaves an old tail.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `moire-${stamp}-${crypto.randomUUID().slice(0, 8)}`;
  let take: Promise<DirectoryHandle> | null = null;
  return {
    async frame(index, frame) {
      try {
        const png = await frame.png();
        take ??= dir.getDirectoryHandle(name, { create: true });
        const folder = await take;
        const file = await folder.getFileHandle(frameName(index), { create: true });
        const stream = await file.createWritable();
        try {
          await stream.write(png);
          await stream.close();
        } catch (error) {
          await stream.abort?.().catch(() => {});
          throw error;
        }
      } catch (err) {
        // The first frame is the probe: a folder that cannot be written to fails
        // here, before anything has been written and while the count still reads
        // zero, rather than half way through a take.
        if (isRefusal(err)) {
          throw new Error(
            `Not allowed to write into ${dir.name ?? 'that folder'}. Pick one inside your ` +
              `home folder — Downloads or Documents — rather than a system or cloud location.`
          );
        }
        throw err;
      }
    },
  };
}
