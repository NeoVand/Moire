import { Album02Icon } from '@hugeicons/core-free-icons';
import { useLibraryStore } from '../store/library';
import { PRESETS } from '../lib/presets';
import { FloatingPanel } from './ui/FloatingPanel';
import { Icon } from './ui/Icon';

/**
 * The preset shelf: complete constructions to start from, opened from the
 * Projects panel. Picking one loads it as an untitled document through the
 * same path an imported JSON takes — nothing here is a special case, so a
 * preset can be remixed, exported, and sent around like any other scene.
 * Thumbnails are pre-captured from the renderer into `public/presets/`.
 */
export function PresetGallery({ onClose }: { onClose: () => void }) {
  const { loadSceneText } = useLibraryStore.getState();

  return (
    <FloatingPanel
      id="presets"
      width={430}
      defaultPosition={{ x: window.innerWidth - 760, y: 72 }}
      onClose={onClose}
      mark={<Icon icon={Album02Icon} size={14} />}
      title="Presets"
    >
      <div className="grid max-h-[64vh] grid-cols-2 gap-2 overflow-y-auto pr-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              loadSceneText(JSON.stringify(p.scene));
              onClose();
            }}
            className="group grid gap-1.5 rounded-lg border border-[var(--border)] p-1.5 text-left hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            <img
              src={`${import.meta.env.BASE_URL}presets/${p.id}.png`}
              alt={p.name}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-md border border-[var(--border)] bg-white object-cover"
            />
            <span className="px-0.5">
              <span className="block text-[11.5px] text-[var(--text-primary)]">{p.name}</span>
              <span className="block text-[10px] leading-[1.35] text-[var(--text-muted)]">
                {p.note}
              </span>
            </span>
          </button>
        ))}
      </div>
    </FloatingPanel>
  );
}
