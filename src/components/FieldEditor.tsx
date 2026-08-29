import { useEffect, useMemo, useRef, useState } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { compileField, FIELD_PRESETS, type CompiledField } from '../fields/expr';
import { evalField } from '../fields/evalExpr';
import { FIELD_NONE, type FieldSpec } from '../types/moire';
import { IconButton } from './ui/IconButton';
import { Slider } from './ui/Slider';

/** Side of the preview, in device-independent pixels. */
const PREVIEW = 268;
/** World units the preview spans, so Extent reads as a zoom of the field. */
const PREVIEW_WORLD = 320;

/**
 * What the field will do to a layer, drawn as the fringes it produces.
 *
 * A field displaces the layer's index by `amount * f`, so against an unmodulated
 * twin the fringes are the level sets of that product at integer values. Drawing
 * exactly those level sets — at a width divided by the gradient, as the renderer
 * does — makes the preview the prediction rather than a colour ramp: the curves
 * here are the curves the canvas is about to grow.
 */
function drawPreview(
  ctx: CanvasRenderingContext2D,
  program: CompiledField | null,
  amount: number,
  scale: number,
  dpr: number
) {
  const side = Math.round(PREVIEW * dpr);
  const image = ctx.createImageData(side, side);
  const data = image.data;
  const perPixel = PREVIEW_WORLD / side;
  const L = Math.max(Math.abs(scale), 1e-3);

  for (let py = 0; py < side; py++) {
    const wy = (side * 0.5 - py - 0.5) * perPixel;
    for (let px = 0; px < side; px++) {
      const wx = (px + 0.5 - side * 0.5) * perPixel;
      let ink = 0;
      let tint = 0;
      if (program) {
        const s = evalField(program.code, program.literals, wx / L, wy / L);
        const value = s.f * amount;
        // Gradient per pixel, so a contour is one pixel wide wherever it runs.
        const gx = (s.gx * amount * perPixel) / L;
        const gy = (s.gy * amount * perPixel) / L;
        const grad = Math.hypot(gx, gy);
        const frac = value - Math.floor(value);
        const near = Math.min(frac, 1 - frac);
        const halfWidth = 0.5 * dpr;
        // Contours closer together than a pixel cannot be drawn, so they are let
        // go grey rather than aliased into false structure.
        const d = near / Math.max(grad, 1e-9);
        ink = grad > 0.5 ? 0.5 / grad : 1 - Math.min(1, Math.max(0, (d - halfWidth) / dpr));
        tint = Math.max(-1, Math.min(1, s.f));
      }
      const ground = 255 - Math.round(Math.abs(tint) * 10);
      const level = Math.round(ground * (1 - ink) + 26 * ink);
      const at = (py * side + px) * 4;
      data[at] = level;
      data[at + 1] = level;
      data[at + 2] = level;
      data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function Preview({ source, amount, scale }: { source: string; amount: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compiled = useMemo(() => {
    const trimmed = source.trim();
    if (!trimmed) return null;
    const result = compileField(trimmed);
    return result.ok ? result : null;
  }, [source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const side = Math.round(PREVIEW * dpr);
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // One frame later, so dragging a slider paints at most once per frame.
    const handle = requestAnimationFrame(() => drawPreview(ctx, compiled, amount, scale, dpr));
    return () => cancelAnimationFrame(handle);
  }, [compiled, amount, scale]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full rounded-lg bg-white"
      style={{ aspectRatio: '1 / 1' }}
      aria-label="Field preview"
    />
  );
}

const REFERENCE: { name: string; note: string }[] = [
  { name: 'x  y', note: 'coordinates, in units of Extent' },
  { name: 'r  theta', note: 'radius and angle' },
  { name: 'pi  tau  e', note: 'constants' },
  { name: 'sin cos tan atan2', note: '' },
  { name: 'exp log sqrt hypot', note: '' },
  { name: 'abs min max clamp', note: '' },
  { name: 'floor sign smoothstep', note: '' },
  { name: '+ - * / ^', note: '^ is a power' },
];

export function FieldEditor({
  layerName,
  field,
  onChange,
  onClose,
}: {
  layerName: string;
  field: FieldSpec;
  onChange: (patch: Partial<FieldSpec>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(field.source);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trimmed = draft.trim();
  const result = useMemo(() => (trimmed ? compileField(trimmed) : null), [trimmed]);
  const error = result && !result.ok ? result.error : null;
  // The canvas only follows a source that compiles, so a half-typed expression
  // does not blank the preview underneath the cursor.
  const lastGood = useRef(field.source);
  if (!trimmed || result?.ok) lastGood.current = draft;

  const commit = (source: string) => {
    setDraft(source);
    const next = source.trim();
    if (!next || compileField(next).ok) onChange({ source: next });
  };

  const presetActive = FIELD_PRESETS.find((p) => p.source === trimmed)?.id;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 grid place-items-center p-6">
      <button
        type="button"
        aria-label="Close field editor"
        className="absolute inset-0 cursor-default bg-[color-mix(in_srgb,#05070b_58%,transparent)]"
        onClick={onClose}
      />
      <div
        className="relative grid w-[38rem] max-w-full gap-3.5 rounded-2xl bg-[var(--bg-secondary)] p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--text-primary)_30%,transparent),var(--hud-shadow)]"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="font-serif text-[17px] leading-none italic">f</span>
          <span className="text-[12px] font-medium text-[var(--text-primary)]">Field</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
            {layerName}
          </span>
          <IconButton icon={Cancel01Icon} label="Close" onClick={onClose} size={14} dense />
        </div>

        <div className="grid grid-cols-[17rem_1fr] gap-4">
          <div className="grid gap-2">
            <Preview source={lastGood.current} amount={field.amount} scale={field.scale} />
            <p className="text-[10.5px] leading-[1.5] text-[var(--text-muted)]">
              The curves above are the fringes this layer will make against an
              unmodulated copy of itself: the level sets of the field, one per{' '}
              {(1 / Math.max(Math.abs(field.amount), 1e-6)).toFixed(2)} of its range.
            </p>
          </div>

          <div className="grid content-start gap-3">
            <div className="grid gap-1.5">
              <span className="text-[11px] text-[var(--text-secondary)]">Start from</span>
              <div className="grid grid-cols-3 gap-1">
                {FIELD_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => commit(preset.source)}
                    className={`h-6 rounded-md px-1 text-[10px] ${
                      presetActive === preset.id
                        ? 'text-[var(--text-primary)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-primary)_45%,transparent)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--text-secondary)]">Expression</span>
                {trimmed && (
                  <button
                    type="button"
                    className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    onClick={() => commit('')}
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                ref={inputRef}
                value={draft}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                placeholder="x^2 - y^2"
                aria-label="Field expression"
                onChange={(e) => commit(e.target.value)}
                className={`h-8 w-full rounded-md bg-[var(--bg-hover)] px-2 font-mono text-[11px] text-[var(--text-primary)] outline-none ring-1 ring-inset ${
                  error
                    ? 'ring-[color-mix(in_srgb,#f87171_70%,transparent)]'
                    : 'ring-[color-mix(in_srgb,var(--text-primary)_18%,transparent)] focus:ring-[color-mix(in_srgb,var(--text-primary)_40%,transparent)]'
                }`}
              />
              <span className="min-h-[1.1rem] text-[10px] leading-[1.1rem] text-[var(--text-muted)]">
                {error ?? '\u00a0'}
              </span>
            </div>

            <Slider
              label="Amount"
              value={field.amount}
              min={-40}
              max={40}
              step={0.1}
              defaultValue={FIELD_NONE.amount}
              onChange={(amount) => onChange({ amount })}
            />
            <Slider
              label="Extent"
              value={field.scale}
              min={8}
              max={600}
              step={1}
              defaultValue={FIELD_NONE.scale}
              onChange={(scale) => onChange({ scale })}
            />

            <div className="grid gap-0.5 border-t border-[var(--border)] pt-2">
              {REFERENCE.map((row) => (
                <div key={row.name} className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                    {row.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">{row.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
