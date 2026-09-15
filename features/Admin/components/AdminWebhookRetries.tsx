'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, Trash2, AlertTriangle, Clock } from 'lucide-react';
import {
  getAdminDeadLetters,
  retryDeadLetterNow,
  deleteDeadLetter,
  type AdminDeadLetter,
} from '../actions';
import { appToast } from '@/shared/lib/toast';
import { useAdminOperationsPresentation } from '../operations-presentation';

export function AdminWebhookRetries({
  initial,
}: {
  initial: AdminDeadLetter[];
}) {
  const { t, error, dateTime } = useAdminOperationsPresentation();
  const [rows, setRows] = useState<AdminDeadLetter[]>(initial);
  const [filter, setFilter] = useState<'all' | 'pending' | 'abandoned'>('all');
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function refresh(nextFilter: 'all' | 'pending' | 'abandoned' = filter) {
    try {
      const fresh = await getAdminDeadLetters(nextFilter);
      setRows(fresh);
    } catch (cause) {
      appToast.danger(error(cause, 'loadFailed'));
    }
  }

  function reload(nextFilter: 'all' | 'pending' | 'abandoned' = filter) {
    startTransition(() => refresh(nextFilter));
  }

  function handleRetry(id: string) {
    startTransition(async () => {
      try {
        const result = await retryDeadLetterNow(id);
        if ('error' in result) {
          appToast.danger(error(result.error));
          return;
        }
        appToast.success(t('integrations.retries.retryQueued'));
        await refresh();
      } catch (cause) {
        appToast.danger(error(cause));
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteDeadLetter(id);
        if ('error' in result) {
          appToast.danger(error(result.error));
          return;
        }
        setConfirmDelete(null);
        appToast.success(t('integrations.retries.deleted'));
        await refresh();
      } catch (cause) {
        appToast.danger(error(cause));
      }
    });
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const abandonedCount = rows.filter((r) => r.status === 'abandoned').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-[var(--color-muted)] rounded-lg p-1 w-fit">
        {(
          [
            ['all', t('integrations.retries.filters.all', { count: rows.length })],
            ['pending', t('integrations.retries.filters.pending', { count: pendingCount })],
            ['abandoned', t('integrations.retries.filters.abandoned', { count: abandonedCount })],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setFilter(key);
              reload(key);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              filter === key
                ? 'bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm'
                : 'text-[var(--color-muted-foreground)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('integrations.retries.empty')}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--color-card)] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('integrations.retries.columns.provider')}</th>
                  <th className="px-4 py-3 text-left">{t('integrations.retries.columns.event')}</th>
                  <th className="px-4 py-3 text-left">{t('integrations.retries.columns.status')}</th>
                  <th className="px-4 py-3 text-center">{t('integrations.retries.columns.attempts')}</th>
                  <th className="px-4 py-3 text-left">{t('integrations.retries.columns.lastError')}</th>
                  <th className="px-4 py-3 text-left">{t('integrations.retries.columns.nextAttempt')}</th>
                  <th className="px-4 py-3 text-right">{t('integrations.retries.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statusClasses =
                    r.status === 'pending'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      : r.status === 'abandoned'
                        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300';
                  const StatusIcon =
                    r.status === 'abandoned' ? AlertTriangle : Clock;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                    >
                      <td className="px-4 py-3 text-xs font-semibold text-[var(--color-foreground)] uppercase">
                        {r.provider}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-foreground)] font-mono">
                        {r.eventType}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses}`}
                        >
                          <StatusIcon className="w-2.5 h-2.5" />
                          {t(`integrations.retries.status.${r.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-[var(--color-muted-foreground)]">
                        {r.attemptCount}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-600 dark:text-red-400 max-w-xs truncate">
                        {r.lastError
                          ? t('integrations.retries.errorSummary')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                        {r.status === 'pending'
                          ? dateTime(r.nextAttemptAt)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {confirmDelete === r.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={pending}
                              className="rounded bg-red-500 text-white px-2 py-0.5 text-[11px] font-bold hover:bg-red-600"
                            >
                              {t('integrations.retries.actions.confirmDelete')}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="rounded px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted-foreground)]"
                            >
                              {t('integrations.retries.actions.cancel')}
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleRetry(r.id)}
                              disabled={pending || r.status === 'processed'}
                              title={t('integrations.retries.actions.retryNow')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-40"
                            >
                              <RefreshCw className="w-3 h-3" />
                              {t('integrations.retries.actions.retry')}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(r.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-red-600 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-3 h-3" />
                              {t('integrations.retries.actions.delete')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
