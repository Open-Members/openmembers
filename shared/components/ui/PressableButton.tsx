'use client';

import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/shared/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface PressableButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: [
    'bg-[var(--color-primary)] text-white',
    'shadow-[0_4px_0_var(--color-primary-dark)]',
    'hover:bg-[var(--color-primary-hover)]',
  ].join(' '),
  secondary: [
    'border-2 border-[var(--color-primary)] text-[var(--color-primary)]',
    'hover:bg-[var(--color-primary-50)]',
  ].join(' '),
  ghost: [
    'text-[var(--color-muted-foreground)]',
    'hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
  ].join(' '),
  danger: [
    'bg-[var(--color-accent)] text-white',
    'shadow-[0_4px_0_var(--color-accent-dark)]',
    'hover:bg-[var(--color-accent-hover)]',
  ].join(' '),
};

const sizeClasses: Record<Size, string> = {
  sm: 'rounded-full px-4 py-2 text-xs',
  md: 'rounded-full px-6 py-3 text-sm',
  lg: 'rounded-full px-8 py-4 text-base',
};

/**
 * PressableButton — spring-physics button with press shadow animation.
 * Drop-in for any interactive CTA. Use variant/size props instead of
 * manual className for new buttons going forward.
 */
export function PressableButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: PressableButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.96, y: 2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
