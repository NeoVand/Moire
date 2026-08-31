import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { scheduleOf, type Animator } from '../types/motion';
import { useEditorStore } from '../store/editor';
import { paramDescriptor } from '../store/params';
import { useProjectStore } from '../store/project';
import { useTransportStore } from '../store/transport';
import { Icon } from './ui/Icon';

/**
 * Everything in this construction that moves.
 *
 * Without it a motion can only be found through the knob that owns it, which
 * means finding the layer, selecting it, and knowing which slider it was — and
 * an animation on a layer that is not currently selected cannot be reached at
 * all. A shot is usually several of these at once, so there has to be somewhere
 * they are all visible together.
 *
 * Solo is the control this exists for. Composing a shot is mostly a matter of
 * watching one thing at a time while the rest holds still, and doing that by
 * deleting and re-adding animations loses their settings every time.
 *
 * Both are session state rather than document state: which motions somebody is
 * listening to right now is not a property of the construction, and a scene file
 * that arrived with half its motion muted would be a puzzle rather than a scene.
 */

/** `envelopeContrast` -> `Envelope contrast`, for knobs with no panel open. */
function prettify(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What to call this row.
 *
 * A mounted slider publishes a label, and that is the best answer because it is
 * the word actually on screen. But a row exists for every animation, including
 * ones whose panel is shut and whose layer is not selected — that is most of the
 * point of the list — so the fallback has to be presentable rather than a path.
 * The layer's name comes from the document either way, since three layers of
 * circles all have a slider called Spacing.
 */
function nameOf(a: Animator): { label: string; where: string | null } {
  const parts = a.path.split('.');
  // A layer path carries an id in the middle; view and camera do not. Slicing at
  // a fixed depth turned `view.envelopeContrast` into "View.envelope contrast".
  const key = (parts[0] === 'layer' ? parts.slice(2) : parts.slice(1)).join('.');
  const label = paramDescriptor(a.path)?.label ?? prettify(key || a.path);

  if (parts[0] === 'layer') {
    const layer = useProjectStore.getState().layers.find((l) => l.id === parts[1]);
    return { label, where: layer?.name ?? 'gone' };
  }
  if (parts[0] === 'view') return { label, where: 'View' };
  if (parts[0] === 'camera') return { label, where: 'Camera' };
  return { label, where: null };
}

const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, ''));

export function MotionList() {
  const animators = useProjectStore((s) => s.motion.animators);
  const timings = useProjectStore((s) => s.motion.timings);
  const muted = useTransportStore((s) => s.muted);
  const solo = useTransportStore((s) => s.solo);
  const toggleMute = useTransportStore((s) => s.toggleMute);
  const toggleSolo = useTransportStore((s) => s.toggleSolo);
  const editing = useEditorStore((s) => s.motionPath);
  const openMotion = useEditorStore((s) => s.openMotion);

  if (animators.length === 0) return null;

  return (
    <div className="grid max-h-[132px] gap-px overflow-y-auto">
      {animators.map((a) => {
        const { label, where } = nameOf(a);
        const s = scheduleOf(a, timings);
        const off = solo ? solo !== a.id : muted.includes(a.id);
        const isSolo = solo === a.id;
        return (
          <div
            key={a.id}
            className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1 ${
              editing === a.path ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
            }`}
          >
            <button
              type="button"
              onClick={() => openMotion(a.path)}
              title={`${a.path} — ${num(a.from)} to ${num(a.to)} over ${s.period}s, ${s.mode}`}
              className={`flex min-w-0 flex-1 items-baseline gap-1.5 text-left ${
                off ? 'opacity-40' : ''
              }`}
            >
              <span className="truncate text-[10.5px] text-[var(--text-primary)]">{label}</span>
              {where && (
                <span className="shrink-0 truncate text-[9px] text-[var(--text-muted)]">
                  {where}
                </span>
              )}
              <span className="flex-1" />
              <span className="shrink-0 font-mono text-[9px] tabular-nums text-[var(--text-muted)]">
                {num(a.from)}→{num(a.to)}
              </span>
            </button>
            <button
              type="button"
              title={isSolo ? 'Stop soloing' : 'Solo — hold everything else still'}
              aria-label={isSolo ? 'Stop soloing' : 'Solo'}
              onClick={() => toggleSolo(a.id)}
              className={`shrink-0 rounded px-1 py-px text-[9px] ${
                isSolo
                  ? 'bg-[var(--text-primary)] text-[var(--bg-secondary)]'
                  : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)]'
              }`}
            >
              solo
            </button>
            <button
              type="button"
              title={muted.includes(a.id) ? 'Let this move again' : 'Hold this one still'}
              aria-label={muted.includes(a.id) ? 'Unmute' : 'Mute'}
              onClick={() => toggleMute(a.id)}
              className={`grid size-4 shrink-0 place-items-center rounded ${
                muted.includes(a.id)
                  ? 'text-[var(--text-secondary)]'
                  : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon icon={muted.includes(a.id) ? ViewOffSlashIcon : ViewIcon} size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
