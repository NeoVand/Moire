import { useEffect, useRef, useState } from 'react';
import {
  Album02Icon,
  Copy01Icon,
  Delete02Icon,
  FileDownloadIcon,
  FileUploadIcon,
  Folder01Icon,
} from '@hugeicons/core-free-icons';
import { storageEstimate } from '../store/db';
import { useLibraryStore } from '../store/library';
import { sceneOf } from '../store/project';
import { serializeScene } from '../store/scene';
import { FloatingPanel } from './ui/FloatingPanel';
import { Icon } from './ui/Icon';
import { InfoTip } from './ui/Tip';
import { PresetGallery } from './PresetGallery';

/**
 * Projects — the documents end of the tool, and the one place that says out loud
 * what browser storage is and is not.
 *
 * Everything here is deliberate: naming, saving, opening, deleting, and moving a
 * construction in and out as JSON. The saving that actually protects the work is
 * not here at all — it runs on every edit whether this panel is open or not.
 */

const button =
  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] ' +
  'px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]';

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Coarse on purpose: to the minute is more than anyone needs of their own day. */
function ago(then: number): string {
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function Thumb({ blob, alt }: { blob?: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-primary)]">
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[9px] text-[var(--text-muted)]">—</span>
      )}
    </div>
  );
}

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const { available, projectId, name, dirty, projects } = useLibraryStore();
  const { rename, save, saveAs, open, remove, duplicate, createNew, loadSceneText, refresh } =
    useLibraryStore.getState();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
    void storageEstimate().then(setQuota);
  }, [refresh]);

  const saveNow = async () => {
    try {
      await (projectId ? save() : saveAs(name.trim() || 'Untitled'));
      void storageEstimate().then(setQuota);
      setStatus({ text: 'Saved.', error: false });
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : 'Could not save to browser storage.',
        error: true,
      });
    }
  };

  const readFile = async (file: File) => {
    try {
      loadSceneText(await file.text());
      setStatus({ text: `Opened ${file.name}.`, error: false });
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : 'Could not read the file.',
        error: true,
      });
    }
  };

  return (
    <FloatingPanel
      id="projects"
      width={286}
      defaultPosition={{ x: window.innerWidth - 310, y: 56 }}
      onClose={onClose}
      mark={<Icon icon={Folder01Icon} size={14} />}
      title="Projects"
    >
      <div
        className="grid gap-2.5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void readFile(file);
        }}
      >
        {/* The open document. Its name is editable in place; there is no dialog
            asking for one, because the field is right here. */}
        <div className="grid gap-1.5">
          <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
            Open
            {dirty && <span className="text-[10px] text-[var(--text-muted)]">· unsaved changes</span>}
          </div>
          <input
            value={name}
            onChange={(e) => rename(e.target.value)}
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
          />
          <div className="flex gap-2">
            <button type="button" className={button} onClick={() => void saveNow()} disabled={!available}>
              {projectId ? 'Save' : 'Save to library'}
            </button>
            {projectId && (
              <button
                type="button"
                className={button}
                onClick={() => void saveAs(`${name} copy`)}
                disabled={!available}
              >
                Save as new
              </button>
            )}
          </div>
        </div>

        {/* The shelf. */}
        <div className="flex items-center gap-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)]">
          Library
          <InfoTip
            text="Constructions saved in this browser. They are not a backup — a browser can clear them, and another machine will not see them. Export the JSON for anything you cannot lose."
            label="Library"
          />
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              createNew();
              setStatus(null);
            }}
            className="rounded-md px-1.5 py-0.5 text-[10.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            New
          </button>
        </div>

        {!available && (
          <p className="text-[10.5px] leading-[1.4] text-[var(--text-muted)]">
            This browser is not giving the page any storage, so nothing is being kept between
            visits. Export the JSON to keep a construction.
          </p>
        )}

        {available && projects.length === 0 && (
          <p className="text-[10.5px] leading-[1.4] text-[var(--text-muted)]">
            Nothing saved yet. Whatever is on screen is kept anyway, and comes back after a
            refresh — the library is for keeping more than one.
          </p>
        )}

        <div className="grid max-h-[228px] gap-1 overflow-y-auto">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center gap-2 rounded-lg border p-1.5 ${
                p.id === projectId
                  ? 'border-[var(--text-muted)] bg-[var(--bg-hover)]'
                  : 'border-transparent hover:bg-[var(--bg-hover)]'
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  void open(p.id);
                  setStatus(null);
                }}
              >
                <Thumb blob={p.thumbnail} alt={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-[var(--text-primary)]">
                    {p.name}
                  </span>
                  <span className="block text-[10px] text-[var(--text-muted)]">
                    {ago(p.updatedAt)}
                  </span>
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  title="Duplicate"
                  onClick={() => void duplicate(p.id)}
                  className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon={Copy01Icon} size={12} />
                </button>
                <button
                  type="button"
                  title={confirming === p.id ? 'Click again to delete' : 'Delete'}
                  onClick={() => {
                    // Two clicks, no modal. A dialog asking "are you sure" over a
                    // dialog is worse than a button that briefly means something else.
                    if (confirming === p.id) {
                      void remove(p.id);
                      setConfirming(null);
                    } else {
                      setConfirming(p.id);
                      setTimeout(() => setConfirming((c) => (c === p.id ? null : c)), 3000);
                    }
                  }}
                  className={`rounded-md p-1 hover:bg-[var(--bg-primary)] ${
                    confirming === p.id
                      ? 'text-[#c0392b]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon icon={Delete02Icon} size={12} />
                </button>
              </span>
            </div>
          ))}
        </div>

        {/* Starting points: complete constructions from the preset shelf. */}
        <div className="flex items-center gap-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)]">
          Presets
          <InfoTip
            text="Complete constructions to start from. Opening one replaces the canvas with an untitled copy — your library is untouched, and the copy is yours to remix, save, or export."
            label="Presets"
          />
        </div>
        <button type="button" className={button} onClick={() => setShowPresets(true)}>
          <Icon icon={Album02Icon} size={13} />
          Open a preset…
        </button>
        {showPresets && <PresetGallery onClose={() => setShowPresets(false)} />}

        {/* In and out as a file, which is the only copy that outlives the browser. */}
        <div className="flex items-center gap-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-secondary)]">
          File
          <InfoTip
            text="The whole construction as a JSON — layers, fields, camera, and view — loading back exactly. Drop a scene file anywhere on this panel to open it."
            label="File"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'scene';
              downloadText(`moire-${slug}-${stamp}.json`, serializeScene(sceneOf()));
            }}
          >
            <Icon icon={FileDownloadIcon} size={13} />
            Export JSON
          </button>
          <button type="button" className={button} onClick={() => fileRef.current?.click()}>
            <Icon icon={FileUploadIcon} size={13} />
            Import…
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = '';
          }}
        />

        {quota && quota.quota > 0 && (
          <p className="text-[10px] text-[var(--text-muted)]">
            {(quota.usage / 1e6).toFixed(1)} MB used of {(quota.quota / 1e6).toFixed(0)} MB
            available to this site.
          </p>
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
