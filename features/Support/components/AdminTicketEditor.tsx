'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/core/i18n/routing';
import { useTranslations } from 'next-intl';
import { appToast } from '@/shared/lib/toast';
import { updateSupportTicket } from '../actions';
import type { SupportTicketStatus } from '../types';

export function AdminTicketEditor({
  ticketId,
  initialStatus,
  initialNote,
}: {
  ticketId: string;
  initialStatus: SupportTicketStatus;
  initialNote: string;
}) {
  const t = useTranslations('support.admin.detail');
  const tStatus = useTranslations('support.status');
  const router = useRouter();
  const [status, setStatus] = useState<SupportTicketStatus>(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await updateSupportTicket({
          id: ticketId,
          status,
          adminNote: note.trim() ? note.trim() : undefined,
        });
        if ('error' in res) {
          setError(
            t.has(`errors.${res.error}`)
              ? t(`errors.${res.error}`)
              : t('errorFallback'),
          );
          return;
        }
        appToast.success(t('successToast'));
        router.refresh();
      } catch {
        setError(t('errorFallback'));
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="status"
          className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
        >
          {t('statusLabel')}
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as SupportTicketStatus)}
          className="w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5 text-sm text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        >
          <option value="open">{tStatus('open')}</option>
          <option value="in_progress">{tStatus('in_progress')}</option>
          <option value="closed">{tStatus('closed')}</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="note"
          className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
        >
          {t('noteLabel')}
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder={t('notePlaceholder')}
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

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t('savingButton') : t('saveButton')}
        </button>
      </div>
    </form>
  );
}
