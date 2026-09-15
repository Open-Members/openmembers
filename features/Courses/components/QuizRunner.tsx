'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import { submitQuizAttempt } from '@/features/Quizzes/actions';
import type { StudentQuiz, QuizResult } from '@/features/Quizzes/types';
import { appToast } from '@/shared/lib/toast';

type Props = {
  quiz: StudentQuiz;
  initialAttemptsUsed: number;
  initialAlreadyPassed: boolean;
};

type Stage = 'intro' | 'taking' | 'results';

export function QuizRunner({
  quiz,
  initialAttemptsUsed,
  initialAlreadyPassed,
}: Props) {
  const t = useTranslations('learning.quiz');
  const errors = useTranslations('learning.errors');
  const [stage, setStage] = useState<Stage>(initialAlreadyPassed ? 'intro' : 'intro');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [attemptsUsed, setAttemptsUsed] = useState(initialAttemptsUsed);
  const [pending, startTransition] = useTransition();

  const outOfAttempts =
    quiz.maxAttempts !== null && attemptsUsed >= quiz.maxAttempts;

  const allAnswered = useMemo(
    () => quiz.questions.every((q) => answers[q.id]),
    [quiz.questions, answers],
  );

  function pick(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function handleSubmit() {
    if (!allAnswered) {
      appToast.warning(t('answerEveryQuestion'));
      return;
    }
    startTransition(async () => {
      try {
        const res = await submitQuizAttempt({ quizId: quiz.id, answers });
        if ('error' in res) {
          appToast.danger(errors.has(res.error) ? errors(res.error) : errors('submitFailed'));
          return;
        }
        setResult(res);
        setAttemptsUsed(res.attemptsUsed);
        setStage('results');
      } catch {
        appToast.danger(errors('submitFailed'));
      }
    });
  }

  function retry() {
    setAnswers({});
    setResult(null);
    setStage('taking');
  }

  // ── Results view ───────────────────────────
  if (stage === 'results' && result) {
    return (
      <ResultsView
        result={result}
        quiz={quiz}
        onRetry={!result.passed && !outOfAttempts ? retry : null}
      />
    );
  }

  // ── Intro view ─────────────────────────────
  if (stage === 'intro') {
    return (
      <div className="max-w-2xl mx-auto text-center py-8 md:py-12 space-y-5">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <HelpCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-[var(--color-foreground)]">
          {initialAlreadyPassed ? t('alreadyPassed') : t('title')}
        </h2>

        {quiz.intro && (
          <p className="text-sm md:text-base text-[var(--color-muted-foreground)] whitespace-pre-wrap leading-relaxed">
            {quiz.intro}
          </p>
        )}

        <div className="flex items-center justify-center gap-4 text-xs text-[var(--color-muted-foreground)] flex-wrap">
          <span>
            {t('questions', { count: quiz.questions.length })}
          </span>
          <span>·</span>
          <span>{t('threshold', { percent: quiz.passThresholdPercent / 100 })}</span>
          {quiz.maxAttempts !== null && (
            <>
              <span>·</span>
              <span>
                {t('attemptOf', { attempt: Math.min(attemptsUsed + 1, quiz.maxAttempts), max: quiz.maxAttempts })}
              </span>
            </>
          )}
        </div>

        {quiz.questions.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('empty')}
          </p>
        ) : outOfAttempts && !initialAlreadyPassed ? (
          <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-sm font-semibold">
            <AlertTriangle className="w-4 h-4" />
            {t('outOfAttempts')}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStage('taking')}
            className="px-6 py-3 rounded-xl text-white text-sm font-bold"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {initialAlreadyPassed ? t('takeAgain') : t('start')}
          </button>
        )}
      </div>
    );
  }

  // ── Taking view ────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {t('takingSummary', { count: quiz.questions.length, percent: quiz.passThresholdPercent / 100 })}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {t('answered', { answered: Object.keys(answers).length, total: quiz.questions.length })}
        </p>
      </div>

      <div className="space-y-4">
        {quiz.questions.map((q, qIdx) => {
          const selected = answers[q.id];
          return (
            <section
              key={q.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-3"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {t('questionNumber', { number: String(qIdx + 1).padStart(2, '0') })}
                </span>
              </div>
              <p className="text-base md:text-lg font-semibold text-[var(--color-foreground)] whitespace-pre-wrap">
                {q.prompt}
              </p>
              <div className="space-y-2">
                {q.options.map((o) => {
                  const isPicked = selected === o.id;
                  return (
                    <label
                      key={o.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${
                        isPicked
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={o.id}
                        checked={isPicked}
                        onChange={() => pick(q.id, o.id)}
                        className="accent-[var(--color-primary)]"
                      />
                      <span className="text-sm text-[var(--color-foreground)]">
                        {o.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !allAnswered}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('submit')}
        </button>
      </div>
    </div>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────

function ResultsView({
  result,
  quiz,
  onRetry,
}: {
  result: QuizResult;
  quiz: StudentQuiz;
  onRetry: (() => void) | null;
}) {
  const t = useTranslations('learning.quiz');
  return (
    <div className="max-w-3xl mx-auto py-4 space-y-8">
      {/* Score banner */}
      <div
        className={`rounded-2xl p-6 md:p-8 text-center ${
          result.passed
            ? 'bg-green-500/10 border border-green-500/30'
            : 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30'
        }`}
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3"
             style={{
               backgroundColor: result.passed ? '#16a34a' : 'var(--color-accent)',
               color: 'white',
             }}>
          {result.passed ? (
            <Trophy className="w-7 h-7" />
          ) : (
            <XCircle className="w-7 h-7" />
          )}
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-[var(--color-foreground)]">
          {result.passed ? t('passed') : t('failed')}
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          {t.rich('score', { percent: result.scorePercent / 100, correct: result.correctCount, total: result.totalQuestions, threshold: quiz.passThresholdPercent / 100, strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
          {result.maxAttempts !== null
            ? t('attemptOf', { attempt: result.attemptsUsed, max: result.maxAttempts })
            : t('attempt', { attempt: result.attemptsUsed })}
        </p>
      </div>

      {/* Per-question breakdown */}
      {result.perQuestion ? (
        <div className="space-y-4">
          {result.perQuestion.map((q, idx) => (
            <section
              key={q.id}
              className={`rounded-2xl border p-5 space-y-3 ${
                q.isCorrect
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5'
              }`}
            >
              <div className="flex items-start gap-3">
                {q.isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-[var(--color-accent)] shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {t('questionNumber', { number: String(idx + 1).padStart(2, '0') })}
                  </span>
                  <p className="text-base font-semibold text-[var(--color-foreground)] mt-0.5 whitespace-pre-wrap">
                    {q.prompt}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5 pl-8">
                {q.options.map((o) => {
                  const isSelected = o.id === q.selectedOptionId;
                  const isCorrect = o.id === q.correctOptionId;
                  return (
                    <div
                      key={o.id}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        isCorrect
                          ? 'bg-green-500/10 text-green-800 dark:text-green-300 font-semibold'
                          : isSelected
                            ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] line-through'
                            : 'text-[var(--color-muted-foreground)]'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isSelected ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <span className="w-4 h-4" />
                      )}
                      {o.text}
                    </div>
                  );
                })}
              </div>
              {q.explanation && (
                <p className="text-sm text-[var(--color-muted-foreground)] italic pl-8">
                  {q.explanation}
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)] text-center italic">
          {t('answersHidden')}
        </p>
      )}

      {/* Actions */}
      {onRetry && (
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
          >
            <RotateCcw className="w-4 h-4" />
            {t('retry')}
          </button>
        </div>
      )}
    </div>
  );
}
