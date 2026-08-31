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
import { useProjectStore } from '../store/project';
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
const RATES = [24, 30, 60];

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
  const animators = useProjectStore((s) => s.motion.animators.length);
  const playing = state === 'playing';

  const size = captureSize({ scale, aspect });
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
    const dir = await pickDirectory();
    if (!dir) return;
    abort.current = new AbortController();
    setStatus(null);
    setProgress({ frame: 0, frames, elapsed: 0 });
    try {
      const out = await recordFrames(
        { t0, t1, fps, scale, aspect },
        directorySink(dir),
        setProgress,
        abort.current.signal
      );
      setStatus({
        text: out.cancelled
          ? `Stopped after ${out.frames} of ${frames} frames.`
          : `Wrote ${out.frames} frames.`,
        error: false,
      });
    } catch (err) {
      console.error(err);
      setStatus({
        text: err instanceof Error ? err.message : 'The recording failed.',
        error: true,
      });
    } finally {
      abort.current = null;
      setProgress(null);
      void refreshPreview();
    }
  };

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
            {size && (
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {size.width}×{size.height}
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
            onClick={() => setT0(Math.round(clock * 10) / 10)}
            disabled={recording}
          >
            set in
          </button>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[var(--text-secondary)]">From</span>
            <NumberField value={t0} step={0.5} min={0} suffix="s" onChange={setT0} />
            <span className="flex-1" />
            <span className="text-[10.5px] text-[var(--text-secondary)]">To</span>
            <NumberField value={t1} step={0.5} min={0} suffix="s" onChange={setT1} />
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
          </div>
        </div>

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
            disabled={!directoryPickerAvailable()}
            title={
              directoryPickerAvailable()
                ? 'Choose a folder; one PNG per frame is written into it'
                : 'This browser cannot write a folder of frames'
            }
          >
            <Icon icon={FolderOpenIcon} size={13} />
            Record frames…
          </button>
        )}

        {status && (
          <p
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
