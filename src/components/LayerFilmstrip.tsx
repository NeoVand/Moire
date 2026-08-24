import { useState } from 'react';
import { Add01Icon, Copy01Icon, Delete02Icon, DragDropVerticalIcon, ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { MAX_LAYERS } from '../types/moire';
import { PATTERN_META } from '../types/moire';
import { useProjectStore } from '../store/project';
import { PATTERN_ICONS } from './patternIcons';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/IconButton';

export function LayerFilmstrip() {
  const layers = useProjectStore((s) => s.layers);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const selectLayer = useProjectStore((s) => s.selectLayer);
  const toggleVisibility = useProjectStore((s) => s.toggleVisibility);
  const addLayer = useProjectStore((s) => s.addLayer);
  const removeLayer = useProjectStore((s) => s.removeLayer);
  const duplicateLayer = useProjectStore((s) => s.duplicateLayer);
  const reorderLayers = useProjectStore((s) => s.reorderLayers);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
      <div className="hud-card pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto px-1.5 py-1.5">
        {layers.map((layer, index) => {
          const selected = layer.id === selectedLayerId;
          const label = PATTERN_META.find((item) => item.id === layer.type)?.label ?? layer.type;
          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) reorderLayers(dragIndex, index);
                setDragIndex(null);
              }}
              className={`flex items-center gap-0.5 rounded-xl px-1 py-0.5 ${
                selected
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                  : 'text-[var(--text-primary)]'
              } ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <span className="px-0.5 text-current opacity-40">
                <Icon icon={DragDropVerticalIcon} size={12} />
              </span>
              <button
                type="button"
                onClick={() => selectLayer(layer.id)}
                className="flex items-center gap-2 px-1 py-1"
              >
                <span
                  className="size-2.5 rounded-full border border-current"
                  style={{ background: layer.visible ? layer.color : 'transparent' }}
                />
                <span className="max-w-24 truncate text-[11px]">{layer.name}</span>
                <span className="opacity-70" title={label}>
                  <Icon icon={PATTERN_ICONS[layer.type]} size={14} />
                </span>
              </button>
              <IconButton
                icon={layer.visible ? ViewIcon : ViewOffSlashIcon}
                label={layer.visible ? 'Hide' : 'Show'}
                onClick={() => toggleVisibility(layer.id)}
                size={14}
                tone="inherit"
              />
              <IconButton
                icon={Copy01Icon}
                label="Duplicate"
                onClick={() => duplicateLayer(layer.id)}
                size={14}
                tone="inherit"
              />
              {layers.length > 1 && (
                <IconButton
                  icon={Delete02Icon}
                  label="Delete"
                  onClick={() => removeLayer(layer.id)}
                  size={14}
                  tone="inherit"
                />
              )}
            </div>
          );
        })}
        <IconButton
          icon={Add01Icon}
          label="Add layer"
          onClick={() => addLayer()}
          disabled={layers.length >= MAX_LAYERS}
        />
      </div>
    </div>
  );
}
