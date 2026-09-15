import type { ReactNode } from 'react';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Page-level chrome for auth screens: editorial title + muted subtitle +
// multi-layer glass card containing the form + optional footer row.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="w-full max-w-[440px]">
      <div className="text-center">
        <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--color-foreground)] md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-base text-[var(--color-muted-foreground)]">
          {subtitle}
        </p>
      </div>
      <div
        className="relative mt-10 rounded-3xl px-6 py-8 backdrop-blur-2xl backdrop-saturate-150 sm:px-8"
        style={{
          // Inline bg wins over the global `.dark [class*="backdrop-blur"]`
          // rule in globals.css that forces a navy color on every blurred
          // surface. Neutral card-colour glass here.
          backgroundColor:
            'color-mix(in oklab, var(--color-card) 55%, transparent)',
          boxShadow: [
            '0 28px 80px -20px rgba(0, 0, 0, 0.5)',
            '0 0 0 1px color-mix(in oklab, var(--color-foreground) 8%, transparent)',
            'inset 0 1px 0 color-mix(in oklab, var(--color-foreground) 12%, transparent)',
          ].join(', '),
        }}
      >
        {children}
      </div>
      {footer && (
        <div className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
          {footer}
        </div>
      )}
    </div>
  );
}
