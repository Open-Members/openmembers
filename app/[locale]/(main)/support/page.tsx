import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { MyTicketsList } from '@/features/Support/components/MyTicketsList';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support');
  return { title: t('title') };
}

export default async function SupportPage() {
  const t = await getTranslations('support');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-foreground)] md:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
        </div>
        <Link
          href="/support/new"
          className="inline-flex items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-dark)]"
        >
          {t('newTicket')}
        </Link>
      </header>
      <MyTicketsList />
    </div>
  );
}
