import { useEffect, useRef, useState } from 'react';
import { GithubIcon, Globe02Icon, KeyboardIcon, Linkedin02Icon } from '@hugeicons/core-free-icons';
import { isTypingTarget } from '../lib/keyboard';
import { Icon } from './ui/Icon';
import { MoireMark } from './ui/MoireMark';

const REPO = 'https://github.com/NeoVand/Moire';
const LINKS = [
  { href: 'https://www.linkedin.com/in/mohsenvand/', icon: Linkedin02Icon, label: 'LinkedIn' },
  { href: 'https://github.com/NeoVand', icon: GithubIcon, label: 'GitHub' },
  { href: 'https://neovand.github.io/', icon: Globe02Icon, label: 'Homepage' },
] as const;

const RING_COUNT = 28;
const RING_STEP = 2.6;
const RINGS = Array.from({ length: RING_COUNT }, (_, i) => (i + 1) * RING_STEP);
const CX = 140;
const CY = 82;

function MoirePreview() {
  const aRef = useRef<SVGGElement>(null);
  const bRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const u = 0.5 - 0.5 * Math.cos((((now - started) / 7500) % 1) * Math.PI * 2);
      const shift = 16 - 22 * u;
      aRef.current?.setAttribute('transform', `translate(${-shift} 0)`);
      bRef.current?.setAttribute('transform', `translate(${shift} 0)`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg viewBox="0 0 280 164" className="moire-about-stage" aria-hidden>
      <g ref={aRef} className="moire-about-set moire-about-a">
        {RINGS.map((r) => (
          <circle key={`a-${r}`} cx={CX} cy={CY} r={r} />
        ))}
      </g>
      <g ref={bRef} className="moire-about-set moire-about-b">
        {RINGS.map((r) => (
          <circle key={`b-${r}`} cx={CX} cy={CY} r={r} />
        ))}
      </g>
    </svg>
  );
}

function Social({
  href,
  icon,
  label,
}: {
  href: string;
  icon: (typeof LINKS)[number]['icon'];
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    >
      <Icon icon={icon} size={16} />
    </a>
  );
}

export function AboutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') setOpen(false);
    };
    const onToggle = () => setOpen((prev) => !prev);
    window.addEventListener('keydown', onKey);
    window.addEventListener('moire-about', onToggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('moire-about', onToggle);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-[color-mix(in_srgb,var(--bg-primary)_40%,transparent)] p-6"
      onClick={() => setOpen(false)}
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="moire-about-title"
        className="hud-card pointer-events-auto w-[20.5rem] max-h-[calc(100dvh-3rem)] max-w-full p-4"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-center gap-2 text-[var(--text-primary)]">
          <MoireMark size={26} strokeWidth={1.0} />
          <h2 id="moire-about-title" className="text-[18px] font-semibold tracking-[-0.04em]">
            Moiré
          </h2>
        </header>

        <p className="mt-2.5 text-center text-[12px] leading-[1.5] text-[var(--text-secondary)]">
          Two similar figures overlay into a new interference pattern. From French silk; Lord
          Rayleigh, 1874.
        </p>

        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-[color-mix(in_srgb,var(--text-primary)_14%,transparent)]">
          <MoirePreview />
        </div>

        <div className="mt-3 flex justify-center gap-1">
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            title="Repository"
            aria-label="Repository"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Icon icon={GithubIcon} size={15} />
            <span>Repository</span>
          </a>
          <button
            type="button"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event('moire-shortcuts'));
            }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Icon icon={KeyboardIcon} size={15} />
            <span>Shortcuts</span>
          </button>
        </div>

        <div className="mt-3 h-px bg-[var(--border)]" />

        <footer className="mt-3 flex flex-col items-center gap-1.5">
          <p className="text-center text-[12px] leading-relaxed text-[var(--text-secondary)]">
            Designed and created by Neo Mohsenvand
          </p>
          <div className="flex items-center gap-0.5">
            {LINKS.map((link) => (
              <Social key={link.label} {...link} />
            ))}
          </div>
        </footer>
      </article>
    </div>
  );
}
