import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NewTicketForm } from '@/features/Support/components/NewTicketForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support.form');
  return { title: t('title') };
}

export default async function NewSupportTicketPage() {
  const t = await getTranslations('support.form');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 md:py-12">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-foreground)] md:text-3xl">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{t('description')}</p>
      </header>
      <NewTicketForm />
    </div>
  );
}
