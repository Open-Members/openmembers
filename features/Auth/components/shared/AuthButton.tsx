'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils';

interface AuthButtonProps {
  type?: 'submit' | 'button';
  isPending?: boolean;
  loadingLabel?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function AuthButton({
  type = 'submit',
  isPending = false,
  loadingLabel,
  children,
  className,
  onClick,
}: AuthButtonProps) {
  const t = useTranslations('auth.shared');
  return (
    <button
      type={type}
      disabled={isPending}
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-full px-6 py-3.5 text-base font-semibold text-[var(--color-primary-foreground)] transition-all duration-200 ease-out hover:brightness-[1.08] active:scale-[0.985] disabled:cursor-wait disabled:opacity-70',
        className
      )}
      style={{
        background:
          'linear-gradient(to bottom, var(--color-primary), color-mix(in oklab, var(--color-primary) 82%, black))',
        boxShadow: [
          '0 10px 30px -8px color-mix(in oklab, var(--color-primary) 45%, transparent)',
          '0 2px 6px -2px color-mix(in oklab, var(--color-primary) 30%, transparent)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        ].join(', '),
      }}
    >
      <span className="relative z-10">
        {isPending ? (loadingLabel ?? t('pending')) : children}
      </span>
    </button>
  );
}
