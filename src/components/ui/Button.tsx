import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  className, 
  children, 
  ...props 
}: ButtonProps) {
  return (
    <button
      className={clsx(
        // Base styles
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
        
        // Size variants
        {
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        
        // Color variants
        {
          'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 focus:ring-[var(--accent-primary)]/50': variant === 'primary',
          'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/80 focus:ring-[var(--border)]': variant === 'secondary',
          'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] focus:ring-[var(--border)]': variant === 'ghost',
        },
        
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
} 