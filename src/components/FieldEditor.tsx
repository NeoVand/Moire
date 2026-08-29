import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { compileField, FIELD_PRESETS, type CompiledField } from '../fields/expr';
import { evalField } from '../fields/evalExpr';
import { tokenizeForDisplay, type ExprTokenKind } from '../fields/highlight';
import { FIELD_NONE, type FieldSpec } from '../types/moire';
import { FloatingPanel } from './ui/FloatingPanel';
import { Slider } from './ui/Slider';

/** Side of the preview, in device-independent pixels. */
const PREVIEW = 252;
/** World units the preview spans, so Extent reads as a zoom of the field. */
const PREVIEW_WORLD = 320;

type PreviewMode = 'fringes' | 'field';

/**
 * What the field will do to a layer, drawn as the fringes it produces.
 *
 * A field displaces the layer's index by `amount * f`, so against an unmodulated
 * twin the fringes are the level sets of that product at integer values. The
 * `fringes` mode draws exactly those level sets — at a width divided by the
 * gradient, as the renderer does — so the preview is the prediction: the curves
 * here are the curves the canvas is about to grow. Under it, a quiet signed wash
 * (warm above zero, cool below) keeps the field's shape readable between the
 * curves, and the zero set is drawn heavier because it is the field's skeleton.
 * The `field` mode drops the fringes and turns the wash up: the raw f, for
 * reading an expression rather than its consequences.
 */
function drawPreview(
  ctx: CanvasRenderingContext2D,
  program: CompiledField | null,
  amount: number,
  scale: number,
  dpr: number,
  mode: PreviewMode
) {
  const side = Math.round(PREVIEW * dpr);
  const image = ctx.createImageData(side, side);
  const data = image.data;
  const perPixel = PREVIEW_WORLD / side;
  const L = Math.max(Math.abs(scale), 1e-3);

  // Warm for positive field, cool for negative, both toward the paper white.
  const washUp = [244, 224, 194];
  const washDown = [199, 216, 240];
  const washGain = mode === 'field' ? 0.85 : 0.3;

  for (let py = 0; py < side; py++) {
    const wy = (side * 0.5 - py - 0.5) * perPixel;
    for (let px = 0; px < side; px++) {
      const wx = (px + 0.5 - side * 0.5) * perPixel;
      let ink = 0;
      let heavy = 0;
      let wash = 0;
      if (program) {
        const s = evalField(program.code, program.literals, wx / L, wy / L);
        wash = Math.max(-1, Math.min(1, s.f));
        if (mode === 'field') {
          // The wash carries the values; the zero set alone keeps its line, so
          // the field's skeleton stays visible without the fringe clutter.
          const gx = (s.gx * perPixel) / L;
          const gy = (s.gy * perPixel) / L;
          const d = Math.abs(s.f) / Math.max(Math.hypot(gx, gy), 1e-9);
          ink = 1 - Math.min(1, Math.max(0, (d - 0.5 * dpr) / dpr));
          heavy = ink;
        }
        if (mode === 'fringes') {
          const value = s.f * amount;
          // Gradient per pixel, so a contour is one pixel wide wherever it runs.
          const gx = (s.gx * amount * perPixel) / L;
          const gy = (s.gy * amount * perPixel) / L;
          const grad = Math.hypot(gx, gy);
          const nearest = Math.round(value);
          const frac = value - Math.floor(value);
          const near = Math.min(frac, 1 - frac);
          const halfWidth = 0.5 * dpr;
          // Contours closer together than a pixel cannot be drawn, so they are
          // let go grey rather than aliased into false structure.
          const d = near / Math.max(grad, 1e-9);
          ink = grad > 0.5 ? 0.5 / grad : 1 - Math.min(1, Math.max(0, (d - halfWidth) / dpr));
          heavy = nearest === 0 ? ink : 0;
        }
      }
      const at = (py * side + px) * 4;
      const washTo = wash >= 0 ? washUp : washDown;
      const w = Math.abs(wash) * washGain;
      for (let c = 0; c < 3; c++) {
        const ground = 255 * (1 - w) + washTo[c] * w;
        // Ordinary contours sit at ink #2a2a2a; the zero set goes to full black.
        const inked = ground * (1 - ink) + 42 * ink;
        data[at + c] = Math.round(inked * (1 - heavy * 0.35));
      }
      data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function Preview({
  source,
  amount,
  scale,
  mode,
}: {
  source: string;
  amount: number;
  scale: number;
  mode: PreviewMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compiled = useMemo(() => {
    const trimmed = source.trim();
    if (!trimmed) return null;
    const result = compileField(trimmed);
    return result.ok ? result : null;
  }, [source]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const side = Math.round(PREVIEW * dpr);
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // One frame later, so dragging a slider paints at most once per frame.
    const handle = requestAnimationFrame(() =>
      drawPreview(ctx, compiled, amount, scale, dpr, mode)
    );
    return () => cancelAnimationFrame(handle);
  }, [compiled, amount, scale, mode]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="block w-full rounded-lg bg-white"
        style={{ aspectRatio: '1 / 1' }}
        aria-label="Field preview"
      />
      {!compiled && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-[11px] leading-[1.5] text-[#8a8a8a]">
          Pick a preset, or type an f(x, y) below.
        </span>
      )}
    </div>
  );
}

const TOKEN_CLASS: Record<ExprTokenKind, string> = {
  number: 'text-[#dcb083]',
  coord: 'text-[var(--text-primary)]',
  polar: 'text-[#a9c4e8]',
  constant: 'text-[#c6a7dd]',
  fn: 'text-[#8fc0e8]',
  op: 'text-[var(--text-secondary)]',
  paren: 'text-[var(--text-muted)]',
  comma: 'text-[var(--text-muted)]',
  space: '',
  unknown: 'text-[#f87171]',
};

/**
 * The expression, coloured as it will parse. A transparent textarea takes the
 * typing; a pre underneath renders the same characters through the language's
 * own name tables, so the colours cannot drift from what compiles. The compile
 * error's position wears a wavy underline through its token.
 */
function ExprInput({
  value,
  errorAt,
  hasError,
  onChange,
}: {
  value: string;
  errorAt: number | undefined;
  hasError: boolean;
  onChange: (next: string) => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const tokens = useMemo(() => tokenizeForDisplay(value), [value]);

  // The textarea grows with the expression instead of scrolling it: the longest
  // preset is four lines, and hiding half of it behind a scrollbar is worse than
  // spending the rows.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = '0px';
    area.style.height = `${Math.max(30, Math.min(area.scrollHeight, 120))}px`;
  }, [value]);

  const shared =
    'font-mono text-[11px] leading-[1.55] whitespace-pre-wrap break-words px-2 py-1.5';

  return (
    <div
      className={`relative w-full rounded-md bg-[var(--bg-hover)] ring-1 ring-inset ${
        hasError
          ? 'ring-[color-mix(in_srgb,#f87171_70%,transparent)]'
          : 'ring-[color-mix(in_srgb,var(--text-primary)_18%,transparent)] focus-within:ring-[color-mix(in_srgb,var(--text-primary)_40%,transparent)]'
      }`}
    >
      <pre aria-hidden className={`${shared} pointer-events-none m-0 min-h-[30px]`}>
        {tokens.map((token, i) => (
          <span
            key={i}
            className={TOKEN_CLASS[token.kind]}
            style={
              hasError &&
              errorAt !== undefined &&
              errorAt >= token.at &&
              errorAt < token.at + token.text.length
                ? { textDecoration: 'underline wavy #f87171 1px', textUnderlineOffset: 2 }
                : undefined
            }
          >
            {token.text}
          </span>
        ))}
        {'​'}
      </pre>
      <textarea
        ref={areaRef}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        rows={1}
        placeholder="x^2 - y^2"
        aria-label="Field expression"
        onChange={(e) => onChange(e.target.value)}
        className={`${shared} absolute inset-0 w-full resize-none overflow-hidden bg-transparent text-transparent caret-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]`}
      />
    </div>
  );
}

function EnabledSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Field on' : 'Field off'}
      title={on ? 'Field on — click to mute' : 'Field off — click to enable'}
      onClick={onToggle}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
        on ? 'bg-[var(--text-primary)]' : 'bg-[var(--track)]'
      }`}
    >
      <span
        className={`absolute top-[2.5px] size-[11px] rounded-full bg-[var(--bg-secondary)] transition-[left] ${
          on ? 'left-[15px]' : 'left-[2.5px]'
        }`}
      />
    </button>
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
  const [mode, setMode] = useState<PreviewMode>('fringes');

  const trimmed = draft.trim();
  const result = useMemo(() => (trimmed ? compileField(trimmed) : null), [trimmed]);
  const error = result && !result.ok ? result.error : null;
  const errorAt = result && !result.ok ? result.at : undefined;
  // The canvas only follows a source that compiles, so a half-typed expression
  // does not blank the preview underneath the cursor.
  const lastGood = useRef(field.source);
  if (!trimmed || result?.ok) lastGood.current = draft;

  const commit = (source: string) => {
    setDraft(source);
    const next = source.trim();
    if (!next || compileField(next).ok) onChange({ source: next });
  };

  const enabled = field.enabled !== false;
  const presetActive = FIELD_PRESETS.find((p) => p.source === trimmed)?.id;

  return (
    <FloatingPanel
      id="field"
      width={588}
      defaultPosition={{ x: 348, y: 56 }}
      onClose={onClose}
      mark={<span className="font-serif text-[17px] leading-none italic">f</span>}
      title={
        <>
          Field
          <span className="ml-2 max-w-[10rem] truncate align-middle text-[11px] font-normal text-[var(--text-muted)]">
            {layerName}
          </span>
        </>
      }
      headerExtra={<EnabledSwitch on={enabled} onToggle={() => onChange({ enabled: !enabled })} />}
    >
      <div className={`grid grid-cols-[16rem_1fr] gap-4 ${enabled ? '' : 'opacity-90'}`}>
        <div className="grid content-start gap-2">
          <Preview source={lastGood.current} amount={field.amount} scale={field.scale} mode={mode} />
          <div className="flex items-center gap-1">
            {(['fringes', 'field'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`h-5 rounded px-1.5 text-[10px] capitalize ${
                  mode === m
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {m}
              </button>
            ))}
            <span className="flex-1" />
            <span className="text-[10px] text-[var(--text-muted)]">
              one fringe per {(1 / Math.max(Math.abs(field.amount), 1e-6)).toFixed(2)}
            </span>
          </div>
          <p className="text-[10.5px] leading-[1.5] text-[var(--text-muted)]">
            The fringes this layer will make against an unmodulated copy of itself: the level
            sets of the field. The zero set is drawn heavier.
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
                  title="Remove the field from this layer"
                  onClick={() => commit('')}
                >
                  Clear
                </button>
              )}
            </div>
            <ExprInput value={draft} errorAt={errorAt} hasError={!!error} onChange={commit} />
            <span className="min-h-[1.1rem] text-[10px] leading-[1.1rem] text-[var(--text-muted)]">
              {error ?? ' '}
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

          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-[var(--border)] pt-2">
            {REFERENCE.map((row) => (
              <div key={row.name} className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] whitespace-nowrap text-[var(--text-secondary)]">
                  {row.name}
                </span>
                <span className="truncate text-[10px] text-[var(--text-muted)]">{row.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
}
