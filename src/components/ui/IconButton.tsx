import { Icon, type HugeIcon } from './Icon';

interface IconButtonProps {
  icon: HugeIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  tone?: 'default' | 'inherit';
}

export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  size = 16,
  tone = 'default',
}: IconButtonProps) {
  const palette =
    tone === 'inherit'
      ? 'text-current opacity-55 hover:opacity-100'
      : active
        ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]';

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => e.currentTarget.blur()}
      className={`grid size-8 place-items-center rounded-lg transition-opacity disabled:opacity-30 ${palette}`}
    >
      <Icon icon={icon} size={size} />
    </button>
  );
}
