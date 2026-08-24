import { HugeiconsIcon } from '@hugeicons/react';

export type HugeIcon = Parameters<typeof HugeiconsIcon>[0]['icon'];

interface IconProps {
  icon: HugeIcon;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ icon, size = 16, strokeWidth = 1.6, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color="currentColor"
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}
