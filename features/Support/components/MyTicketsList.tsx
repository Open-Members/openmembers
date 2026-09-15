import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { listMyTickets } from '../queries.server';
import { StatusChip } from './StatusChip';

function formatDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function MyTicketsList() {
  const [t, tStatus, locale, tickets] = await Promise.all([
    getTranslations('support'),
    getTranslations('support.status'),
    getLocale(),
    listMyTickets(),
  ]);

  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-6 py-12 text-center">
        <h2 className="text-base font-semibold text-[var(--color-foreground)]">
          {t('empty.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t('empty.description')}
        </p>
        <Link
          href="/support/new"
          className="mt-4 inline-flex rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-dark)]"
        >
          {t('empty.cta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
      <table className="min-w-full divide-y divide-[var(--color-border)]">
        <thead className="bg-[var(--color-muted)]/40 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          <tr>
            <th className="px-4 py-3">{t('list.columns.subject')}</th>
            <th className="px-4 py-3">{t('list.columns.status')}</th>
            <th className="px-4 py-3">{t('list.columns.created')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-background)]">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="transition-colors hover:bg-[var(--color-muted)]/30">
              <td className="max-w-md truncate px-4 py-3 text-sm font-medium text-[var(--color-foreground)]">
                {ticket.subject}
              </td>
              <td className="px-4 py-3">
                <StatusChip status={ticket.status} label={tStatus(ticket.status)} />
              </td>
              <td className="px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
                {formatDate(ticket.created_at, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
