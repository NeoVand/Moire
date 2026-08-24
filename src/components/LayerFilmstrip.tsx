import { useEffect, useRef, useState } from 'react';
import { Add01Icon, Copy01Icon, Delete02Icon, DragDropVerticalIcon, ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { MAX_LAYERS, PATTERN_META, type PatternType } from '../types/moire';
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
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!addRef.current?.contains(e.target as Node)) setAddOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [addOpen]);

  const spawn = (type: PatternType) => {
    addLayer(type);
    setAddOpen(false);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
      <div className="hud-card pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 px-1.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
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
              className={`flex items-center gap-0.5 rounded-xl px-1 py-0.5 text-[var(--text-primary)] ${
                selected
                  ? 'bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] ring-1 ring-[var(--text-primary)]/35'
                  : 'hover:bg-[var(--bg-hover)]'
              } ${!layer.visible ? 'opacity-45' : ''} ${dragIndex === index ? 'opacity-35' : ''}`}
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
        </div>
        <div ref={addRef} className="relative shrink-0">
          <IconButton
            icon={Add01Icon}
            label="Add layer"
            onClick={() => setAddOpen((open) => !open)}
            disabled={layers.length >= MAX_LAYERS}
            active={addOpen}
          />
          {addOpen && layers.length < MAX_LAYERS && (
            <div className="hud-card absolute right-0 bottom-full z-30 mb-2 flex gap-0.5 p-1">
              {PATTERN_META.map((pattern) => (
                <IconButton
                  key={pattern.id}
                  icon={PATTERN_ICONS[pattern.id]}
                  label={`Add ${pattern.label.toLowerCase()}`}
                  onClick={() => spawn(pattern.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
