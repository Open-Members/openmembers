import type { ReactNode } from 'react';

type Props = {
  /** Uppercase label above the title (e.g. "Layout", "Content", "Overview"). */
  eyebrow: string;
  title: string;
  /** One-liner under the title — what this page does / when to use it. */
  description?: string;
  /** Right-side controls (buttons, pills). Stacks below on mobile. */
  actions?: ReactNode;
};

/**
 * Shared admin page header. Uses the editorial pattern from the student-
 * facing pages so the admin feels like it's part of the same product
 * instead of a SaaS console.
 */
export function AdminPageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="mb-8 md:mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2">
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-medium text-[var(--color-foreground)] leading-[1.1] tracking-tight truncate">
          {title}
        </h1>
        {description && (
          <p className="text-sm md:text-base text-[var(--color-muted-foreground)] mt-2 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
