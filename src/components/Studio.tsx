import { useEffect, useRef, useState, type Ref } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowLeft01Icon,
  AudioWave02Icon,
  Copy01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  ImageDownloadIcon,
  JupiterIcon,
  KeyboardIcon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons';
import {
  LAYER_DEFAULTS,
  MAX_LAYERS,
  PATTERN_FAMILIES,
  PATTERN_META,
  familyOf,
  hasField,
  isConcentric,
  isCurves,
  isGrid,
  isRadialLines,
  type PatternFamily,
  type PatternType,
} from '../types/moire';
import { VIEW_DEFAULTS, useProjectStore, useSelectedLayer } from '../store/project';
import { ExportDialog } from './ExportDialog';
import { FieldEditor } from './FieldEditor';
import { FAMILY_ICONS, PATTERN_ICONS } from './patternIcons';
import { ColorField } from './ui/ColorField';
import { FloatingPanel } from './ui/FloatingPanel';
import { InfoTip } from './ui/Tip';
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
  iconClassName,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: HugeIcon;
  iconClassName?: string;
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
      <span className={iconClassName ? `inline-block ${iconClassName}` : undefined}>
        <Icon icon={icon} size={16} />
      </span>
    </button>
  );
}

/**
 * The envelope, in the header beside zoom and background: it is a way of looking
 * at the whole stack, not a property of a layer.
 *
 * The view is the same stack averaged over one period of the phase every layer
 * shares — the fringe system with the carrier taken out. Because the average is
 * over phase and not over space, nothing is blurred and the result is the same at
 * any zoom. Contrast lives behind the icon the way a colour lives behind its
 * swatch, so the header stays one row of icons.
 */
function EnvelopeControl() {
  const envelope = useProjectStore((s) => s.view.envelope);
  const view = useProjectStore((s) => s.view);
  const setView = useProjectStore((s) => s.setView);
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        icon={AudioWave02Icon}
        label={envelope ? 'Envelope · right-click for options' : 'Envelope'}
        active={envelope || view.ratio}
        onClick={() => {
          setView({ envelope: !envelope });
          setOpen(!envelope);
        }}
        onAlternate={() => {
          if (!envelope && !view.ratio) setView({ envelope: true });
          setOpen(true);
        }}
        size={14}
        dense
      />
      {open && (
        <FloatingPanel
          id="envelope"
          width={236}
          defaultPosition={{ x: window.innerWidth - 260, y: 56 }}
          onClose={() => setOpen(false)}
          mark={<Icon icon={AudioWave02Icon} size={14} />}
          title="Envelope"
        >
          <div className={`grid gap-3 ${view.ratio ? 'pointer-events-none opacity-40' : ''}`}>
            <Slider
              label="Contrast"
              value={view.envelopeContrast}
              min={1}
              max={12}
              step={0.1}
              defaultValue={VIEW_DEFAULTS.envelopeContrast}
              info="The fringe field is a small excursion about the stack's mean coverage; this expands it until it reads. 1 shows the raw average."
              onChange={(envelopeContrast) => setView({ envelopeContrast })}
            />
            <Slider
              label="Sweep"
              value={view.envelopeSweep}
              min={0}
              max={3}
              step={0.05}
              defaultValue={VIEW_DEFAULTS.envelopeSweep}
              info="How many of its own periods each family is averaged over. 1 removes the carrier exactly; below it the pattern fades back in; beyond it higher-order beats smooth away too."
              onChange={(envelopeSweep) => setView({ envelopeSweep })}
            />
            <Slider
              label="Exposure"
              value={view.envelopeLift}
              min={-0.5}
              max={0.5}
              step={0.01}
              defaultValue={VIEW_DEFAULTS.envelopeLift}
              info="Flat brightness shift after the contrast expansion, for centring the fringes on the page."
              onChange={(envelopeLift) => setView({ envelopeLift })}
            />
            <Slider
              label="Quality"
              value={view.envelopeTaps}
              min={4}
              max={64}
              step={1}
              unit=" taps"
              defaultValue={VIEW_DEFAULTS.envelopeTaps}
              info="Averaging samples per pixel. Two dozen is exact in practice; fewer is faster and grainier."
              onChange={(envelopeTaps) => setView({ envelopeTaps })}
            />
            <Slider
              label="Mask"
              value={view.envelopeMask}
              min={0}
              max={1}
              step={0.05}
              defaultValue={VIEW_DEFAULTS.envelopeMask}
              info="Fades the view to its mean where the two carriers are too far apart to fringe at all. Off shows the honest average everywhere."
              onChange={(envelopeMask) => setView({ envelopeMask })}
            />
          </div>
          <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                Fringe ratio
                <InfoTip
                  text="A map of where fringes can exist: dark where the two topmost layers' carriers are close enough to beat, light where they are too different to interfere. Check it before committing to parameters."
                  label="Fringe ratio"
                />
              </span>
              <button
                type="button"
                className={`quiet-edit rounded-md px-2 py-0.5 text-[11px] ${
                  view.ratio
                    ? 'text-[var(--text-primary)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-primary)_40%,transparent)]'
                    : 'text-[var(--text-muted)]'
                }`}
                onClick={() => setView({ ratio: !view.ratio })}
              >
                {view.ratio ? 'On' : 'Off'}
              </button>
            </div>
            {view.ratio && (
              <>
                <Slider
                  label="Overlay"
                  value={view.ratioBlend}
                  min={0.2}
                  max={1}
                  step={0.01}
                  defaultValue={VIEW_DEFAULTS.ratioBlend}
                  info="How much the map covers the drawing. 1 replaces the picture; less lets you see where on it fringes will live."
                  onChange={(ratioBlend) => setView({ ratioBlend })}
                />
                <Slider
                  label="Threshold"
                  value={view.ratioThreshold}
                  min={0.05}
                  max={0.6}
                  step={0.01}
                  defaultValue={VIEW_DEFAULTS.ratioThreshold}
                  info="Where the map draws its boundary. ¼ is the theory's line — move it only to read the gradations either side."
                  onChange={(ratioThreshold) => setView({ ratioThreshold })}
                />
              </>
            )}
          </div>
        </FloatingPanel>
      )}
    </>
  );
}

/**
 * The calligraphic f on a layer row: a field displaces that layer's index, and
 * against an unmodulated twin the fringes become the field's level sets. Filled
 * when the layer carries one.
 */
function FieldMark({
  active,
  muted,
  onClick,
  buttonRef,
}: {
  active: boolean;
  /** A field is present but switched off: filled, in the muted ink. */
  muted?: boolean;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const title = active ? 'Edit field' : muted ? 'Edit field (off)' : 'Add a field';
  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid size-[22px] shrink-0 place-items-center rounded-md font-serif text-[14px] leading-none italic ${
        active
          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
          : muted
            ? 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
            : 'text-current opacity-45 hover:bg-[var(--bg-hover)] hover:opacity-100'
      }`}
    >
      f
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
              icon={PATTERN_ICONS[id].icon}
              iconClassName={PATTERN_ICONS[id].className}
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

function LayerStack({ onEditField }: { onEditField: (id: string) => void }) {
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
              <FieldMark
                active={hasField(layer)}
                muted={!hasField(layer) && layer.field.source.trim().length > 0}
                onClick={() => {
                  selectLayer(layer.id);
                  onEditField(layer.id);
                }}
              />
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
    : layer.type === 'straight-lines' || isCurves(layer.type)
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
        min={0.01}
        max={20}
        step={0.01}
        defaultValue={LAYER_DEFAULTS.thickness}
        info="Stroke width of every member, in world units — it zooms with the pattern."
        onChange={(thickness) => updateLayer(layer.id, { thickness })}
      />
      {isRadialLines(layer.type) ? (
        <Slider
          label="Count"
          value={layer.lineCount ?? LAYER_DEFAULTS.lineCount}
          min={2}
          max={360}
          step={1}
          defaultValue={LAYER_DEFAULTS.lineCount}
          info="How many lines pass through the centre — the fan's angular pitch is 180° over this."
          onChange={(lineCount) => updateLayer(layer.id, { lineCount })}
        />
      ) : (
        <Slider
          label="Spacing"
          value={layer.spacing}
          min={1}
          max={120}
          step={0.1}
          defaultValue={spacingDefault}
          info="Gap between neighbouring members. Fringes form where two layers' spacings and directions nearly agree."
          onChange={(spacing) => updateLayer(layer.id, { spacing })}
        />
      )}
      {layer.type === 'curve-wave' && (
        <>
          <Slider
            label="Amplitude"
            value={layer.bend ?? LAYER_DEFAULTS.bendWave}
            min={0}
            max={80}
            step={0.1}
            defaultValue={LAYER_DEFAULTS.bendWave}
            info="How far the wave swings from its centreline."
            onChange={(bend) => updateLayer(layer.id, { bend })}
          />
          <Slider
            label="Frequency"
            value={layer.frequency ?? LAYER_DEFAULTS.frequency}
            min={0.1}
            max={8}
            step={0.01}
            defaultValue={LAYER_DEFAULTS.frequency}
            info="How fast the wave oscillates along its length."
            onChange={(frequency) => updateLayer(layer.id, { frequency })}
          />
          <Slider
            label="Phase"
            value={((layer.phase ?? 0) * 180) / Math.PI}
            min={0}
            max={360}
            step={0.1}
            unit="°"
            defaultValue={LAYER_DEFAULTS.phase}
            info="Slides the wave along its own oscillation."
            onChange={(deg) => updateLayer(layer.id, { phase: (deg * Math.PI) / 180 })}
          />
        </>
      )}
      {layer.type === 'curve-parabola' && (
        <Slider
          label="Bend"
          value={layer.bend ?? LAYER_DEFAULTS.bendParabola}
          min={-8}
          max={8}
          step={0.01}
          defaultValue={LAYER_DEFAULTS.bendParabola}
          info="How sharply the parabolas bend; negative flips them."
          onChange={(bend) => updateLayer(layer.id, { bend })}
        />
      )}
      {layer.type === 'curve-spiral' && (
        <Slider
          label="Pitch"
          value={layer.bend ?? LAYER_DEFAULTS.bendSpiral}
          min={0}
          max={80}
          step={0.1}
          defaultValue={LAYER_DEFAULTS.bendSpiral}
          info="Radius the spiral gains per turn."
          onChange={(bend) => updateLayer(layer.id, { bend })}
        />
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Slider
          label="X"
          value={layer.position.x}
          min={-400}
          max={400}
          step={0.1}
          defaultValue={LAYER_DEFAULTS.positionX}
          info="Moves the layer's centre horizontally, in world units."
          onChange={(x) => updateLayer(layer.id, { position: { x } })}
        />
        <Slider
          label="Y"
          value={layer.position.y}
          min={-400}
          max={400}
          step={0.1}
          defaultValue={LAYER_DEFAULTS.positionY}
          info="Moves the layer's centre vertically, in world units."
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
        info="Turns the whole layer about its centre. Small angles between similar layers make the boldest fringes."
        onChange={(rotation) => updateLayer(layer.id, { rotation })}
      />
      {isGrid(layer.type) ? (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Slider
              label="Scale X"
              value={layer.scale?.x ?? LAYER_DEFAULTS.scaleX}
              min={0.2}
              max={5}
              step={0.01}
              defaultValue={LAYER_DEFAULTS.scaleX}
              info="Stretches the lattice along its own x. Strokes keep their true width."
              onChange={(x) => updateLayer(layer.id, { scale: { x } })}
            />
            <Slider
              label="Scale Y"
              value={layer.scale?.y ?? LAYER_DEFAULTS.scaleY}
              min={0.2}
              max={5}
              step={0.01}
              defaultValue={LAYER_DEFAULTS.scaleY}
              info="Stretches the lattice along its own y. Strokes keep their true width."
              onChange={(y) => updateLayer(layer.id, { scale: { y } })}
            />
          </div>
          <Slider
            label="Vertices"
            value={layer.vertexSize ?? LAYER_DEFAULTS.vertexSize}
            min={0}
            max={16}
            step={0.1}
            defaultValue={LAYER_DEFAULTS.vertexSize}
            info="Radius of the dot at every lattice point. Zero hides the dots."
            onChange={(vertexSize) => updateLayer(layer.id, { vertexSize })}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
              Edges
              <InfoTip
                text="Draws the cell edges. A hexagonal grid's edges are hexagon sides, not three line families — the symmetry is different."
                label="Edges"
              />
            </span>
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
      ) : isRadialLines(layer.type) ? (
        <Slider
          label="Start"
          value={layer.phase}
          min={0}
          max={400}
          step={1}
          defaultValue={LAYER_DEFAULTS.phase}
          info="Advances the fan through its own line gap — a rotation, since this family's index is an angle."
          onChange={(phase) => updateLayer(layer.id, { phase })}
        />
      ) : layer.type === 'curve-wave' ? null : (
        <Slider
          label={isConcentric(layer.type) ? 'Start' : 'Phase'}
          value={layer.phase}
          min={0}
          max={isConcentric(layer.type) ? 400 : Math.max(layer.spacing, 1)}
          step={1}
          defaultValue={LAYER_DEFAULTS.phase}
          info={
            isConcentric(layer.type)
              ? 'Where counting starts: grows every ring outward from the centre.'
              : 'Slides the family sideways, up to one spacing.'
          }
          onChange={(phase) => updateLayer(layer.id, { phase })}
        />
      )}
      {isGrid(layer.type) || isRadialLines(layer.type) || isCurves(layer.type) ? null : layer.type === 'straight-lines' ? (
        <Slider
          label="Progressive"
          value={layer.offset.x}
          min={-8}
          max={8}
          step={0.01}
          defaultValue={LAYER_DEFAULTS.offsetX}
          info="Walking drift for lines: line n slides n of these, so the spacing chirps across the family and it beats with itself."
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
              info="Walking drift: ring n is displaced n of these, so the family marches and interferes with itself."
              onChange={(x) => updateLayer(layer.id, { offset: { x } })}
            />
            <Slider
              label="Offset Y"
              value={layer.offset.y}
              min={-4}
              max={4}
              step={0.01}
              defaultValue={LAYER_DEFAULTS.offsetY}
              info="The vertical half of the walking drift."
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
            info="Walking twist: ring n turns n of these. A few hundredths of a radian makes a pinwheel."
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
          info="How many sides each ring polygon has."
          onChange={(sides) => updateLayer(layer.id, { sides })}
        />
      )}
    </div>
  );
}

function ExportControl() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={ImageDownloadIcon}
        label="Export & share"
        active={open}
        onClick={() => setOpen((prev) => !prev)}
        size={14}
        dense
      />
      {open && <ExportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Chrome({ onToggle }: { onToggle: () => void }) {
  const zoom = useProjectStore((s) => s.camera.zoom);
  const backgroundColor = useProjectStore((s) => s.backgroundColor);
  const resetView = useProjectStore((s) => s.resetView);
  const setBackgroundColor = useProjectStore((s) => s.setBackgroundColor);

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
      <EnvelopeControl />
      <IconButton
        icon={KeyboardIcon}
        label="Shortcuts"
        onClick={() => window.dispatchEvent(new Event('moire-shortcuts'))}
        size={14}
        dense
      />
      <ExportControl />
      <IconButton icon={ArrowLeft01Icon} label="Hide studio" onClick={onToggle} size={14} dense />
    </div>
  );
}

export function Studio() {
  const [open, setOpen] = useState(readOpen);
  const [fieldLayerId, setFieldLayerId] = useState<string | null>(null);
  const layers = useProjectStore((s) => s.layers);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const fieldLayer = layers.find((layer) => layer.id === fieldLayerId) ?? null;

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
    <>
      <div className="pointer-events-none absolute top-3 right-auto bottom-5 left-5 z-20 flex max-h-[calc(100dvh-2rem)]">
        <aside
          className="hud-card pointer-events-auto flex h-fit max-h-full w-[18.5rem] flex-col"
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-[inherit]">
            <header className="shrink-0 px-4 pt-3 pb-2">
              <Chrome onToggle={() => setOpen(false)} />
            </header>

            <Rule />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
              <div className="grid gap-2.5">
                <LayerStack onEditField={setFieldLayerId} />
                <Rule />
                <LayerFields />
              </div>
            </div>
          </div>
        </aside>
      </div>
      {fieldLayer && (
        <FieldEditor
          layerName={fieldLayer.name}
          field={fieldLayer.field}
          onChange={(patch) =>
            updateLayer(fieldLayer.id, { field: { ...fieldLayer.field, ...patch } })
          }
          onClose={() => setFieldLayerId(null)}
        />
      )}
    </>
  );
}
