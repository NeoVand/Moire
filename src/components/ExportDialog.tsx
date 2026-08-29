import { useRef, useState } from 'react';
import { ImageDownloadIcon } from '@hugeicons/core-free-icons';
import { exportPng } from '../gpu/capture';
import { useProjectStore } from '../store/project';
import { parseScene, serializeScene } from '../store/scene';
import { FloatingPanel } from './ui/FloatingPanel';
import { Icon } from './ui/Icon';

/**
 * Export and share: the image at a chosen resolution, or the construction
 * itself as a scene JSON that loads back exactly. The JSON is the tool's unit
 * of exchange — every layer, field, and view setting — so a picture someone
 * else should reproduce travels as a file instead of a parameter list.
 */

const SCALES = [1, 2, 4];

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [scale, setScale] = useState(2);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveImage = async () => {
    try {
      await exportPng(scale);
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

  const button =
    'w-full rounded-lg border border-[var(--border)] px-3 py-1.5 text-left text-[11px] ' +
    'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]';

  return (
    <FloatingPanel
      id="export"
      width={244}
      defaultPosition={{ x: window.innerWidth - 268, y: 56 }}
      onClose={onClose}
      mark={<Icon icon={ImageDownloadIcon} size={14} />}
      title="Export"
    >
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-secondary)]">Resolution</span>
          <div className="flex gap-0.5">
            {SCALES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScale(s)}
                className={`rounded-md px-2 py-0.5 font-mono text-[10px] tabular-nums ${
                  scale === s
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <button type="button" className={button} onClick={() => void saveImage()}>
          Download image
        </button>
        <div className="mt-1 border-t border-[var(--border)] pt-2">
          <span className="text-[11px] text-[var(--text-secondary)]">Scene</span>
        </div>
        <button type="button" className={button} onClick={saveScene}>
          Download settings (JSON)
        </button>
        <button type="button" className={button} onClick={() => fileRef.current?.click()}>
          Load settings…
        </button>
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
              status.error ? 'text-[var(--text-danger,#c0392b)]' : 'text-[var(--text-muted)]'
            }`}
          >
            {status.text}
          </p>
        )}
        <p className="border-t border-[var(--border)] pt-2 text-[10.5px] leading-[1.5] text-[var(--text-muted)]">
          The JSON carries the whole construction — layers, fields, camera, and view — and
          loads back exactly. Share it to let someone reproduce this picture.
        </p>
      </div>
    </FloatingPanel>
  );
}
