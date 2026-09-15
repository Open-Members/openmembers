import type { SupportTicketStatus } from '../types';

const STYLE: Record<SupportTicketStatus, string> = {
  open: 'bg-[var(--color-primary)]/15 text-[var(--color-primary-dark)]',
  in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  closed: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

export function StatusChip({
  status,
  label,
}: {
  status: SupportTicketStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE[status]}`}
    >
      {label}
    </span>
  );
}
