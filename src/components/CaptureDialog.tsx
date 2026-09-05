import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera01Icon,
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
  recordingError,
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
import { composeLoop, loopIssues } from '../types/composition';
import { paramDescriptor } from '../store/params';
import { useTransportStore } from '../store/transport';
import { FloatingPanel } from './ui/FloatingPanel';
import { Icon } from './ui/Icon';
import { NumberField } from './ui/NumberField';
import { InfoTip } from './ui/Tip';

/** Still export and deterministic, frame-by-frame recording share the same framing. */

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
const periodOf = (path: string) => paramDescriptor(path)?.period;

// Session preferences survive closing this floating panel. A different document
// gets its own range; output size and codec remain the author's preferences.
let remembered: {
  revision: number; aspect: number; scale: number; fps: number; intent: 'clip' | 'loop';
  t0: number; t1: number; format: 'frames' | VideoFormat; videoHeight: number;
} | undefined;

export function CaptureDialog({ onClose }: { onClose: () => void }) {
  const revision = useProjectStore((s) => s.documentRevision);
  const [initial] = useState(() => remembered);
  const [aspect, setAspect] = useState(initial?.aspect ?? 0);
  const [scale, setScale] = useState(initial?.scale ?? 2);
  const [fps, setFps] = useState(initial?.fps ?? 60);
  const [intent, setIntent] = useState<'clip' | 'loop'>(initial?.revision === revision ? initial.intent : 'clip');
  const [t0, setT0] = useState(initial?.revision === revision ? initial.t0 : 0);
  const [t1, setT1] = useState(() => {
    if (initial?.revision === revision) return initial.t1;
    const motion = useProjectStore.getState().motion;
    const { muted, solo } = useTransportStore.getState();
    return motionSpan({ ...motion, animators: motion.animators.filter((a) => solo ? a.id === solo : !muted.includes(a.id)) }, periodOf).end;
  });
  const [format, setFormat] = useState<'frames' | VideoFormat>(initial?.format ?? 'mp4');
  const [videoHeight, setVideoHeight] = useState(initial?.videoHeight ?? 1080);
  const [encodable, setEncodable] = useState<Set<VideoFormat> | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<RecordProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const previewGeneration = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const rendering = useRef(false);
  const again = useRef(false);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const state = useTransportStore((s) => s.state);
  const clock = useTransportStore((s) => s.t);
  const recording = useTransportStore((s) => s.recording);
  const previewRange = useTransportStore((s) => s.previewRange);
  const pause = useTransportStore((s) => s.pause);
  const stop = useTransportStore((s) => s.stop);
  const seek = useTransportStore((s) => s.seek);
  const name = useLibraryStore((s) => s.name);
  const motion = useProjectStore((s) => s.motion);
  const muted = useTransportStore((s) => s.muted);
  const solo = useTransportStore((s) => s.solo);
  const effectiveMotion = {
    ...motion,
    animators: motion.animators.filter((a) => a.enabled && (solo ? a.id === solo : !muted.includes(a.id))),
  };
  const busy = recording || starting || saving;
  const playing = state === 'playing';
  const span = motionSpan(effectiveMotion, periodOf);
  // Within a hundredth of what the motion actually asks for.
  const fitted = Math.abs(t1 - span.end) < 0.01 && t0 === 0;

  const stillSize = captureSize({ scale, aspect });
  const canvasAspect = stillSize ? stillSize.width / stillSize.height : 16 / 9;
  const videoSize =
    format === 'frames'
      ? null
      : videoFrameSize(format, videoHeight, aspect || canvasAspect);
  const frames = frameCount({ t0, t1, fps });
  const rangeError = recordingError({ t0, t1, fps });
  const encodedDuration = frames / fps;
  const issues = loopIssues(effectiveMotion, t0, t0 + encodedDuration, periodOf);
  const issueGroups = Array.from(new Set(issues.map((issue) => issue.reason))).map((reason) => ({
    reason,
    tracks: issues.filter((issue) => issue.reason === reason).map((issue) => {
      const a = motion.animators.find((item) => item.id === issue.id)!;
      return paramDescriptor(a.path)?.label ?? a.path;
    }),
  }));

  const previousRevision = useRef(revision);
  useEffect(() => {
    if (previousRevision.current !== revision) {
      previousRevision.current = revision;
      setT0(0);
      setT1(motionSpan(useProjectStore.getState().motion, periodOf).end);
      setIntent('clip');
    }
  }, [revision]);
  useEffect(() => {
    remembered = { revision, aspect, scale, fps, intent, t0, t1, format, videoHeight };
  }, [revision, aspect, scale, fps, intent, t0, t1, format, videoHeight]);

  const refreshPreview = useCallback(async () => {
    if (!mounted.current || useTransportStore.getState().recording) return;
    if (rendering.current) {
      again.current = true;
      return;
    }
    rendering.current = true;
    try {
      do {
        again.current = false;
        const generation = previewGeneration.current;
        const blob = await capturePng({ scale: 1, aspect: aspectRef.current });
        if (!mounted.current || useTransportStore.getState().recording || generation !== previewGeneration.current) break;
        const url = URL.createObjectURL(blob);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview(url);
      } while (again.current);
    } catch {
      // Startup may still be compiling; a later scene change retries.
    } finally {
      rendering.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview, aspect]);

  useEffect(() => {
    setStatus(null);
  }, [format, fps, t0, t1, scale, aspect, videoHeight]);

  // A running preview must never use bounds different from the visible controls.
  useEffect(() => {
    const transport = useTransportStore.getState();
    if (transport.range && !transport.recording) transport.pause();
  }, [t0, t1, fps, intent]);

  useEffect(() => {
    if (recording) return;
    let live = true;
    setEncodable(null);
    const timer = setTimeout(() => {
      void encodableFormats(videoHeight, aspect || canvasAspect, fps)
        .then((set) => { if (live) setEncodable(set); })
        .catch(() => { if (live) setEncodable(new Set()); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [videoHeight, aspect, canvasAspect, fps, recording]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changed = () => {
      if (timer) clearTimeout(timer);
      if (useTransportStore.getState().recording) return;
      timer = setTimeout(() => void refreshPreview(), 300);
    };
    const unsubProject = useProjectStore.subscribe(changed);
    const unsubTransport = useTransportStore.subscribe((s, prev) => {
      if (s.state !== prev.state || s.recording !== prev.recording) changed();
    });
    return () => {
      unsubProject(); unsubTransport();
      if (timer) clearTimeout(timer);
    };
  }, [refreshPreview]);

  const saveStill = async () => {
    if (pending.current || useTransportStore.getState().recording) return;
    pending.current = true;
    setSaving(true);
    const wasPlaying = useTransportStore.getState().state === 'playing';
    pause();
    try {
      await exportPng({ scale, aspect });
      if (mounted.current) setStatus({ text: 'PNG saved.', error: false });
    } catch (err) {
      if (mounted.current) setStatus({ text: err instanceof Error ? err.message : 'Could not capture the canvas.', error: true });
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
      if (wasPlaying && !useTransportStore.getState().recording) {
        useTransportStore.setState({ state: 'playing' });
      }
    }
  };

  const record = async () => {
    if (pending.current || useTransportStore.getState().recording || rangeError) return;
    pending.current = true;
    setStarting(true);
    setStatus(null);
    setCancelling(false);
    previewGeneration.current++;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const wantsFrames = format === 'frames';
      const dir = wantsFrames ? await pickDirectory() : null;
      if (controller.signal.aborted || (wantsFrames && !dir)) return;
      const video = wantsFrames || !videoSize
        ? null
        : videoSink({ format, width: videoSize.width, height: videoSize.height, fps });
      const out = await recordFrames(
        { t0, t1, fps, aspect, ...(videoSize ? { height: videoSize.height } : { scale }) },
        video ?? directorySink(dir!),
        (p) => { if (mounted.current) setProgress(p); },
        controller.signal
      );
      if (!mounted.current) return;
      const file = video?.result();
      if (file && !out.cancelled && !controller.signal.aborted) {
        downloadVideo(file, format as VideoFormat, name.trim() || 'moire');
        setStatus({ text: `Saved ${out.frames} frames · ${(out.frames / fps).toFixed(2)}s · ${(file.size / 1e6).toFixed(1)} MB.`, error: false });
      } else {
        setStatus({
          text: out.cancelled || controller.signal.aborted
            ? `Cancelled after ${out.frames} of ${frames} frames.${wantsFrames ? ' The partial take remains in its folder.' : ''}`
            : `Saved ${out.frames} PNGs in a new take folder.`,
          error: false,
        });
      }
    } catch (err) {
      if (mounted.current) setStatus({
        text: err instanceof Error && /flush/i.test(err.message)
          ? `The encoder failed at ${videoSize?.width}×${videoSize?.height}, ${fps} fps. Try a smaller size or lower frame rate.`
          : err instanceof Error ? err.message : 'The recording failed.',
        error: true,
      });
    } finally {
      abort.current = null;
      pending.current = false;
      if (mounted.current) {
        setStarting(false); setProgress(null); setCancelling(false);
        void refreshPreview();
      }
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setCancelling(true);
  };

  const scrub = (t: number) => {
    pause();
    seek(Math.max(0, t));
  };

  const makeLoop = () => {
    if (rangeError || encodedDuration < 0.002) return;
    pause();
    useProjectStore.setState({ motion: composeLoop(motion, effectiveMotion.animators.map((a) => a.id), t0, encodedDuration) });
    setT1(t0 + encodedDuration);
    scrub(t0);
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
      onClose={() => {
        if (pending.current) { cancel(); return; }
        onClose();
      }}
      mark={<Icon icon={Camera01Icon} size={14} />}
      title="Capture"
    >
      <div className="grid max-h-[calc(100dvh-110px)] gap-2.5 overflow-y-auto overscroll-contain">
        <div title="Framing preview; pause playback to refresh" className="relative flex h-[130px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2">
          {preview ? (
            <img
              src={preview}
              alt="Framing preview"
              className="border border-[var(--border)]"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">Rendering preview…</span>
          )}
        </div>

        <fieldset disabled={busy} className="grid min-w-0 gap-1.5">
          <legend className={rowLabel}>Framing</legend>
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
        </fieldset>
        <button type="button" className={button} onClick={() => void saveStill()} disabled={busy}>
          <Icon icon={ImageDownloadIcon} size={13} />
          {saving ? 'Saving PNG…' : 'Save frame'}
        </button>

        <div className="flex items-center gap-1 border-t border-[var(--border)] pt-2.5">
          <span className={rowLabel}>Recording</span>
          <InfoTip
            text="Each frame uses an exact timestamp; the end of the range is excluded."
            label="Recording"
          />
        </div>

        <fieldset disabled={busy} className="grid min-w-0 gap-2.5">
        <div className="flex items-center gap-2">
          <div className={group}>
            <button type="button" className={chip(intent === 'clip')} onClick={() => setIntent('clip')} title="Preview once from In to Out">Clip</button>
            <button type="button" className={chip(intent === 'loop')} onClick={() => setIntent('loop')} title="Preview the chosen range repeatedly and check how motions meet">Loop</button>
          </div>
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{encodedDuration.toFixed(2)}s</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className={btn} title="Back to In" onClick={() => scrub(t0)} disabled={recording}>
            <Icon icon={PreviousIcon} size={13} />
          </button>
          <button
            type="button"
            className={`${btn} ${playing ? 'text-[var(--text-primary)]' : ''}`}
            title={playing ? 'Pause' : intent === 'loop' ? 'Preview loop' : 'Preview clip'}
            onClick={() => (playing ? pause() : previewRange(t0, t0 + encodedDuration, intent === 'loop', true))}
            disabled={recording || !!rangeError}
          >
            <Icon icon={playing ? PauseIcon : PlayIcon} size={13} />
          </button>
          <button type="button" className={btn} title="Stop and rewind" onClick={stop} disabled={recording}>
            <Icon icon={StopIcon} size={13} />
          </button>
          <NumberField label="Playhead" value={clock} onChange={scrub} min={0} step={1 / fps} decimals={2} suffix="s" width={58} />
          <span className="flex-1" />
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Use the clock's current position as the in point"
            onClick={() => { const t = Math.round(clock * 100) / 100; setT0(t); if (t >= t1) setT1(t + 1); }}
            disabled={recording}
          >
            set in
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Use the clock's current position as the out point"
            onClick={() => { const t = Math.max(1 / fps, Math.round(clock * 100) / 100); setT1(t); if (t <= t0) setT0(Math.max(0, t - 1)); }}
            disabled={recording}
          >
            set out
          </button>
        </div>

        <MotionList />

        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">From</span>
            <NumberField label="Recording start" value={t0} step={0.5} min={0} decimals={2} suffix="s" onChange={setT0} />
            <span className="flex-1" />
            <span className="text-[10.5px] text-[var(--text-secondary)]">To</span>
            <NumberField label="Recording end" value={t1} step={0.5} min={0} decimals={2} suffix="s" onChange={setT1} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className={group}>
              {RATES.map((r) => (
                <button key={r} type="button" className={chip(fps === r)} title={`${r} frames per second`} onClick={() => setFps(r)}>
                  {r}
                </button>
              ))}
            </div>
            <span className="text-[9px] text-[var(--text-muted)]">fps</span>
            <span className="flex-1" />
            <button
              type="button"
              title={
                span.empty
                  ? 'Nothing moves yet'
                  : span.seamless
                    ? `Fit to a complete ${span.end.toFixed(2)}s cycle`
                    : `Fit to ${span.end.toFixed(2)}s of motion; the boundary may jump`
              }
              onClick={() => {
                setT0(0);
                setT1(Math.round(span.end * 100) / 100);
              }}
              disabled={span.empty || fitted}
              className={chip(fitted && !span.empty)}
            >
              Fit
            </button>
          </div>
          {intent === 'loop' && !rangeError && !span.empty && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-muted)]">{issues.length ? 'Check join' : 'Closed loop'}</span>
              <InfoTip label="Loop join" text={issues.length
                ? issueGroups.map(({ reason }) => reason).join(' ')
                : 'All active motions return together at the selected frame rate.'} />
              {issues.length > 0 && <button type="button" className={`${chip(false)} ml-auto`} onClick={makeLoop}
                title="Make every active motion bounce once over this range, keeping its value range. Undo restores the original timing.">Sync</button>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className={group}>
            <button type="button" className={chip(format === 'frames')} onClick={() => setFormat('frames')}>
              PNGs
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
                    title={`${v.height} pixels high`}
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

        </fieldset>

        {rangeError && <p role="alert" className="text-[10px] text-[#c0392b]">{rangeError}</p>}

        {refused && (
          <span className="text-[10px] text-[#c0392b]">
            {format.toUpperCase()} unavailable here. {alternative ? `Try ${alternative.label}.` : 'Try a smaller size or PNGs.'}
          </span>
        )}

        {starting || progress ? (
          <div className="grid gap-1.5">
            <div role="progressbar" aria-label="Recording progress" aria-valuemin={0} aria-valuemax={progress?.frames ?? frames} aria-valuenow={progress?.frame ?? 0}
              className="h-[3px] overflow-hidden rounded-full bg-[var(--track)]">
              <div className="h-full rounded-full bg-[var(--text-primary)] transition-[width]"
                style={{ width: `${progress ? (progress.frame / progress.frames) * 100 : 0}%` }} />
            </div>
            <div className="flex items-center gap-2">
              <span role="status" className="text-[10px] tabular-nums text-[var(--text-secondary)]">
                {cancelling ? 'Cancelling…'
                  : !progress || progress.stage === 'preparing' ? 'Preparing recording…'
                  : progress.stage === 'finalizing' ? 'Finishing file…'
                  : `${progress.frame} / ${progress.frames} frames · ${Math.ceil((progress.elapsed / Math.max(1, progress.frame)) * (progress.frames - progress.frame))}s left`}
              </span>
              <span className="flex-1" />
              <button type="button" onClick={cancel} disabled={cancelling}
                className="rounded-md px-2 py-1 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={button} onClick={() => void record()}
            disabled={busy || !!rangeError || refused || (format !== 'frames' && encodable === null) || (format === 'frames' && !directoryPickerAvailable())}
            title={format === 'frames'
              ? directoryPickerAvailable() ? 'Choose a folder; a new take folder will contain one PNG per frame' : 'This browser cannot write a folder of frames'
              : `Download one ${format.toUpperCase()} file`}>
            <Icon icon={format === 'frames' ? FolderOpenIcon : Camera01Icon} size={13} />
            {recording ? 'Recording…' : format !== 'frames' && encodable === null ? 'Checking formats…' : format === 'frames' ? 'Export PNGs…' : `Export ${format.toUpperCase()}`}
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">{frames} frames</span>
          </button>
        )}

        {status && (
          <p
            role={status.error ? 'alert' : 'status'}
            className={`text-[10.5px] leading-[1.4] ${
              status.error ? 'text-[#c0392b]' : 'text-[var(--text-muted)]'
            }`}
          >
            {status.text}
          </p>
        )}
      </div>
    </FloatingPanel>
  );
}
