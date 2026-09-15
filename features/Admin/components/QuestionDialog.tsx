'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useState, useTransition } from 'react';
import {
  X,
  Loader2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  Check,
} from 'lucide-react';
import {
  createQuestion,
  updateQuestion,
  type QuestionInput,
} from '@/features/Admin/quizzes';
import type { AdminQuizQuestion, QuestionType } from '@/features/Quizzes/types';
import { appToast } from '@/shared/lib/toast';

type Mode = 'create' | 'edit';

type Props = {
  mode: Mode;
  quizId: string;
  question?: AdminQuizQuestion | null;
  courseSlug: string;
  onClose: () => void;
  onSaved: () => void;
};

type OptionDraft = { id?: string; text: string; isCorrect: boolean };

export function QuestionDialog({
  mode,
  quizId,
  question,
  courseSlug,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations('adminContent');
  function blankOptions(type: QuestionType): OptionDraft[] {
    if (type === 'true_false') {
      return [
        { text: t('true'), isCorrect: true },
        { text: t('false'), isCorrect: false },
      ];
    }
    return [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ];
  }

  const [type, setType] = useState<QuestionType>(
    question?.type ?? 'single_choice',
  );
  const [prompt, setPrompt] = useState(question?.prompt ?? '');
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    question
      ? question.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
        }))
      : blankOptions('single_choice'),
  );
  const [pending, startTransition] = useTransition();

  function changeType(next: QuestionType) {
    if (next === type) return;
    setType(next);
    // A type change is explicit author intent. Existing option text is otherwise
    // preserved verbatim, including saved true/false labels from another locale.
    setOptions(blankOptions(next));
  }

  function setOption(idx: number, patch: Partial<OptionDraft>) {
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    );
  }

  function markCorrect(idx: number) {
    // Single-choice: only one correct
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === idx })));
  }

  function addOption() {
    if (type === 'true_false') return;
    setOptions((prev) => [...prev, { text: '', isCorrect: false }]);
  }

  function removeOption(idx: number) {
    if (type === 'true_false') return;
    if (options.length <= 2) return;
    setOptions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // If we removed the correct one, make the first remaining correct
      if (!next.some((o) => o.isCorrect)) next[0].isCorrect = true;
      return next;
    });
  }

  function moveOption(idx: number, dir: -1 | 1) {
    if (type === 'true_false') return;
    const target = idx + dir;
    if (target < 0 || target >= options.length) return;
    setOptions((prev) => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }

  function handleSave() {
    if (!prompt.trim()) {
      appToast.warning(t('promptIsRequired'));
      return;
    }

    const input: QuestionInput = {
      type,
      prompt: prompt.trim(),
      explanation: explanation.trim() || null,
      options: options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    };

    startTransition(async () => {
      try {
        const result =
          mode === 'create'
            ? await createQuestion(quizId, input, courseSlug)
            : await updateQuestion(question!.id, input, courseSlug);
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        appToast.success(
          mode === 'create' ? t('questionAdded') : t('questionUpdated'),
        );
        onSaved();
        onClose();
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-[var(--color-card)] shadow-xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-foreground)]">
            {mode === 'create' ? t('newQuestion') : t('editQuestion')}
          </h2>
          <button
            aria-label={t('close')}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-muted)]"
          >
            <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Field label={t('type')}>
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  ['single_choice', t('singleChoice')],
                  ['true_false', t('trueFalse')],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeType(value)}
                  aria-pressed={type === value}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    type === value
                      ? 'text-white'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  }`}
                  style={
                    type === value
                      ? { backgroundColor: 'var(--color-primary)' }
                      : undefined
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('prompt')}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder={t('whatIsThePastTenseOfGo')}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <Field
            label={t('options')}
            hint={
              type === 'true_false'
                ? t('pickWhichOptionTrueOrFalseIsCorrect')
                : t('addOptionsAndMarkExactlyOneAsCorrect')
            }
          >
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-2"
                >
                  {type === 'single_choice' && (
                    <div className="flex flex-col shrink-0">
                      <button
                        type="button"
                        aria-label={t('moveUp')}
                        onClick={() => moveOption(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={t('moveDown')}
                        onClick={() => moveOption(idx, 1)}
                        disabled={idx === options.length - 1}
                        className="p-0.5 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => markCorrect(idx)}
                    title={t('markCorrect')}
                    aria-label={t('markCorrectOption', { index: idx + 1 })}
                    aria-pressed={opt.isCorrect}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition shrink-0 ${
                      opt.isCorrect
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-[var(--color-border)] text-transparent hover:border-green-500/50'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>

                  <input
                    value={opt.text}
                    onChange={(e) => setOption(idx, { text: e.target.value })}
                    placeholder={
                      type === 'true_false' ? t('trueFalse') : t('optionText')
                    }
                    disabled={type === 'true_false'}
                    className={`${inputClass} py-1.5 ${type === 'true_false' ? 'opacity-70' : ''}`}
                  />

                  {type === 'single_choice' && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      disabled={options.length <= 2}
                      className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-30"
                      aria-label={t('removeOption')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {type === 'single_choice' && (
                <button
                  type="button"
                  onClick={addOption}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('addOption')}{' '}
                </button>
              )}
            </div>
          </Field>

          <Field
            label={t('explanation')}
            hint={t('optionalShownWhenTheStudentSeesCorrectAnswersAfter')}
          >
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder={t('whyIsThisTheRightAnswer')}
              className={`${inputClass} resize-none`}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-muted)]/40">
          <button
            aria-label={t('close')}
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            {t('cancel')}{' '}
          </button>
          <button
            onClick={handleSave}
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'create' ? t('addQuestion') : t('saveQuestion')}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-[var(--color-foreground)]">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}
