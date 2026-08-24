import { useEffect, useState, type ReactNode } from 'react';
import {
  PaintBoardIcon,
  Rotate01Icon,
  ShapesIcon,
  SidebarRightIcon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { LAYER_DEFAULTS, PATTERN_META, isConcentric } from '../types/moire';
import { useProjectStore, useSelectedLayer } from '../store/project';
import { PATTERN_ICONS } from './patternIcons';
import { ColorField } from './ui/ColorField';
import { Icon, type HugeIcon } from './ui/Icon';
import { IconButton } from './ui/IconButton';
import { Slider } from './ui/Slider';

const INSPECTOR_KEY = 'moire-inspector-open';

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
    <section className="grid gap-2">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <Icon icon={icon} size={12} />
        <span className="text-[9px] uppercase tracking-[0.14em]">{title}</span>
      </div>
      {children}
    </section>
  );
}

export function Inspector() {
  const layer = useSelectedLayer();
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const renameLayer = useProjectStore((s) => s.renameLayer);
  const setLayerType = useProjectStore((s) => s.setLayerType);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(INSPECTOR_KEY) !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(INSPECTOR_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    const onToggle = () => setOpen((prev) => !prev);
    window.addEventListener('moire-inspector', onToggle);
    return () => window.removeEventListener('moire-inspector', onToggle);
  }, []);

  if (!layer) return null;

  const commitName = () => {
    const next = draftName.trim();
    if (next) renameLayer(layer.id, next);
    setEditingName(false);
  };

  const spacingDefault = layer.type === 'straight-lines' ? LAYER_DEFAULTS.spacingLines : LAYER_DEFAULTS.spacing;

  if (!open) {
    return (
      <div className="absolute top-16 right-4 z-20">
        <div className="hud-card p-1">
          <IconButton
            icon={SlidersHorizontalIcon}
            label="Open inspector"
            onClick={() => setOpen(true)}
          />
        </div>
      </div>
    );
  }

  return (
    <aside className="hud-card absolute top-16 right-4 z-20 w-64 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {editingName ? (
            <input
              className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
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
              className="truncate text-sm text-[var(--text-primary)]"
              onDoubleClick={() => {
                setDraftName(layer.name);
                setEditingName(true);
              }}
            >
              {layer.name}
            </button>
          )}
          <div className="text-[10px] text-[var(--text-muted)]">
            {PATTERN_META.find((item) => item.id === layer.type)?.label}
          </div>
        </div>
        <IconButton
          icon={SidebarRightIcon}
          label="Hide inspector"
          onClick={() => setOpen(false)}
          size={14}
        />
      </div>

      <div className="mb-3 flex justify-between gap-0.5">
        {PATTERN_META.map((pattern) => (
          <IconButton
            key={pattern.id}
            icon={PATTERN_ICONS[pattern.id]}
            label={pattern.label}
            active={layer.type === pattern.id}
            onClick={() => setLayerType(layer.id, pattern.id)}
          />
        ))}
      </div>

      <div className="grid gap-3">
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
        </Section>

        <Section icon={ShapesIcon} title="Field">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
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
        </Section>
      </div>
    </aside>
  );
}
