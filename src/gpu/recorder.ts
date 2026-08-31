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
  // Where every animated knob stood before the take. Putting the clock back is
  // not enough to put the picture back: a `once` that has already landed applies
  // nothing at all, so restoring the time would leave the document sitting on the
  // last frame recorded. The values have to be remembered directly.
  const held = new Map<string, number>();
  for (const a of useProjectStore.getState().motion.animators) {
    const v = readParam(a.path);
    if (v !== undefined) held.set(a.path, v);
  }
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
      // The canvas is only valid inside this callback -- the renderer restores
      // its display size as soon as it returns -- so the sink does its work here
      // rather than being handed something that will change under it.
      await captureWith({ scale: opts.scale, aspect: opts.aspect }, async (canvas) => {
        await sink.frame(n, {
          canvas: async () => canvas,
          png: () =>
            new Promise<Blob>((res, rej) =>
              canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the frame.'))), 'image/png')
            ),
        });
      });
      written = n + 1;
      onProgress?.({ frame: written, frames, elapsed: (performance.now() - started) / 1000 });
    }
  } finally {
    await sink.close?.();
    useTransportStore.setState({ recording: false, ...restore });
    applyParams(held);
  }

  return { frames: written, cancelled };
}

/** The pixel size a recording would have, for showing before starting one. */
export function recordSize(opts: { scale?: number; aspect?: number }) {
  return captureSize(opts);
}

// ---------------------------------------------------------------- sinks

type PermissionState = 'granted' | 'denied' | 'prompt';

interface DirectoryHandle {
  name?: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
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
    async frame(index, frame) {
      try {
        const file = await dir.getFileHandle(frameName(index), { create: true });
        const stream = await file.createWritable();
        await stream.write(await frame.png());
        await stream.close();
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
