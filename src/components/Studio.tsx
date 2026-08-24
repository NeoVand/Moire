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
import {
  LAYER_DEFAULTS,
  MAX_LAYERS,
  PATTERN_FAMILIES,
  PATTERN_META,
  familyOf,
  isConcentric,
  isGrid,
  type PatternFamily,
  type PatternType,
} from '../types/moire';
import { useProjectStore, useSelectedLayer } from '../store/project';
import { FAMILY_ICONS, PATTERN_ICONS } from './patternIcons';
import { ColorField } from './ui/ColorField';
import { Icon, type HugeIcon } from './ui/Icon';
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

function ShapeChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: HugeIcon;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`grid h-8 flex-1 place-items-center rounded-md ${
        active
          ? 'text-[var(--text-primary)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-primary)_45%,transparent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon icon={icon} size={16} />
    </button>
  );
}

function PatternPicker({
  type,
  onChange,
}: {
  type: PatternType;
  onChange: (type: PatternType) => void;
}) {
  const lastByFamily = useRef<Partial<Record<PatternFamily, PatternType>>>({});
  const family = familyOf(type);
  lastByFamily.current[family] = type;
  const variants = PATTERN_FAMILIES.find((item) => item.id === family)?.types ?? [];

  return (
    <div className="grid gap-0.5">
      <div className="flex gap-0.5">
        {PATTERN_FAMILIES.map((item) => (
          <ShapeChip
            key={item.id}
            label={item.label}
            icon={FAMILY_ICONS[item.id]}
            active={item.id === family}
            onClick={() => {
              if (item.id === family) return;
              onChange(lastByFamily.current[item.id] ?? item.types[0]);
            }}
          />
        ))}
      </div>
      {variants.length > 1 && (
        <div className="flex gap-0.5">
          {variants.map((id) => (
            <ShapeChip
              key={id}
              label={PATTERN_META.find((item) => item.id === id)?.label ?? id}
              icon={PATTERN_ICONS[id]}
              active={type === id}
              onClick={() => onChange(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LayerName({
  name,
  onCommit,
  onSelect,
  editOn = 'double',
  className = 'text-[12px]',
}: {
  name: string;
  onCommit: (name: string) => void;
  onSelect?: () => void;
  editOn?: 'click' | 'double';
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) onCommit(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className={`quiet-edit min-w-0 flex-1 bg-transparent ${className}`}
        value={draft}
        autoFocus
        spellCheck={false}
        aria-label="Layer name"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(name);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`quiet-edit min-w-0 flex-1 truncate text-left ${className}`}
      onClick={editOn === 'click' ? startEdit : onSelect}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      }}
    >
      {name}
    </button>
  );
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
  const renameLayer = useProjectStore((s) => s.renameLayer);
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
              {PATTERN_FAMILIES.map((family) => (
                <IconButton
                  key={family.id}
                  icon={FAMILY_ICONS[family.id]}
                  label={`Add ${family.label.toLowerCase()}`}
                  onClick={() => spawn(family.types[0])}
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
              <span
                draggable
                onDragStart={() => setDragIndex(index)}
                className="cursor-grab text-current opacity-30 active:cursor-grabbing"
              >
                <Icon icon={DragDropVerticalIcon} size={13} />
              </span>
              <div className="flex min-w-0 flex-1 items-center py-1 pr-1">
                <LayerName
                  name={layer.name}
                  onSelect={() => selectLayer(layer.id)}
                  onCommit={(name) => renameLayer(layer.id, name)}
                />
              </div>
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

  if (!layer) return null;

  const family = familyOf(layer.type);
  const familyMeta = PATTERN_FAMILIES.find((item) => item.id === family);
  const typeLabel = PATTERN_META.find((item) => item.id === layer.type)?.label;
  const spacingDefault = isGrid(layer.type)
    ? LAYER_DEFAULTS.spacingGrid
    : layer.type === 'straight-lines'
      ? LAYER_DEFAULTS.spacingLines
      : LAYER_DEFAULTS.spacing;

  return (
    <div className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <LayerName
          name={layer.name}
          editOn="click"
          className="text-[12px] font-medium text-[var(--text-primary)]"
          onCommit={(name) => renameLayer(layer.id, name)}
        />
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
          {familyMeta && familyMeta.types.length > 1
            ? `${familyMeta.label} · ${typeLabel}`
            : (familyMeta?.label ?? typeLabel)}
        </span>
      </div>

      <PatternPicker type={layer.type} onChange={(type) => setLayerType(layer.id, type)} />

      <ColorField
        label="Stroke"
        value={layer.color}
        onChange={(color) => updateLayer(layer.id, { color })}
        opacity={layer.opacity}
        onOpacityChange={(opacity) => updateLayer(layer.id, { opacity })}
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
      {isGrid(layer.type) ? (
        <>
          <Slider
            label="Scale X"
            value={layer.scale?.x ?? LAYER_DEFAULTS.scaleX}
            min={0.2}
            max={5}
            step={0.01}
            defaultValue={LAYER_DEFAULTS.scaleX}
            onChange={(x) => updateLayer(layer.id, { scale: { x } })}
          />
          <Slider
            label="Scale Y"
            value={layer.scale?.y ?? LAYER_DEFAULTS.scaleY}
            min={0.2}
            max={5}
            step={0.01}
            defaultValue={LAYER_DEFAULTS.scaleY}
            onChange={(y) => updateLayer(layer.id, { scale: { y } })}
          />
          <Slider
            label="Vertices"
            value={layer.vertexSize ?? LAYER_DEFAULTS.vertexSize}
            min={0}
            max={16}
            step={0.1}
            defaultValue={LAYER_DEFAULTS.vertexSize}
            onChange={(vertexSize) => updateLayer(layer.id, { vertexSize })}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--text-secondary)]">Edges</span>
            <button
              type="button"
              className={`quiet-edit rounded-md px-2 py-0.5 text-[11px] ${
                layer.drawEdges !== false
                  ? 'text-[var(--text-primary)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-primary)_40%,transparent)]'
                  : 'text-[var(--text-muted)]'
              }`}
              onClick={() => updateLayer(layer.id, { drawEdges: layer.drawEdges === false })}
            >
              {layer.drawEdges === false ? 'Off' : 'On'}
            </button>
          </div>
        </>
      ) : (
        <Slider
          label={isConcentric(layer.type) ? 'Start' : 'Phase'}
          value={layer.phase}
          min={0}
          max={isConcentric(layer.type) ? 400 : Math.max(layer.spacing, 1)}
          step={1}
          defaultValue={LAYER_DEFAULTS.phase}
          onChange={(phase) => updateLayer(layer.id, { phase })}
        />
      )}
      {isGrid(layer.type) ? null : layer.type === 'straight-lines' ? (
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
      <button
        type="button"
        title="About Moiré"
        onClick={() => window.dispatchEvent(new Event('moire-about'))}
        className="flex items-center gap-1.5 rounded-md pr-1 text-[var(--text-primary)] hover:opacity-80"
      >
        <Mark size={22} />
        <span className="text-[13px] font-semibold tracking-[-0.03em]">Moiré</span>
      </button>
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
      <div className="pointer-events-none absolute top-3 left-5 z-20">
        <button
          type="button"
          title="Open studio"
          onClick={() => setOpen(true)}
          className="hud-card pointer-events-auto grid size-9 place-items-center text-[var(--text-primary)]"
        >
          <Mark size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-3 right-auto bottom-5 left-5 z-20 flex max-h-[calc(100dvh-2rem)]">
      <aside
        className="hud-card pointer-events-auto flex h-fit max-h-full w-[18.5rem] flex-col overflow-hidden"
        onWheel={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-4 pt-3 pb-2">
          <Chrome onToggle={() => setOpen(false)} />
        </header>

        <Rule />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
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
