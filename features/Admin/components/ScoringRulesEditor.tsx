'use client';

import { useTranslations } from 'next-intl';


import { useState, useTransition } from 'react';
import { Check, Pencil, X, Loader2 } from 'lucide-react';
import { appToast } from '@/shared/lib/toast';
import { updateScoringRule } from '../actions';
import type { ScoringRule, ScoringTrigger } from '../reports-queries';

type Props = { rules: ScoringRule[] };



const TRIGGER_ORDER: ScoringTrigger[] = [
  'lesson_completed',
  'rating_given',
  'enrollment_new',
  'chat_message',
];

export function ScoringRulesEditor({ rules }: Props) {
  const t = useTranslations('adminReports');
  const LABELS: Record<ScoringTrigger, { label: string; hint: string }> = {
  lesson_completed: {
    label: t('lessonCompleted'),
    hint: t('lessonPointsHelp'),
  },
  rating_given: {
    label: t('ratingSubmitted'),
    hint: t('ratingPointsHelp'),
  },
  enrollment_new: {
    label: t('newEnrollment'),
    hint: t('enrollmentPointsHelp'),
  },
  chat_message: {
    label: t('courseMessage'),
    hint: t('chatPointsHelp'),
  },
};

  const pointsByTrigger = Object.fromEntries(
    rules.map((r) => [r.trigger, r.points] as const),
  ) as Record<ScoringTrigger, number>;

  const [editing, setEditing] = useState<ScoringTrigger | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [pending, startTransition] = useTransition();

  function beginEdit(trigger: ScoringTrigger) {
    setEditing(trigger);
    setDraft(String(pointsByTrigger[trigger] ?? 0));
  }

  function save(trigger: ScoringTrigger) {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      appToast.danger(t('invalidPoints'));
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateScoringRule(trigger, n);
        if ('error' in result) {
          appToast.danger(t('scoringFailed'));
          return;
        }
        appToast.success(t('scoringUpdated'));
        setEditing(null);
      } catch {
        appToast.danger(t('scoringFailed'));
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <header className="px-4 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-bold text-[var(--color-foreground)]"> {t('scoringRules')} </p>
        <p className="text-[11px] text-[var(--color-muted-foreground)]"> {t('scoringHelp')} </p>
      </header>
      <ul className="divide-y divide-[var(--color-border)]">
        {TRIGGER_ORDER.map((trigger) => {
          const meta = LABELS[trigger];
          const points = pointsByTrigger[trigger] ?? 0;
          const isEditing = editing === trigger;
          return (
            <li
              key={trigger}
              className="px-4 py-3 flex items-center gap-3 text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--color-foreground)]">
                  {meta.label}
                </p>
                <p className="text-[11px] text-[var(--color-muted-foreground)] truncate">
                  {meta.hint}
                </p>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save(trigger);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    autoFocus
                    disabled={pending}
                    aria-label={t('pointsLabel', { rule: meta.label })}
                    className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-sm tabular-nums text-[var(--color-foreground)] text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                  />
                  <span className="text-xs text-[var(--color-muted-foreground)]"> {t('pointsUnit')} </span>
                  <button
                    type="button"
                    onClick={() => save(trigger)}
                    disabled={pending}
                    className="p-1.5 rounded-lg text-white disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                    aria-label={t('save')}
                  >
                    {pending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    disabled={pending}
                    className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                    aria-label={t('cancel')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--color-foreground)]">
                    {points} {t('pointsUnit')} </span>
                  <button
                    type="button"
                    onClick={() => beginEdit(trigger)}
                    className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
                    aria-label={t('editRule', { rule: meta.label })}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
