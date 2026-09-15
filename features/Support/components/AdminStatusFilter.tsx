import { Link } from '@/core/i18n/routing';
import type { SupportTicketStatus } from '../types';

const OPTIONS: Array<{ value: SupportTicketStatus | 'all'; labelKey: string }> = [
  { value: 'all', labelKey: 'all' },
  { value: 'open', labelKey: 'open' },
  { value: 'in_progress', labelKey: 'in_progress' },
  { value: 'closed', labelKey: 'closed' },
];

export function AdminStatusFilter({
  current,
  labels,
  ariaLabel,
}: {
  current: SupportTicketStatus | 'all';
  labels: Record<string, string>;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap items-center gap-2">
      {OPTIONS.map((opt) => {
        const href =
          opt.value === 'all' ? '/admin/support' : `/admin/support?status=${opt.value}`;
        const active = current === opt.value;
        return (
          <Link
            key={opt.value}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'inline-flex items-center rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white shadow-sm'
                : 'inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]'
            }
          >
            {labels[opt.labelKey] ?? opt.value}
          </Link>
        );
      })}
    </nav>
  );
}
