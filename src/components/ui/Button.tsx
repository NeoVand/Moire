import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'gradient';
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
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden group',
        
        // Size variants
        {
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        
        // Color variants
        {
          // Primary - gradient background
          'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] text-white hover:shadow-lg hover:shadow-[var(--gradient-start)]/25 hover:scale-105 focus:ring-[var(--accent-primary)]/50 active:scale-95': variant === 'primary',
          
          // Secondary - gradient border with transparent fill
          'bg-transparent text-[var(--text-primary)] border-2 border-transparent bg-gradient-to-r from-[var(--bg-primary)] to-[var(--bg-primary)] bg-clip-padding hover:shadow-lg hover:shadow-[var(--gradient-start)]/20 focus:ring-[var(--accent-primary)]/50 relative': variant === 'secondary',
          
          // Ghost - subtle gradient on hover
          'text-[var(--text-primary)] hover:bg-gradient-to-r hover:from-[var(--gradient-start)]/10 hover:to-[var(--gradient-end)]/10 hover:text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30': variant === 'ghost',
          
          // Gradient - animated gradient
          'text-white hover:shadow-lg hover:shadow-[var(--gradient-start)]/30 hover:scale-105 focus:ring-[var(--accent-primary)]/50 active:scale-95 gradient-animated': variant === 'gradient',
        },
        
        className
      )}
      {...props}
    >
      {/* Gradient border overlay for secondary variant */}
      {variant === 'secondary' && (
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-100 -z-10" />
      )}
      
      {/* Hover effect overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 ease-in-out" />
      
      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        {children}
      </span>
    </button>
  );
} 