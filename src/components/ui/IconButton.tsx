import type { Ref } from 'react';
import { Icon, type HugeIcon } from './Icon';
import { useHoverTip } from './useHoverTip';

interface IconButtonProps {
  icon: HugeIcon;
  label: string;
  onClick?: () => void;
  /** Secondary press, for a control that also has settings behind it. */
  onAlternate?: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  tone?: 'default' | 'inherit';
  dense?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  onClick,
  onAlternate,
  active = false,
  disabled = false,
  size = 16,
  tone = 'default',
  dense = false,
  buttonRef,
}: IconButtonProps) {
  const palette =
    tone === 'inherit'
      ? 'text-current opacity-55 hover:opacity-100'
      : active
        ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]';

  // A prompt styled tooltip, because an icon is the whole label and the native
  // title takes a second nobody waits for.
  const tip = useHoverTip(label);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      disabled={disabled}
      {...tip.handlers}
      onClick={(e) => {
        e.stopPropagation();
        if (onAlternate && (e.altKey || e.metaKey)) {
          onAlternate();
          return;
        }
        onClick?.();
      }}
      onContextMenu={
        onAlternate
          ? (e) => {
              e.preventDefault();
              onAlternate();
            }
          : undefined
      }
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        tip.clear();
      }}
      className={`grid place-items-center rounded-md transition-opacity disabled:opacity-30 ${dense ? 'size-6' : 'size-7'} ${palette}`}
    >
      <Icon icon={icon} size={dense ? Math.min(size, 14) : size} />
      {tip.bubble}
    </button>
  );
}
