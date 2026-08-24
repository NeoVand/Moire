import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { hexToHsv, hsvToHex, hsvToRgb, type Hsv } from '../../lib/color';

interface ColorFieldProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
}

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
  applyFromPointer(event, el, onAt);
  const move = (next: PointerEvent) => applyFromPointer(next, el, onAt);
  const up = () => {
    el.releasePointerCapture(event.pointerId);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function Swatch({
  hex,
  opacity,
  title,
  expanded,
  onClick,
}: {
  hex: string;
  opacity: number;
  title: string;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      onClick={onClick}
      className="relative size-6 overflow-hidden rounded border border-[var(--border)]"
    >
      <span className="checkerboard-swatch absolute inset-0" />
      <span className="absolute inset-0" style={{ background: hex, opacity }} />
    </button>
  );
}

function Thumb({ left, top }: { left: string; top?: string }) {
  return (
    <span
      className="pointer-events-none absolute z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
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
  return (
    <div className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full">
        {children}
      </div>
      <div
        className="absolute inset-y-0 inset-x-[7px] cursor-ew-resize"
        onPointerDown={(e) => dragOn(e, (nx) => onAt(nx))}
      />
      <Thumb left={`calc(7px + ${clamp01(value)} * (100% - 14px))`} />
    </div>
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
  const rootRef = useRef<HTMLDivElement>(null);
  const hasAlpha = opacity !== undefined && !!onOpacityChange;
  const alpha = hasAlpha ? opacity : 1;
  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const solidHex = hsvToHex(hsv);
  const rgb = hsvToRgb(hsv);

  useEffect(() => {
    const next = hexToHsv(value);
    if (next.s > 0.02 && next.v > 0.02) setHsv(next);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  return (
    <div ref={rootRef} className="relative flex items-center justify-between gap-3">
      {label && (
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      )}
      <Swatch
        hex={value}
        opacity={alpha}
        title={label ?? value}
        expanded={open}
        onClick={() => setOpen((next) => !next)}
      />
      {open && (
        <div
          className="absolute top-full right-0 z-30 mt-1.5 w-[13.5rem] rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3.5 shadow-[var(--hud-shadow)]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="grid gap-2.5">
            <div
              className="relative h-[7.25rem] cursor-crosshair overflow-hidden rounded-lg"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})`,
              }}
              onPointerDown={(e) =>
                dragOn(e, (nx, ny) => commit({ ...hsv, s: nx, v: 1 - ny }))
              }
            >
              <Thumb left={`${hsv.s * 100}%`} top={`${(1 - hsv.v) * 100}%`} />
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
              <Slider
                value={alpha}
                onAt={(nx) => onOpacityChange(Math.round(nx * 100) / 100)}
              >
                <span className="checkerboard absolute inset-0" />
                <span
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(to right, ${rgbCss(rgb, 0)}, ${rgbCss(rgb, 1)})`,
                  }}
                />
              </Slider>
            )}
            <div className="flex items-center gap-2 px-0.5">
              <span className="relative size-6 overflow-hidden rounded-md border border-[var(--border)]">
                <span className="checkerboard-swatch absolute inset-0" />
                <span className="absolute inset-0" style={{ background: solidHex, opacity: alpha }} />
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {solidHex}
                {hasAlpha ? ` · ${Math.round(alpha * 100)}%` : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
