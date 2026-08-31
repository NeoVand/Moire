import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera01Icon,
  Delete02Icon,
  FolderOpenIcon,
  ImageDownloadIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  StopIcon,
} from '@hugeicons/core-free-icons';
import { capturePng, captureSize, exportPng } from '../gpu/capture';
import {
  directoryPickerAvailable,
  directorySink,
  frameCount,
  pickDirectory,
  recordFrames,
  type RecordProgress,
} from '../gpu/recorder';
import {
  VIDEO_FORMATS,
  VIDEO_SIZES,
  downloadVideo,
  encodableFormats,
  videoFrameSize,
  videoSink,
  type VideoFormat,
} from '../gpu/video';
import { useLibraryStore } from '../store/library';
import { useProjectStore } from '../store/project';
import { MotionList } from './MotionList';
import { motionSpan } from '../types/motion';
import { useTransportStore } from '../store/transport';
import { FloatingPanel } from './ui/FloatingPanel';
import { Icon } from './ui/Icon';
import { NumberField } from './ui/NumberField';
import { InfoTip } from './ui/Tip';

/**
 * Capture: everything that leaves the tool as pixels.
 *
 * One still and nine hundred frames are the same operation at different lengths,
 * so they share a panel, a resolution and an aspect. What differs is the clock:
 * a still is whatever is on screen, and a recording is a stated range of the
 * transport's time, rendered frame by frame at an exact rate regardless of how
 * fast the machine can draw.
 *
 * Frames are the honest output and the only one here for now. They are also what
 * makes a clip reproducible -- a project file and two timestamps -- which is the
 * claim the paper's supplemental video will make.
 */

const ASPECTS: { label: string; ratio: string; value: number }[] = [
  { label: 'Canvas', ratio: '', value: 0 },
  { label: 'Square', ratio: '1:1', value: 1 },
  { label: 'Portrait', ratio: '4:5', value: 4 / 5 },
  { label: 'Story', ratio: '9:16', value: 9 / 16 },
  { label: 'Landscape', ratio: '3:2', value: 3 / 2 },
  { label: 'Wide', ratio: '16:9', value: 16 / 9 },
];

const SCALES = [1, 2, 4];
// 120 for slow motion and for panning shots on a high-refresh display, where the
// difference from 60 is visible on this content: hairlines crossing at speed are
// exactly what a low sample rate turns into strobing.
const RATES = [24, 30, 60, 120];

const chip = (active: boolean) =>
  `rounded-md px-2 py-[3px] font-mono text-[10px] tabular-nums transition-colors ${
    active
      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_22%,transparent)]'
      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
  }`;

const group = 'flex gap-0.5 rounded-md bg-[var(--bg-primary)] p-0.5';
const rowLabel = 'text-[9px] uppercase tracking-[0.09em] text-[var(--text-muted)]';
const button =
  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] ' +
  'px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40';

export function CaptureDialog({ onClose }: { onClose: () => void }) {
  const [aspect, setAspect] = useState(0);
  const [scale, setScale] = useState(2);
  const [fps, setFps] = useState(60);
  const [t0, setT0] = useState(0);
  const [t1, setT1] = useState(6);
  const [format, setFormat] = useState<'frames' | VideoFormat>('mp4');
  const [videoHeight, setVideoHeight] = useState(1080);
  const [encodable, setEncodable] = useState<Set<VideoFormat> | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<RecordProgress | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const rendering = useRef(false);
  const again = useRef(false);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const state = useTransportStore((s) => s.state);
  const clock = useTransportStore((s) => s.t);
  const recording = useTransportStore((s) => s.recording);
  const play = useTransportStore((s) => s.play);
  const pause = useTransportStore((s) => s.pause);
  const stop = useTransportStore((s) => s.stop);
  const seek = useTransportStore((s) => s.seek);
  const name = useLibraryStore((s) => s.name);
  const motion = useProjectStore((s) => s.motion);
  const animators = motion.animators.length;
  const playing = state === 'playing';
  const span = motionSpan(motion);
  // Within a hundredth of what the motion actually asks for.
  const fitted = Math.abs(t1 - span.end) < 0.01 && t0 === 0;

  const stillSize = captureSize({ scale, aspect });
  const canvasAspect = stillSize ? stillSize.width / stillSize.height : 16 / 9;
  const videoSize =
    format === 'frames'
      ? null
      : videoFrameSize(format, videoHeight, aspect || canvasAspect);
  const frames = frameCount({ t0, t1, fps });

  const refreshPreview = useCallback(async () => {
    if (rendering.current) {
      again.current = true;
      return;
    }
    rendering.current = true;
    try {
      do {
        again.current = false;
        const blob = await capturePng({ scale: 1, aspect: aspectRef.current });
        const url = URL.createObjectURL(blob);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview(url);
      } while (again.current);
    } catch {
      // The canvas may not be ready yet; the next change tries again.
    } finally {
      rendering.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview, aspect]);

  // What a take produced is true of that take and of nothing else. Left on
  // screen while the settings move underneath it, "238 frames, 4.2 MB" stops
  // describing the last recording and starts looking like a prediction of the
  // next one -- which it is not, and which is why the count appeared frozen.
  useEffect(() => {
    setStatus(null);
  }, [format, fps, t0, t1, scale, aspect, videoHeight]);

  // The range is offered rather than imposed: it is set once, when the panel
  // opens, so that adjusting it by hand is not undone by the next edit.
  useEffect(() => {
    const s = motionSpan(useProjectStore.getState().motion);
    if (!s.empty) setT1(Math.round(s.end * 100) / 100);
  }, []);

  // Finding out costs a real encode, so it happens when the settings settle
  // rather than on every keystroke, and null means "not known yet" rather than
  // "none" -- greying every format out while checking would be a lie.
  useEffect(() => {
    let live = true;
    setEncodable(null);
    const timer = setTimeout(() => {
      void encodableFormats(videoHeight, aspect || canvasAspect, fps).then((set) => {
        if (live) setEncodable(set);
      });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [videoHeight, aspect, canvasAspect, fps]);

  // The preview follows the construction, but not while recording: a thumbnail
  // is not worth a render between every pair of captured frames.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useProjectStore.subscribe(() => {
      if (useTransportStore.getState().recording) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshPreview(), 500);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, [refreshPreview]);

  const saveStill = async () => {
    try {
      await exportPng({ scale, aspect });
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus({ text: 'Could not capture the canvas.', error: true });
    }
  };

  const record = async () => {
    setStatus(null);
    const wantsFrames = format === 'frames';
    const dir = wantsFrames ? await pickDirectory() : null;
    if (wantsFrames && !dir) return;

    const video =
      wantsFrames || !videoSize
        ? null
        : videoSink({ format, width: videoSize.width, height: videoSize.height, fps });
    abort.current = new AbortController();
    setProgress({ frame: 0, frames, elapsed: 0 });
    try {
      const out = await recordFrames(
        // A recording lands on a stated height; a folder of stills keeps the
        // still export's multiplier, which is what that control is for.
        { t0, t1, fps, aspect, ...(videoSize ? { height: videoSize.height } : { scale }) },
        video ?? directorySink(dir!),
        setProgress,
        abort.current.signal
      );
      const file = video?.result();
      if (file && !out.cancelled) {
        downloadVideo(file, format as VideoFormat, name.trim() || 'moire');
        setStatus({
          text: `${out.frames} frames, ${(file.size / 1e6).toFixed(1)} MB.`,
          error: false,
        });
      } else {
        setStatus({
          text: out.cancelled
            ? `Stopped after ${out.frames} of ${frames} frames.`
            : `Wrote ${out.frames} frames.`,
          error: false,
        });
      }
    } catch (err) {
      console.error(err);
      const flush = err instanceof Error && /flush/i.test(err.message);
      setStatus({
        text: flush
          ? `The encoder gave up on ${videoSize?.width}×${videoSize?.height} at ${fps} a second. ` +
            `Drop the rate or the size and try again.`
          : err instanceof Error
            ? err.message
            : 'The recording failed.',
        error: true,
      });
    } finally {
      abort.current = null;
      setProgress(null);
      void refreshPreview();
    }
  };

  // A format greyed out in the row above is still the one selected, and a record
  // button that stays live over it is an invitation to the failure this check
  // exists to prevent.
  const refused = format !== 'frames' && !!encodable && !encodable.has(format);
  const alternative = VIDEO_FORMATS.find((f) => encodable?.has(f.id));

  const btn =
    'grid size-7 place-items-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30';

  return (
    <FloatingPanel
      id="capture"
      width={286}
      defaultPosition={{ x: window.innerWidth - 310, y: 56 }}
      onClose={onClose}
      mark={<Icon icon={Camera01Icon} size={14} />}
      title="Capture"
    >
      <div className="grid gap-2.5">
        <div className="flex h-[150px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2">
          {preview ? (
            <img
              src={preview}
              alt="Capture preview"
              className="border border-[var(--border)]"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">Rendering preview…</span>
          )}
        </div>

        <div className="grid gap-1.5">
          <span className={rowLabel}>Frame</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className={group}>
              {ASPECTS.map((a) => (
                <button
                  key={a.label + a.ratio}
                  type="button"
                  title={a.ratio || 'The canvas as it stands'}
                  className={chip(aspect === a.value)}
                  onClick={() => setAspect(a.value)}
                >
                  {a.ratio || 'Canvas'}
                </button>
              ))}
            </div>
            <div className={group}>
              {SCALES.map((s) => (
                <button key={s} type="button" className={chip(scale === s)} onClick={() => setScale(s)}>
                  {s}×
                </button>
              ))}
            </div>
            {stillSize && (
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {stillSize.width}×{stillSize.height}
              </span>
            )}
          </div>
        </div>

        <button type="button" className={button} onClick={() => void saveStill()} disabled={recording}>
          <Icon icon={ImageDownloadIcon} size={13} />
          Save this frame
        </button>

        <div className="flex items-center gap-1 border-t border-[var(--border)] pt-2.5">
          <span className={rowLabel}>Recording</span>
          <InfoTip
            text="Frames are rendered one at a time at exactly the stated rate, however long each takes — so the output is exact even when the machine is not. The same range recorded twice gives the same frames."
            label="Recording"
          />
        </div>

        <div className="flex items-center gap-0.5">
          <button type="button" className={btn} title="Back to the start" onClick={() => seek(0)} disabled={recording}>
            <Icon icon={PreviousIcon} size={13} />
          </button>
          <button
            type="button"
            className={`${btn} ${playing ? 'text-[var(--text-primary)]' : ''}`}
            title={playing ? 'Pause' : 'Play'}
            onClick={() => (playing ? pause() : play())}
            disabled={recording}
          >
            <Icon icon={playing ? PauseIcon : PlayIcon} size={13} />
          </button>
          <button type="button" className={btn} title="Stop and rewind" onClick={stop} disabled={recording}>
            <Icon icon={StopIcon} size={13} />
          </button>
          <span className="ml-1 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
            {state === 'stopped' ? 'idle' : `${clock.toFixed(1)}s`}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Use the clock's current position as the in point"
            onClick={() => setT0(Math.round(clock * 100) / 100)}
            disabled={recording}
          >
            set in
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Use the clock's current position as the out point"
            onClick={() => setT1(Math.round(clock * 100) / 100)}
            disabled={recording}
          >
            set out
          </button>
        </div>

        <MotionList />

        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">From</span>
            <NumberField value={t0} step={0.5} min={0} decimals={2} suffix="s" onChange={setT0} />
            <span className="flex-1" />
            <span className="text-[10.5px] text-[var(--text-secondary)]">To</span>
            <NumberField value={t1} step={0.5} min={0} decimals={2} suffix="s" onChange={setT1} />
          </div>
          <div className="flex items-center gap-1.5">
            <div className={group}>
              {RATES.map((r) => (
                <button key={r} type="button" className={chip(fps === r)} onClick={() => setFps(r)}>
                  {r}
                </button>
              ))}
            </div>
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {frames} frames
            </span>
            <span className="flex-1" />
            <button
              type="button"
              title={
                span.empty
                  ? 'Nothing moves yet'
                  : span.seamless
                    ? `${span.end.toFixed(2)}s is one whole cycle of everything moving, so the clip loops without a join`
                    : `${span.end.toFixed(2)}s is when the motion has finished saying what it has to say`
              }
              onClick={() => {
                setT0(0);
                setT1(Math.round(span.end * 100) / 100);
              }}
              disabled={span.empty || fitted}
              className={chip(fitted && !span.empty)}
            >
              fit
            </button>
          </div>
          {!span.empty && (
            <p className="text-[9px] leading-[1.4] text-[var(--text-muted)]">
              {fitted && span.seamless
                ? 'One whole cycle of everything moving, so this loops without a join.'
                : `The motion here runs ${span.end.toFixed(2)}s${span.seamless ? ' to a clean loop' : ''}.`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className={group}>
            <button type="button" className={chip(format === 'frames')} onClick={() => setFormat('frames')}>
              frames
            </button>
            {VIDEO_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={chip(format === f.id)}
                onClick={() => setFormat(f.id)}
                disabled={!!encodable && !encodable.has(f.id)}
                title={
                  encodable && !encodable.has(f.id)
                    ? `This machine will not encode ${f.label} at this size and rate`
                    : `A single ${f.label} file`
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          {videoSize && (
            <>
              <div className={group}>
                {VIDEO_SIZES.map((v) => (
                  <button
                    key={v.height}
                    type="button"
                    title={`${v.height} lines`}
                    className={chip(videoHeight === v.height)}
                    onClick={() => setVideoHeight(v.height)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {videoSize.width}×{videoSize.height}
              </span>
            </>
          )}
        </div>

        {videoSize && encodable === null && (
          <p className="text-[9px] leading-[1.4] text-[var(--text-muted)]">
            Checking what this machine will encode at {videoSize.width}×{videoSize.height},
            {' '}{fps} a second…
          </p>
        )}

        {refused && videoSize && (
          <p className="text-[10px] leading-[1.4] text-[#c0392b]">
            This machine will not encode {format.toUpperCase()} at {videoSize.width}×
            {videoSize.height}, {fps} a second.{' '}
            {alternative
              ? `${alternative.label} will, or drop the rate.`
              : 'Drop the rate or the size — 4K tends to stop above 60.'}
          </p>
        )}

        {videoSize && videoSize.height !== videoHeight && (
          <p className="text-[9px] leading-[1.4] text-[var(--text-muted)]">
            Held to {videoSize.width}×{videoSize.height}: this codec will not encode a frame
            that wide at {videoHeight} lines.
          </p>
        )}

        {animators === 0 && (
          <p className="text-[10px] leading-[1.4] text-[var(--text-muted)]">
            Nothing in this construction moves yet, so every frame would be the same picture.
            Give a slider motion with its play button first.
          </p>
        )}

        {progress ? (
          <div className="grid gap-1.5">
            <div className="h-[3px] overflow-hidden rounded-full bg-[var(--track)]">
              <div
                className="h-full rounded-full bg-[var(--text-primary)] transition-[width]"
                style={{ width: `${(progress.frame / progress.frames) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {progress.frame} / {progress.frames}
                {progress.frame > 0 &&
                  ` · ${Math.round(
                    (progress.elapsed / progress.frame) * (progress.frames - progress.frame)
                  )}s left`}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                title="Stop recording"
                aria-label="Stop recording"
                onClick={() => abort.current?.abort()}
                className="grid size-7 place-items-center rounded-md text-[#c0392b] hover:bg-[color-mix(in_srgb,#c0392b_16%,transparent)]"
              >
                <Icon icon={Delete02Icon} size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={button}
            onClick={() => void record()}
            disabled={refused || (format === 'frames' && !directoryPickerAvailable())}
            title={
              directoryPickerAvailable()
                ? 'Choose a folder; one PNG per frame is written into it'
                : 'This browser cannot write a folder of frames'
            }
          >
            <Icon icon={format === 'frames' ? FolderOpenIcon : Camera01Icon} size={13} />
            {format === 'frames' ? 'Record frames…' : `Record ${format.toUpperCase()}`}
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {frames} frames
            </span>
          </button>
        )}

        {status && (
          <p
            className={`text-[10.5px] leading-[1.4] ${
              status.error ? 'text-[#c0392b]' : 'text-[var(--text-muted)]'
            }`}
          >
            {!status.error && <span className="text-[var(--text-secondary)]">Last take: </span>}
            {status.text}
          </p>
        )}
      </div>
    </FloatingPanel>
  );
}
