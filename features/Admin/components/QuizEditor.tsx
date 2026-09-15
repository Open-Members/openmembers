'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  HelpCircle,
  Save,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  createQuizForLesson,
  getQuizForLesson,
  updateQuizConfig,
  deleteQuestion,
  reorderQuestions,
} from '@/features/Admin/quizzes';
import { appToast } from '@/shared/lib/toast';
import type { AdminQuiz, AdminQuizQuestion } from '@/features/Quizzes/types';
import { QuestionDialog } from './QuestionDialog';

type Props = {
  courseSlug: string;
  lessonSlug: string;
  lessonId: string;
  lessonTitle: string;
  initialQuiz: AdminQuiz | null;
};

type ConfiguredProps = Omit<Props, 'lessonId' | 'initialQuiz'> & {
  initialQuiz: AdminQuiz;
};

type ConfigForm = {
  intro: string;
  passThresholdPercent: number;
  maxAttempts: string; // string so "" means unlimited
  showCorrectAnswers: boolean;
};

function initConfig(q: AdminQuiz): ConfigForm {
  return {
    intro: q.intro ?? '',
    passThresholdPercent: q.passThresholdPercent,
    maxAttempts: q.maxAttempts === null ? '' : String(q.maxAttempts),
    showCorrectAnswers: q.showCorrectAnswers,
  };
}

export function QuizEditor({ lessonId, initialQuiz, ...props }: Props) {
  const t = useTranslations('adminContent');
  const [quiz, setQuiz] = useState(initialQuiz);
  const [pending, startTransition] = useTransition();

  if (quiz) {
    return <ConfiguredQuizEditor {...props} initialQuiz={quiz} />;
  }

  function createQuiz() {
    startTransition(async () => {
      try {
        const result = await createQuizForLesson(lessonId);
        if ('error' in result) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        setQuiz(result.data);
        appToast.success(t('quizCreated'));
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16">
      <Link
        href={`/admin/content/${props.courseSlug}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('backToCourseContent')}
      </Link>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">
          {t('quiz')} <span className="font-mono">/{props.lessonSlug}</span>
        </p>
        <h1 className="text-2xl md:text-3xl font-black text-[var(--color-foreground)]">
          {props.lessonTitle}
        </h1>
      </div>

      <section className="rounded-2xl border-2 border-dashed border-[var(--color-border)] py-16 px-6 text-center">
        <HelpCircle className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2" />
        <p className="font-semibold text-[var(--color-foreground)]">
          {t('quizNotConfigured')}
        </p>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1 mb-5">
          {t('quizNotConfiguredHelp')}
        </p>
        <button
          type="button"
          onClick={createQuiz}
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? t('creatingQuiz') : t('createQuiz')}
        </button>
      </section>
    </div>
  );
}

function ConfiguredQuizEditor({
  courseSlug,
  lessonSlug,
  lessonTitle,
  initialQuiz,
}: ConfiguredProps) {
  const t = useTranslations('adminContent');
  const [quiz, setQuiz] = useState<AdminQuiz>(initialQuiz);
  const [config, setConfig] = useState<ConfigForm>(initConfig(initialQuiz));
  const [savedConfig, setSavedConfig] = useState<ConfigForm>(
    initConfig(initialQuiz),
  );
  const [pending, startTransition] = useTransition();
  const [questionDialog, setQuestionDialog] = useState<
    null | { mode: 'create' } | { mode: 'edit'; question: AdminQuizQuestion }
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  function reload() {
    startTransition(async () => {
      try {
        const fresh = await getQuizForLesson(quiz.lessonId);
        if (!fresh) {
          appToast.danger(t('errors.notFound'));
          return;
        }
        setQuiz(fresh);
        setConfig(initConfig(fresh));
        setSavedConfig(initConfig(fresh));
      } catch {
        appToast.danger(t('errors.loadFailed'));
      }
    });
  }

  function saveConfig() {
    startTransition(async () => {
      try {
        const maxAttemptsNum = config.maxAttempts.trim()
          ? Number(config.maxAttempts)
          : null;
        if (
          maxAttemptsNum !== null &&
          (!Number.isFinite(maxAttemptsNum) ||
            !Number.isInteger(maxAttemptsNum) ||
            maxAttemptsNum < 1)
        ) {
          appToast.warning(t('errors.attemptsInvalid'));
          return;
        }
        const result = await updateQuizConfig(
          quiz.id,
          {
            intro: config.intro,
            passThresholdPercent: config.passThresholdPercent,
            maxAttempts: maxAttemptsNum,
            showCorrectAnswers: config.showCorrectAnswers,
          },
          courseSlug,
        );
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        setSavedConfig(config);
        appToast.success(t('quizSettingsSaved'));
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= quiz.questions.length) return;
    const previous = quiz;
    const newOrder = [...quiz.questions];
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    setQuiz({ ...quiz, questions: newOrder });
    startTransition(async () => {
      try {
        const result = await reorderQuestions(
          quiz.id,
          newOrder.map((q) => q.id),
          courseSlug,
        );
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          setQuiz(previous);
        }
      } catch {
        setQuiz(previous);
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function handleDelete(questionId: string) {
    startTransition(async () => {
      try {
        const result = await deleteQuestion(questionId, courseSlug);
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        setQuiz({
          ...quiz,
          questions: quiz.questions.filter((q) => q.id !== questionId),
        });
        setDeletingId(null);
        appToast.success(t('questionRemoved'));
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16">
      {/* Breadcrumb */}
      <Link
        href={`/admin/content/${courseSlug}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('backToCourseContent')}{' '}
      </Link>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">
          {t('quiz')} <span className="font-mono">/{lessonSlug}</span>
        </p>
        <h1 className="text-2xl md:text-3xl font-black text-[var(--color-foreground)]">
          {lessonTitle}
        </h1>
      </div>

      {/* Settings */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {t('settings')}{' '}
        </h2>

        <div>
          <label className="text-sm font-medium text-[var(--color-foreground)] block mb-1.5">
            {t('intro')}{' '}
          </label>
          <textarea
            value={config.intro}
            onChange={(e) =>
              setConfig((c) => ({ ...c, intro: e.target.value }))
            }
            rows={2}
            placeholder={t('optionalShownToStudentsBeforeTheyStartTheQuiz')}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--color-foreground)] block mb-1.5">
              {t('passThreshold')}{' '}
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={config.passThresholdPercent}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  passThresholdPercent: parseInt(e.target.value, 10) || 70,
                }))
              }
              className={`${inputClass} w-32`}
            />
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              {t('scoreNeededToPassAndMarkTheLessonComplete')}{' '}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-foreground)] block mb-1.5">
              {t('maxAttempts')}{' '}
            </label>
            <input
              type="number"
              min={1}
              value={config.maxAttempts}
              onChange={(e) =>
                setConfig((c) => ({ ...c, maxAttempts: e.target.value }))
              }
              placeholder={t('unlimited')}
              className={`${inputClass} w-32`}
            />
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              {t('leaveEmptyForUnlimitedRetries')}{' '}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 cursor-pointer hover:bg-[var(--color-muted)]/40 transition">
          <input
            type="checkbox"
            checked={config.showCorrectAnswers}
            onChange={(e) =>
              setConfig((c) => ({ ...c, showCorrectAnswers: e.target.checked }))
            }
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-semibold text-[var(--color-foreground)]">
              {t('showCorrectAnswersAfterSubmission')}{' '}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {t('studentsSeeWhichOptionsWereRightPlusTheExplanations')}{' '}
            </p>
          </div>
        </label>

        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <button
              onClick={() => setConfig(savedConfig)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              {t('discard')}{' '}
            </button>
          )}
          <button
            onClick={saveConfig}
            disabled={!dirty || pending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t('saveSettings')}{' '}
          </button>
        </div>
      </section>

      {/* Questions */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-[var(--color-foreground)]">
              {t('questions')}{' '}
            </h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('questionCount', { count: quiz.questions.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setQuestionDialog({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Plus className="w-4 h-4" />
            {t('addQuestion')}{' '}
          </button>
        </div>

        {quiz.questions.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] py-16 text-center">
            <HelpCircle className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2" />
            <p className="font-semibold text-[var(--color-foreground)]">
              {t('noQuestionsYet')}{' '}
            </p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              {t('addAQuestionToBuildTheQuiz')}{' '}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {quiz.questions.map((q, idx) => {
              const correctOpt = q.options.find((o) => o.isCorrect);
              return (
                <div
                  key={q.id}
                  className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
                >
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      aria-label={t('moveUp')}
                      onClick={() => moveQuestion(idx, -1)}
                      disabled={pending || idx === 0}
                      className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('moveDown')}
                      onClick={() => moveQuestion(idx, 1)}
                      disabled={pending || idx === quiz.questions.length - 1}
                      className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="text-xs font-mono font-bold text-[var(--color-muted-foreground)] w-8 pt-1 text-right">
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[var(--color-muted)] text-[var(--color-muted-foreground)] px-2 py-0.5 rounded-full">
                        {q.type === 'true_false'
                          ? t('trueFalse')
                          : t('singleChoice')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--color-foreground)] whitespace-pre-wrap">
                      {q.prompt}
                    </p>
                    {correctOpt && (
                      <p className="text-xs text-green-700 dark:text-green-400 mt-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('correct')} {correctOpt.text}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setQuestionDialog({ mode: 'edit', question: q })
                      }
                      className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
                      aria-label={t('editQuestion')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {deletingId === q.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(q.id)}
                          disabled={pending}
                          className="px-2 py-1 rounded-lg bg-[var(--color-accent)] text-white text-xs font-semibold"
                        >
                          {t('confirm')}{' '}
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                        >
                          {t('cancel')}{' '}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(q.id)}
                        className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
                        aria-label={t('deleteQuestion')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {questionDialog && (
        <QuestionDialog
          mode={questionDialog.mode}
          quizId={quiz.id}
          question={
            questionDialog.mode === 'edit' ? questionDialog.question : null
          }
          courseSlug={courseSlug}
          onClose={() => setQuestionDialog(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

const inputClass =
  'rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]';
