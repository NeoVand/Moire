import { useMemo, useRef, useState } from 'react';
import { Popover } from './ui/Popover';
import { tilingPatch, tilingSpec, type TilingId } from '../gpu/tilings';
import type { PatternType } from '../types/moire';
import { currentTiling, tilingChoice, type TilingChoice } from '../lib/tilingChoice';

/**
 * Picking a tiling by picture, because the names are not pictures.
 *
 * Every other pattern in the app is nameable — circle, wave, spiral — so a chip
 * with a word does the job. Tilings are not: nobody recognises "3.4.6.4", and
 * everybody recognises the drawing. So the family's variant row becomes one
 * wide chip showing the current tiling, and the choosing happens in a gallery
 * of thumbnails.
 *
 * The thumbnails are the catalogue's own geometry, not artwork: the same
 * segments the shader walks, drawn straight to SVG. A thumbnail therefore
 * cannot show a tiling the layer would not draw, and adding a catalogue entry
 * adds its picture with it.
 */

const THUMB = 46;
/** Half-width of the patch a thumbnail shows, in edge lengths. */
const EXTENT = 2.6;

function TilingThumb({ id, size = THUMB }: { id: TilingId; size?: number }) {
  const segments = useMemo(() => tilingPatch(id, EXTENT), [id]);
  const view = EXTENT * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-EXTENT} ${-EXTENT} ${view} ${view}`}
      aria-hidden="true"
      className="overflow-hidden"
    >
      <g
        stroke="currentColor"
        strokeWidth={0.075}
        strokeLinecap="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      >
        {segments.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        ))}
      </g>
    </svg>
  );
}

/**
 * The gallery groups by how regular the tiling is, because that is the
 * distinction a reader can see: the three whose faces are all one shape, the
 * uniform ones built from several regular polygons, and the brick, whose faces
 * are not regular at all.
 */
const SECTIONS: { label: string; ids: TilingId[] }[] = [
  { label: 'Regular', ids: ['square', 'triangular', 'hexagonal'] },
  {
    label: 'Semi-regular',
    ids: [
      'kagome',
      'truncated-square',
      'truncated-hex',
      'rhombitrihex',
      'snub-square',
      'elongated-triangular',
    ],
  },
  { label: 'Other', ids: ['running-bond'] },
];

export function TilingGallery({
  type,
  tiling,
  onChange,
}: {
  type: PatternType;
  tiling: TilingId;
  onChange: (choice: TilingChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = currentTiling(type, tiling);
  const spec = tilingSpec(active);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Tiling: ${spec.label}`}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
          open
            ? 'border-[var(--accent)] text-[var(--text-primary)]'
            : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <span className="shrink-0 text-[var(--text-primary)]">
          <TilingThumb id={active} size={26} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-[var(--text-primary)]">
            {spec.label}
          </span>
          <span className="block truncate text-[10px] tabular-nums text-[var(--text-secondary)]">
            {spec.notation}
          </span>
        </span>
      </button>
      <Popover open={open} width={268} triggerRef={triggerRef} onClose={() => setOpen(false)}>
        <div className="grid gap-2.5">
          {SECTIONS.map((section) => (
              <div key={section.label} className="grid gap-1">
                <div className="px-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                  {section.label}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {section.ids.map((id) => {
                    const item = tilingSpec(id);
                    const on = id === active;
                    return (
                      <button
                        key={id}
                        type="button"
                        title={`${item.label} · ${item.notation}`}
                        onClick={() => {
                          onChange(tilingChoice(id));
                          setOpen(false);
                        }}
                        className={`grid justify-items-center gap-1 rounded-md border px-1 py-1.5 transition-colors ${
                          on
                            ? 'border-[var(--accent)] text-[var(--accent)]'
                            : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <TilingThumb id={id} />
                        <span className="w-full truncate text-center text-[9px] leading-tight">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
          ))}
        </div>
      </Popover>
    </>
  );
}
