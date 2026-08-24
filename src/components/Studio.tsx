import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Add01Icon,
  ArrowLeft01Icon,
  ColorsIcon,
  Copy01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  GeometricShapes01Icon,
  KeyboardIcon,
  Moon02Icon,
  PaintBoardIcon,
  Rotate01Icon,
  ShapesIcon,
  Sun03Icon,
  ViewIcon,
  ViewOffSlashIcon,
  ZoomInAreaIcon,
} from '@hugeicons/core-free-icons';
import { useTheme } from '../hooks/useTheme';
import { LAYER_DEFAULTS, MAX_LAYERS, PATTERN_META, isConcentric, type PatternType } from '../types/moire';
import { useProjectStore, useSelectedLayer } from '../store/project';
import { PATTERN_ICONS } from './patternIcons';
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

function Mark() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[var(--text-primary)] text-[var(--bg-primary)]">
      <Icon icon={GeometricShapes01Icon} size={20} />
    </span>
  );
}

function Rule() {
  return <div className="h-px bg-[var(--border)]" />;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: HugeIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Icon icon={icon} size={14} />
        <span className="text-[11px] font-medium uppercase tracking-[0.16em]">{title}</span>
      </div>
      {children}
    </section>
  );
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
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Layers
        </span>
        <div ref={addRef} className="relative">
          <IconButton
            icon={Add01Icon}
            label="Add layer"
            onClick={() => setAddOpen((open) => !open)}
            disabled={layers.length >= MAX_LAYERS}
            active={addOpen}
          />
          {addOpen && layers.length < MAX_LAYERS && (
            <div className="hud-card absolute top-full right-0 z-30 mt-1 flex gap-0.5 p-1">
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
      <div className="grid gap-1">
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
              className={`flex items-center gap-1 rounded-xl px-1.5 py-1 text-[var(--text-primary)] ${
                selected
                  ? 'bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] ring-1 ring-[var(--text-primary)]/20'
                  : 'hover:bg-[var(--bg-hover)]'
              } ${!layer.visible ? 'opacity-45' : ''} ${dragIndex === index ? 'opacity-35' : ''}`}
            >
              <span className="text-current opacity-35">
                <Icon icon={DragDropVerticalIcon} size={14} />
              </span>
              <button
                type="button"
                onClick={() => selectLayer(layer.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-1.5 text-left"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full border border-current"
                  style={{ background: layer.visible ? layer.color : 'transparent' }}
                />
                <span className="min-w-0 truncate text-[13px]">{layer.name}</span>
                <span className="ml-auto opacity-55" title={label}>
                  <Icon icon={PATTERN_ICONS[layer.type]} size={15} />
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
    <div className="grid gap-6">
      <div>
        {editingName ? (
          <input
            className="w-full bg-transparent text-[15px] font-medium text-[var(--text-primary)] outline-none"
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
            className="text-[15px] font-medium text-[var(--text-primary)]"
            onDoubleClick={() => {
              setDraftName(layer.name);
              setEditingName(true);
            }}
          >
            {layer.name}
          </button>
        )}
        <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
          {PATTERN_META.find((item) => item.id === layer.type)?.label}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {PATTERN_META.map((pattern) => {
          const active = layer.type === pattern.id;
          return (
            <button
              key={pattern.id}
              type="button"
              title={pattern.label}
              onClick={() => setLayerType(layer.id, pattern.id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl py-2.5 ${
                active
                  ? 'bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-primary)] ring-1 ring-[var(--text-primary)]/20'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon icon={PATTERN_ICONS[pattern.id]} size={18} />
              <span className="text-[10px] tracking-wide">{pattern.label}</span>
            </button>
          );
        })}
      </div>

      <Section icon={PaintBoardIcon} title="Look">
        <ColorField
          label="Stroke"
          value={layer.color}
          onChange={(color) => updateLayer(layer.id, { color })}
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
      </Section>

      <Section icon={Rotate01Icon} title="Pose">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
      </Section>

      <Section icon={ShapesIcon} title="Field">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
            label="Thickness"
            value={layer.thickness}
            min={0.2}
            max={20}
            step={0.1}
            defaultValue={LAYER_DEFAULTS.thickness}
            onChange={(thickness) => updateLayer(layer.id, { thickness })}
          />
        </div>
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
      </Section>
    </div>
  );
}

export function Studio() {
  const zoom = useProjectStore((s) => s.camera.zoom);
  const backgroundColor = useProjectStore((s) => s.backgroundColor);
  const resetView = useProjectStore((s) => s.resetView);
  const setBackgroundColor = useProjectStore((s) => s.setBackgroundColor);
  const { theme, toggleTheme } = useTheme();
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
      <div className="pointer-events-none absolute top-4 left-4 z-20">
        <div className="hud-card pointer-events-auto flex items-center gap-1 p-1.5 pr-2">
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-xl py-0.5 pr-1 pl-0.5"
            onClick={() => setOpen(true)}
            title="Open studio"
          >
            <Mark />
            <span className="text-[16px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              Moire
            </span>
          </button>
          <button
            type="button"
            title="Reset view"
            onClick={resetView}
            onMouseDown={(e) => e.currentTarget.blur()}
            className="rounded-lg px-2 py-1.5 font-mono text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-y-4 left-4 z-20 flex">
      <aside className="hud-card pointer-events-auto flex w-[22rem] flex-col overflow-hidden">
        <header className="flex items-center gap-3.5 px-5 pt-5 pb-4">
          <Mark />
          <div className="min-w-0 flex-1">
            <div className="text-[19px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
              Moire
            </div>
            <div className="text-[12px] text-[var(--text-muted)]">Interference fields</div>
          </div>
          <IconButton
            icon={ArrowLeft01Icon}
            label="Hide studio"
            onClick={() => setOpen(false)}
          />
        </header>

        <div className="flex items-center gap-1 px-5 pb-4">
          <button
            type="button"
            title="Reset view"
            onClick={resetView}
            onMouseDown={(e) => e.currentTarget.blur()}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 font-mono text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <Icon icon={ZoomInAreaIcon} size={16} />
            {Math.round(zoom * 100)}%
          </button>
          <span className="flex flex-1 items-center gap-2 px-2">
            <span className="text-[var(--text-muted)]">
              <Icon icon={ColorsIcon} size={16} />
            </span>
            <ColorField value={backgroundColor} onChange={setBackgroundColor} />
          </span>
          <IconButton
            icon={theme === 'dark' ? Sun03Icon : Moon02Icon}
            label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            onClick={toggleTheme}
          />
          <IconButton
            icon={KeyboardIcon}
            label="Shortcuts"
            onClick={() => window.dispatchEvent(new Event('moire-shortcuts'))}
          />
        </div>

        <Rule />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-7">
            <LayerStack />
            <Rule />
            <LayerFields />
          </div>
        </div>
      </aside>
    </div>
  );
}
