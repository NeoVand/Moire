import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { hexToHsv, hsvToHex, hsvToRgb, parseHex, type Hsv } from '../../lib/color';
import { Popover } from './Popover';

interface ColorFieldProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
}

const PANEL_WIDTH = 216;
const THUMB = 8;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function rgbCss({ r, g, b }: { r: number; g: number; b: number }, alpha = 1) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function applyFromPointer(
  event: PointerEvent | ReactPointerEvent,
  el: HTMLElement,
  onAt: (nx: number, ny: number) => void
) {
  const rect = el.getBoundingClientRect();
  onAt(clamp01((event.clientX - rect.left) / rect.width), clamp01((event.clientY - rect.top) / rect.height));
}

function dragOn(
  event: ReactPointerEvent<HTMLElement>,
  onAt: (nx: number, ny: number) => void
) {
  event.preventDefault();
  event.stopPropagation();
  const el = event.currentTarget;
  el.setPointerCapture(event.pointerId);
  let last = { x: event.clientX, y: event.clientY, nx: 0, ny: 0 };
  let origin: { x: number; y: number; nx: number; ny: number } | null = null;
  applyFromPointer(event, el, (nx, ny) => {
    last = { x: event.clientX, y: event.clientY, nx, ny };
    origin = event.shiftKey ? last : null;
    onAt(nx, ny);
  });
  const apply = (clientX: number, clientY: number, shift: boolean) => {
    const rect = el.getBoundingClientRect();
    last = { ...last, x: clientX, y: clientY };
    if (shift) {
      if (!origin) origin = last;
      last = {
        ...last,
        nx: clamp01(origin.nx + ((clientX - origin.x) / Math.max(rect.width, 1)) * 0.12),
        ny: clamp01(origin.ny + ((clientY - origin.y) / Math.max(rect.height, 1)) * 0.12),
      };
      onAt(last.nx, last.ny);
      return;
    }
    origin = last;
    applyFromPointer({ clientX, clientY } as PointerEvent, el, (nx, ny) => {
      last = { ...last, nx, ny };
      onAt(nx, ny);
    });
  };
  const move = (next: PointerEvent) => apply(next.clientX, next.clientY, next.shiftKey);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Shift') return;
    origin = { ...last };
  };
  const up = () => {
    el.releasePointerCapture(event.pointerId);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
}

function Swatch({
  hex,
  opacity,
  title,
  expanded,
  onClick,
  buttonRef,
}: {
  hex: string;
  opacity: number;
  title: string;
  expanded?: boolean;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      onClick={onClick}
      className="relative size-5 shrink-0 rounded-full shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_45%,transparent)]"
    >
      <span className="absolute inset-0 overflow-hidden rounded-full">
        <span className="checkerboard-swatch absolute inset-0" />
        <span className="absolute inset-0" style={{ background: hex, opacity }} />
      </span>
    </button>
  );
}

function Thumb({ left, top }: { left: string; top?: string }) {
  return (
    <span
      className="pointer-events-none absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-white/25 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
      style={{ left, top: top ?? '50%' }}
    />
  );
}

function Slider({
  value,
  onAt,
  children,
}: {
  value: number;
  onAt: (nx: number) => void;
  children: ReactNode;
}) {
  const inset = THUMB / 2;
  return (
    <div className="relative h-4">
      <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full">
        {children}
      </div>
      <div
        className="absolute inset-y-0 cursor-ew-resize"
        style={{ left: inset, right: inset }}
        onPointerDown={(e) => dragOn(e, (nx) => onAt(nx))}
      />
      <Thumb left={`calc(${inset}px + ${clamp01(value)} * (100% - ${THUMB}px))`} />
    </div>
  );
}

function HexField({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    const next = parseHex(draft);
    if (next) onChange(next);
    setEditing(false);
  };

  return (
    <input
      className="quiet-edit w-[4.6rem] bg-transparent font-mono text-[10px] uppercase tabular-nums text-[var(--text-muted)]"
      value={draft}
      spellCheck={false}
      aria-label="Hex color"
      onFocus={(e) => {
        setEditing(true);
        setDraft(value);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setEditing(true);
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function ColorField({
  label,
  value,
  onChange,
  opacity,
  onOpacityChange,
}: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasAlpha = opacity !== undefined && !!onOpacityChange;
  const alpha = hasAlpha ? opacity : 1;
  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const solidHex = hsvToHex(hsv);
  const rgb = hsvToRgb(hsv);

  useEffect(() => {
    const next = hexToHsv(value);
    if (next.s > 0.02 && next.v > 0.02) setHsv(next);
  }, [value]);

  const commit = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  const commitHex = (color: string) => {
    setHsv(hexToHsv(color));
    onChange(color);
  };

  return (
    <div className="relative flex items-center justify-between gap-3">
      {label && (
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      )}
      <Swatch
        buttonRef={triggerRef}
        hex={value}
        opacity={alpha}
        title={label ?? value}
        expanded={open}
        onClick={() => setOpen((next) => !next)}
      />
      <Popover open={open} width={PANEL_WIDTH} triggerRef={triggerRef} onClose={() => setOpen(false)}>
        <div className="grid gap-2.5">
          <div className="relative h-[7.25rem]">
            <div
              className="absolute inset-0 overflow-hidden rounded-lg"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})`,
              }}
            />
            <div
              className="absolute inset-[5px] cursor-crosshair"
              onPointerDown={(e) => dragOn(e, (nx, ny) => commit({ ...hsv, s: nx, v: 1 - ny }))}
            />
            <Thumb
              left={`calc(5px + ${hsv.s} * (100% - 10px))`}
              top={`calc(5px + ${1 - hsv.v} * (100% - 10px))`}
            />
          </div>
          <Slider value={hsv.h / 360} onAt={(nx) => commit({ ...hsv, h: nx * 360 })}>
            <span
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
            />
          </Slider>
          {hasAlpha && (
            <Slider value={alpha} onAt={(nx) => onOpacityChange(Math.round(nx * 100) / 100)}>
              <span className="checkerboard absolute inset-0" />
              <span
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(to right, ${rgbCss(rgb, 0)}, ${rgbCss(rgb, 1)})`,
                }}
              />
            </Slider>
          )}
          <div className="flex items-center gap-2">
            <span className="relative size-5 overflow-hidden rounded-full shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_45%,transparent)]">
              <span className="checkerboard-swatch absolute inset-0" />
              <span className="absolute inset-0" style={{ background: solidHex, opacity: alpha }} />
            </span>
            <HexField value={solidHex} onChange={commitHex} />
            {hasAlpha && (
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {Math.round(alpha * 100)}%
              </span>
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}
