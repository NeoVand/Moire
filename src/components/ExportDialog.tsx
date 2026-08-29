import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileDownloadIcon,
  FileUploadIcon,
  ImageDownloadIcon,
} from '@hugeicons/core-free-icons';
import { capturePng, captureSize, exportPng } from '../gpu/capture';
import { useProjectStore } from '../store/project';
import { parseScene, serializeScene } from '../store/scene';
import { FloatingPanel } from './ui/FloatingPanel';
import { Icon } from './ui/Icon';
import { InfoTip } from './ui/Tip';

/**
 * Export and share — the artwork end of the tool. The image side previews the
 * exact frame it will save: exports render at an explicit framebuffer size with
 * the zoom scaled to match, so a bigger export is a sharper picture of the same
 * view, and a different aspect extends the frame about its centre rather than
 * cropping it — the pattern is defined everywhere, so there is always more
 * picture past the edge. The scene side moves the whole construction as a JSON
 * that loads back exactly.
 */

const ASPECTS: { label: string; ratio: string; value: number }[] = [
  { label: 'Canvas', ratio: '', value: 0 },
  { label: 'Square', ratio: '1:1', value: 1 },
  { label: 'Portrait', ratio: '4:5', value: 4 / 5 },
  { label: 'Portrait', ratio: '2:3', value: 2 / 3 },
  { label: 'Story', ratio: '9:16', value: 9 / 16 },
  { label: 'Landscape', ratio: '3:2', value: 3 / 2 },
  { label: 'Wide', ratio: '16:9', value: 16 / 9 },
];

const SCALES = [1, 2, 4];

/** A little outlined rectangle in the option's own proportions. */
function AspectShape({ value, fallback }: { value: number; fallback: number }) {
  const a = value || fallback || 1;
  const w = a >= 1 ? 16 : Math.max(7, 14 * a);
  const h = a >= 1 ? Math.max(7, 16 / a) : 14;
  return (
    <span className="flex w-[18px] shrink-0 items-center justify-center">
      <span
        className="rounded-[2px] border border-current opacity-80"
        style={{ width: w, height: h }}
      />
    </span>
  );
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const chip = (active: boolean) =>
  `rounded-md px-2 py-0.5 font-mono text-[10px] tabular-nums ${
    active
      ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
  }`;

const button =
  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] ' +
  'px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [aspect, setAspect] = useState(0);
  const [scale, setScale] = useState(2);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previewUrl = useRef<string | null>(null);
  const rendering = useRef(false);
  const again = useRef(false);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const current = ASPECTS.find((a) => a.value === aspect) ?? ASPECTS[0];
  const canvasSize = captureSize({ scale: 1 });
  const canvasAspect = canvasSize ? canvasSize.width / canvasSize.height : 1;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [menuOpen]);

  const refreshPreview = useCallback(async () => {
    // One preview at a time; a request that lands mid-render queues one more.
    if (rendering.current) {
      again.current = true;
      return;
    }
    rendering.current = true;
    try {
      do {
        again.current = false;
        // Full canvas density, downscaled by the <img>: a low-resolution render
        // is not a faithful thumbnail here, because the stroke floor fattens
        // every hairline and the preview floods with ink.
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

  // Live preview: on open, on aspect change, and — debounced — whenever the
  // construction itself changes under the open dialog.
  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview, aspect]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useProjectStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshPreview(), 500);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, [refreshPreview]);

  const size = captureSize({ scale, aspect });

  const saveImage = async () => {
    try {
      await exportPng({ scale, aspect });
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus({ text: 'Could not capture the canvas.', error: true });
    }
  };

  const saveScene = () => {
    const s = useProjectStore.getState();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadText(
      `moire-scene-${stamp}.json`,
      serializeScene({
        layers: s.layers,
        selectedLayerId: s.selectedLayerId,
        camera: s.camera,
        backgroundColor: s.backgroundColor,
        view: s.view,
      })
    );
    setStatus(null);
  };

  const loadScene = async (file: File) => {
    try {
      const scene = parseScene(await file.text());
      useProjectStore.getState().loadScene(scene);
      setStatus({
        text: `Loaded ${scene.layers.length} layer${scene.layers.length === 1 ? '' : 's'}.`,
        error: false,
      });
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : 'Could not read the file.',
        error: true,
      });
    }
  };

  return (
    <FloatingPanel
      id="export"
      width={280}
      defaultPosition={{ x: window.innerWidth - 304, y: 56 }}
      onClose={onClose}
      mark={<Icon icon={ImageDownloadIcon} size={14} />}
      title="Export"
    >
      <div
        className="grid gap-2.5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void loadScene(file);
        }}
      >
        <div className="flex h-[190px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2">
          {preview ? (
            <img
              src={preview}
              alt="Export preview"
              className="border border-[var(--border)]"
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
            />
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">Rendering preview…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <AspectShape value={current.value} fallback={canvasAspect} />
            <span>{current.label}</span>
            {current.ratio && (
              <span className="font-mono text-[10px] text-[var(--text-muted)]">{current.ratio}</span>
            )}
            <span className="min-w-0 flex-1" />
            <span className="text-[9px] text-[var(--text-muted)]">▾</span>
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 left-0 z-10 mt-1 rounded-lg bg-[var(--bg-secondary)] p-1 shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_30%,transparent),var(--hud-shadow)]">
              {ASPECTS.map((a) => (
                <button
                  key={a.label + a.ratio}
                  type="button"
                  onClick={() => {
                    setAspect(a.value);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                    aspect === a.value
                      ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <AspectShape value={a.value} fallback={canvasAspect} />
                  <span>{a.label}</span>
                  <span className="min-w-0 flex-1" />
                  {a.ratio && (
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{a.ratio}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <InfoTip
          text="The output's shape. A wider or taller aspect extends the frame about its centre — the pattern continues past every edge, so nothing is ever cropped."
          label="Aspect"
        />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {SCALES.map((s) => (
              <button key={s} type="button" onClick={() => setScale(s)} className={chip(scale === s)}>
                {s}×
              </button>
            ))}
            <InfoTip
              text="The same frame at more pixels. Hairlines keep their width, so large exports stay crisp for print."
              label="Resolution"
            />
          </div>
          {size && (
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {size.width} × {size.height} px
            </span>
          )}
        </div>
        <button type="button" className={button} onClick={() => void saveImage()}>
          <Icon icon={ImageDownloadIcon} size={13} />
          Download image
        </button>
        <div className="mt-0.5 flex items-center gap-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)]">
          Scene
          <InfoTip
            text="The whole construction as a JSON — layers, fields, camera, and view — loading back exactly. Drop a scene file anywhere on this panel to open it."
            label="Scene"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={saveScene}>
            <Icon icon={FileDownloadIcon} size={13} />
            Save JSON
          </button>
          <button type="button" className={button} onClick={() => fileRef.current?.click()}>
            <Icon icon={FileUploadIcon} size={13} />
            Load…
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadScene(file);
            e.target.value = '';
          }}
        />
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
