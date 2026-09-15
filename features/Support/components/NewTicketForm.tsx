'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/core/i18n/routing';
import { useTranslations } from 'next-intl';
import { appToast } from '@/shared/lib/toast';
import { createSupportTicket } from '../actions';

export function NewTicketForm() {
  const t = useTranslations('support.form');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await createSupportTicket(formData);
        if ('error' in res) {
          setError(
            t.has(`errors.${res.error}`)
              ? t(`errors.${res.error}`)
              : t('errorFallback'),
          );
          return;
        }
        appToast.success(t('successToast'));
        router.push('/support');
        router.refresh();
      } catch {
        setError(t('errorFallback'));
      }
    });
  };

  return (
    <form action={onSubmit} noValidate className="space-y-5">
      <div>
        <label
          htmlFor="subject"
          className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
        >
          {t('subject')}
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          required
          minLength={3}
          maxLength={200}
          placeholder={t('subjectPlaceholder')}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      <div>
        <label
          htmlFor="message"
          className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
        >
          {t('message')}
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={5}
          maxLength={10000}
          rows={8}
          placeholder={t('messagePlaceholder')}
          className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/support')}
          className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}
