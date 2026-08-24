import { useEffect, useRef, useState } from 'react';
import { Slider } from './Slider';

interface ColorFieldProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  opacityDefault?: number;
}

export function ColorField({
  label,
  value,
  onChange,
  opacity,
  onOpacityChange,
  opacityDefault = 1,
}: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasAlpha = opacity !== undefined && onOpacityChange;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const swatch = (
    <button
      type="button"
      title={label ?? value}
      aria-label={label ?? 'Color'}
      aria-expanded={hasAlpha ? open : undefined}
      onClick={() => {
        if (hasAlpha) setOpen((next) => !next);
      }}
      className="relative size-5 overflow-hidden rounded border border-[var(--border)]"
      style={
        hasAlpha
          ? {
              backgroundImage:
                'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
              backgroundSize: '6px 6px',
              backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
            }
          : undefined
      }
    >
      <span
        className="absolute inset-0"
        style={{ background: value, opacity: hasAlpha ? opacity : 1 }}
      />
    </button>
  );

  if (!hasAlpha) {
    return (
      <label className="flex items-center justify-between gap-3">
        {label && (
          <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
        )}
        <input
          type="color"
          value={value}
          title={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-5 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
        />
      </label>
    );
  }

  return (
    <div ref={rootRef} className="relative flex items-center justify-between gap-3">
      {label && (
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      )}
      {swatch}
      {open && (
        <div className="hud-card absolute top-full right-0 z-30 mt-1 w-[11.5rem] p-2.5">
          <div className="grid gap-2.5">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-16 w-full cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
            />
            <Slider
              label="Opacity"
              value={opacity}
              min={0}
              max={1}
              step={0.01}
              defaultValue={opacityDefault}
              onChange={onOpacityChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
