import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowLeft01Icon,
  Copy01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  ImageDownloadIcon,
  JupiterIcon,
  KeyboardIcon,
  Moon02Icon,
  Sun03Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons';
import { useTheme } from '../hooks/useTheme';
import { exportPng } from '../gpu/capture';
import { LAYER_DEFAULTS, MAX_LAYERS, PATTERN_META, isConcentric, type PatternType } from '../types/moire';
import { useProjectStore, useSelectedLayer } from '../store/project';
import { PATTERN_ICONS } from './patternIcons';
import { ColorField } from './ui/ColorField';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/IconButton';
import { Slider } from './ui/Slider';

const STUDIO_KEY = 'moire-studio-open';

function readOpen() {
  try {
    const next = localStorage.getItem(STUDIO_KEY);
    if (next === '0') return false;
    if (next === '1') return true;
    return localStorage.getItem('moire-inspector-open') !== '0';
  } catch {
    return true;
  }
}

function Mark({ size = 22 }: { size?: number }) {
  return <HugeiconsIcon icon={JupiterIcon} size={size} color="currentColor" strokeWidth={1.75} />;
}

function Rule() {
  return <div className="h-px bg-[var(--border)]" />;
}

async function savePng() {
  try {
    await exportPng();
  } catch (err) {
    console.error(err);
  }
}

function LayerStack() {
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
    <section className="grid gap-1">
      <div className="flex h-6 items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">Layers</span>
        <div ref={addRef} className="relative">
          <IconButton
            icon={Add01Icon}
            label="Add layer"
            onClick={() => setAddOpen((open) => !open)}
            disabled={layers.length >= MAX_LAYERS}
            active={addOpen}
            dense
          />
          {addOpen && layers.length < MAX_LAYERS && (
            <div className="hud-card absolute top-full right-0 z-30 mt-1 flex gap-0.5 p-1">
              {PATTERN_META.map((pattern) => (
                <IconButton
                  key={pattern.id}
                  icon={PATTERN_ICONS[pattern.id]}
                  label={`Add ${pattern.label.toLowerCase()}`}
                  onClick={() => spawn(pattern.id)}
                  dense
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-0.5">
        {layers.map((layer, index) => {
          const selected = layer.id === selectedLayerId;
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
              className={`flex items-center gap-0.5 rounded-lg px-1 text-[var(--text-primary)] ${
                selected
                  ? 'ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-primary)_40%,transparent)]'
                  : 'hover:bg-[var(--bg-hover)]'
              } ${!layer.visible ? 'opacity-45' : ''} ${dragIndex === index ? 'opacity-35' : ''}`}
            >
              <span className="text-current opacity-30">
                <Icon icon={DragDropVerticalIcon} size={13} />
              </span>
              <button
                type="button"
                onClick={() => selectLayer(layer.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left"
              >
                <span
                  className="size-2 shrink-0 rounded-full border border-current"
                  style={{ background: layer.visible ? layer.color : 'transparent' }}
                />
                <span className="min-w-0 truncate text-[12px]">{layer.name}</span>
              </button>
              <IconButton
                icon={layer.visible ? ViewIcon : ViewOffSlashIcon}
                label={layer.visible ? 'Hide' : 'Show'}
                onClick={() => toggleVisibility(layer.id)}
                size={13}
                tone="inherit"
                dense
              />
              <IconButton
                icon={Copy01Icon}
                label="Duplicate"
                onClick={() => duplicateLayer(layer.id)}
                size={13}
                tone="inherit"
                dense
              />
              {layers.length > 1 && (
                <IconButton
                  icon={Delete02Icon}
                  label="Delete"
                  onClick={() => removeLayer(layer.id)}
                  size={13}
                  tone="inherit"
                  dense
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LayerFields() {
  const layer = useSelectedLayer();
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const renameLayer = useProjectStore((s) => s.renameLayer);
  const setLayerType = useProjectStore((s) => s.setLayerType);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  if (!layer) return null;

  const commitName = () => {
    const next = draftName.trim();
    if (next) renameLayer(layer.id, next);
    setEditingName(false);
  };

  const spacingDefault =
    layer.type === 'straight-lines' ? LAYER_DEFAULTS.spacingLines : LAYER_DEFAULTS.spacing;

  return (
    <div className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2">
        {editingName ? (
          <input
            className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-[var(--text-primary)] outline-none"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setEditingName(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 truncate text-left text-[12px] font-medium text-[var(--text-primary)]"
            onDoubleClick={() => {
              setDraftName(layer.name);
              setEditingName(true);
            }}
          >
            {layer.name}
          </button>
        )}
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
          {PATTERN_META.find((item) => item.id === layer.type)?.label}
        </span>
      </div>

      <div className="flex gap-0.5">
        {PATTERN_META.map((pattern) => {
          const active = layer.type === pattern.id;
          return (
            <button
              key={pattern.id}
              type="button"
              title={pattern.label}
              onClick={() => setLayerType(layer.id, pattern.id)}
              className={`grid h-8 flex-1 place-items-center rounded-md ${
                active
                  ? 'text-[var(--text-primary)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-primary)_45%,transparent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon icon={PATTERN_ICONS[pattern.id]} size={16} />
            </button>
          );
        })}
      </div>

      <ColorField
        label="Stroke"
        value={layer.color}
        onChange={(color) => updateLayer(layer.id, { color })}
      />
      <Slider
        label="Thickness"
        value={layer.thickness}
        min={0.2}
        max={20}
        step={0.1}
        defaultValue={LAYER_DEFAULTS.thickness}
        onChange={(thickness) => updateLayer(layer.id, { thickness })}
      />
      <Slider
        label="Spacing"
        value={layer.spacing}
        min={1}
        max={120}
        step={0.1}
        defaultValue={spacingDefault}
        onChange={(spacing) => updateLayer(layer.id, { spacing })}
      />
      <Slider
        label="Opacity"
        value={layer.opacity}
        min={0}
        max={1}
        step={0.01}
        defaultValue={LAYER_DEFAULTS.opacity}
        onChange={(opacity) => updateLayer(layer.id, { opacity })}
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Slider
          label="X"
          value={layer.position.x}
          min={-400}
          max={400}
          step={0.1}
          defaultValue={LAYER_DEFAULTS.positionX}
          onChange={(x) => updateLayer(layer.id, { position: { x } })}
        />
        <Slider
          label="Y"
          value={layer.position.y}
          min={-400}
          max={400}
          step={0.1}
          defaultValue={LAYER_DEFAULTS.positionY}
          onChange={(y) => updateLayer(layer.id, { position: { y } })}
        />
      </div>
      <Slider
        label="Rotation"
        value={layer.rotation}
        min={-180}
        max={180}
        step={0.1}
        unit="°"
        defaultValue={LAYER_DEFAULTS.rotation}
        onChange={(rotation) => updateLayer(layer.id, { rotation })}
      />
      <Slider
        label={isConcentric(layer.type) ? 'Start' : 'Phase'}
        value={layer.phase}
        min={0}
        max={isConcentric(layer.type) ? 400 : Math.max(layer.spacing, 1)}
        step={1}
        defaultValue={LAYER_DEFAULTS.phase}
        onChange={(phase) => updateLayer(layer.id, { phase })}
      />
      {layer.type === 'straight-lines' ? (
        <Slider
          label="Progressive"
          value={layer.offset.x}
          min={-8}
          max={8}
          step={0.01}
          defaultValue={LAYER_DEFAULTS.offsetX}
          onChange={(x) => updateLayer(layer.id, { offset: { x } })}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Slider
              label="Offset X"
              value={layer.offset.x}
              min={-4}
              max={4}
              step={0.01}
              defaultValue={LAYER_DEFAULTS.offsetX}
              onChange={(x) => updateLayer(layer.id, { offset: { x } })}
            />
            <Slider
              label="Offset Y"
              value={layer.offset.y}
              min={-4}
              max={4}
              step={0.01}
              defaultValue={LAYER_DEFAULTS.offsetY}
              onChange={(y) => updateLayer(layer.id, { offset: { y } })}
            />
          </div>
          <Slider
            label="Rot offset"
            value={layer.rotationOffset}
            min={-0.2}
            max={0.2}
            step={0.001}
            unit=" rad"
            defaultValue={LAYER_DEFAULTS.rotationOffset}
            onChange={(rotationOffset) => updateLayer(layer.id, { rotationOffset })}
          />
        </>
      )}
      {layer.type === 'concentric-polygons' && (
        <Slider
          label="Sides"
          value={layer.sides}
          min={3}
          max={16}
          step={1}
          defaultValue={LAYER_DEFAULTS.sides}
          onChange={(sides) => updateLayer(layer.id, { sides })}
        />
      )}
    </div>
  );
}

function Chrome({ onToggle }: { onToggle: () => void }) {
  const zoom = useProjectStore((s) => s.camera.zoom);
  const backgroundColor = useProjectStore((s) => s.backgroundColor);
  const resetView = useProjectStore((s) => s.resetView);
  const setBackgroundColor = useProjectStore((s) => s.setBackgroundColor);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5">
      <span className="flex items-center gap-1.5 py-0.5 pr-1 pl-0.5 text-[var(--text-primary)]">
        <Mark size={18} />
        <span className="text-[13px] font-semibold tracking-[-0.03em]">Moire</span>
      </span>
      <span className="flex-1" />
      <button
        type="button"
        title="Reset view"
        onClick={resetView}
        onMouseDown={(e) => e.currentTarget.blur()}
        className="rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ColorField value={backgroundColor} onChange={setBackgroundColor} />
      <IconButton
        icon={theme === 'dark' ? Sun03Icon : Moon02Icon}
        label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        onClick={toggleTheme}
        size={14}
        dense
      />
      <IconButton
        icon={KeyboardIcon}
        label="Shortcuts"
        onClick={() => window.dispatchEvent(new Event('moire-shortcuts'))}
        size={14}
        dense
      />
      <IconButton icon={ImageDownloadIcon} label="Export PNG" onClick={() => void savePng()} size={14} dense />
      <IconButton icon={ArrowLeft01Icon} label="Hide studio" onClick={onToggle} size={14} dense />
    </div>
  );
}

export function Studio() {
  const [open, setOpen] = useState(readOpen);

  useEffect(() => {
    try {
      localStorage.setItem(STUDIO_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    const onToggle = () => setOpen((prev) => !prev);
    window.addEventListener('moire-inspector', onToggle);
    window.addEventListener('moire-studio', onToggle);
    return () => {
      window.removeEventListener('moire-inspector', onToggle);
      window.removeEventListener('moire-studio', onToggle);
    };
  }, []);

  if (!open) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20">
        <button
          type="button"
          title="Open studio"
          onClick={() => setOpen(true)}
          className="hud-card pointer-events-auto grid size-9 place-items-center text-[var(--text-primary)]"
        >
          <Mark size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-y-3 left-3 z-20 flex max-h-[calc(100dvh-1.5rem)]">
      <aside
        className="hud-card pointer-events-auto flex h-fit max-h-full w-[17.5rem] flex-col overflow-hidden"
        onWheel={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-1.5 py-1">
          <Chrome onToggle={() => setOpen(false)} />
        </header>

        <Rule />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2">
          <div className="grid gap-2.5">
            <LayerStack />
            <Rule />
            <LayerFields />
          </div>
        </div>
      </aside>
    </div>
  );
}
