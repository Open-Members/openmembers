import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { ArrowLeft } from 'lucide-react';
import { getTicketForAdmin } from '@/features/Support/queries.server';
import { StatusChip } from '@/features/Support/components/StatusChip';
import { AdminTicketEditor } from '@/features/Support/components/AdminTicketEditor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [ticket, t] = await Promise.all([
    getTicketForAdmin(id),
    getTranslations('support.admin.detail'),
  ]);
  return { title: ticket ? ticket.subject : t('metadataFallback') };
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

export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ticket, t, tStatus, locale] = await Promise.all([
    getTicketForAdmin(id),
    getTranslations('support.admin.detail'),
    getTranslations('support.status'),
    getLocale(),
  ]);

  if (!ticket) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/admin/support"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-foreground)] md:text-3xl">
            {ticket.subject}
          </h1>
          <dl className="mt-3 grid grid-cols-1 gap-1 text-sm text-[var(--color-muted-foreground)] sm:grid-cols-2">
            <div>
              <dt className="inline font-medium text-[var(--color-foreground)]">{t('userLabel')}: </dt>
              <dd className="inline">{ticket.user?.display_name ?? ticket.user_id.slice(0, 8)}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-[var(--color-foreground)]">{t('createdLabel')}: </dt>
              <dd className="inline">{formatDate(ticket.created_at, locale)}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-[var(--color-foreground)]">{t('updatedLabel')}: </dt>
              <dd className="inline">{formatDate(ticket.updated_at, locale)}</dd>
            </div>
          </dl>
        </div>
        <StatusChip status={ticket.status} label={tStatus(ticket.status)} />
      </header>

      <section className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
          {t('messageLabel')}
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-muted-foreground)]">
          {ticket.message}
        </p>
      </section>

      <AdminTicketEditor
        ticketId={ticket.id}
        initialStatus={ticket.status}
        initialNote={ticket.admin_note ?? ''}
      />
    </div>
  );
}
