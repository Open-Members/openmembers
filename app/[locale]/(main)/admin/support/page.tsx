import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { listAllTickets } from '@/features/Support/queries.server';
import { StatusChip } from '@/features/Support/components/StatusChip';
import { AdminStatusFilter } from '@/features/Support/components/AdminStatusFilter';
import type { SupportTicketStatus } from '@/features/Support/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support.admin');
  return { title: t('title') };
}

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

const VALID_STATUSES: SupportTicketStatus[] = ['open', 'in_progress', 'closed'];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [params, t, tStatus, tFilter, locale] = await Promise.all([
    searchParams,
    getTranslations('support.admin'),
    getTranslations('support.status'),
    getTranslations('support.admin.filter'),
    getLocale(),
  ]);

  const requestedStatus = params?.status;
  const statusFilter =
    requestedStatus && (VALID_STATUSES as string[]).includes(requestedStatus)
      ? (requestedStatus as SupportTicketStatus)
      : undefined;

  const tickets = await listAllTickets(statusFilter);

  const filterLabels = {
    all: tFilter('all'),
    open: tFilter('open'),
    in_progress: tFilter('in_progress'),
    closed: tFilter('closed'),
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-foreground)] md:text-3xl">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
      </header>

      <div className="mb-4">
        <AdminStatusFilter
          current={statusFilter ?? 'all'}
          labels={filterLabels}
          ariaLabel={tFilter('ariaLabel')}
        />
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-6 py-12 text-center text-sm text-[var(--color-muted-foreground)]">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
          <table className="min-w-full divide-y divide-[var(--color-border)]">
            <thead className="bg-[var(--color-muted)]/40 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-4 py-3">{t('columns.subject')}</th>
                <th className="px-4 py-3">{t('columns.user')}</th>
                <th className="px-4 py-3">{t('columns.status')}</th>
                <th className="px-4 py-3">{t('columns.created')}</th>
                <th className="px-4 py-3">{t('columns.updated')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="transition-colors hover:bg-[var(--color-muted)]/30"
                >
                  <td className="max-w-md truncate px-4 py-3 text-sm font-medium">
                    <Link
                      href={`/admin/support/${ticket.id}` as `/admin/support/${string}`}
                      className="text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
                    >
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
                    {ticket.user?.display_name ?? ticket.user_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={ticket.status} label={tStatus(ticket.status)} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
                    {formatDate(ticket.created_at, locale)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
                    {formatDate(ticket.updated_at, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
