import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/learning.json';
import pt from '@/core/i18n/locales/pt/learning.json';
import es from '@/core/i18n/locales/es/learning.json';
import type { StudentQuiz } from '@/features/Quizzes/types';
import { QuizRunner } from './QuizRunner';
import { MarkCompleteButton } from './MarkCompleteButton';
import { LessonRating } from './LessonRating';
import { SegmentedProgressBar } from './SegmentedProgressBar';

const mocks = vi.hoisted(() => ({ submit: vi.fn(), complete: vi.fn(), danger: vi.fn(), success: vi.fn(), refresh: vi.fn(), confetti: vi.fn() }));
vi.mock('@/features/Quizzes/actions', () => ({ submitQuizAttempt: mocks.submit }));
vi.mock('@/features/Progress/actions', () => ({ setLessonCompleted: mocks.complete }));
vi.mock('@/shared/lib/toast', () => ({ appToast: { danger: mocks.danger, success: mocks.success } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/shared/motion/useConfetti', () => ({ useConfetti: () => mocks.confetti }));
const catalogs = { en, pt, es };
const quiz: StudentQuiz = {
  id: 'quiz', lessonId: 'lesson', intro: 'Authored introduction', passThresholdPercent: 70,
  maxAttempts: 2, showCorrectAnswers: true,
  questions: [{ id: 'question', type: 'single_choice', prompt: 'Authored question?', sortOrder: 0,
    options: [{ id: 'answer', text: 'Authored answer', sortOrder: 0 }] }],
};
function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={{ learning: catalogs[locale] }} timeZone="UTC">{children}</NextIntlClientProvider>;
  };
}
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each(['en', 'pt', 'es'] as const)('Learning interactions in %s', locale => {
  const copy = catalogs[locale];
  const t = createTranslator({ locale, messages: copy });
  const options = { wrapper: wrapper(locale) };

  it.each(['maxAttemptsReached', 'saveAttemptFailed', 'PRIVATE unknown error', 'transport'])('translates quiz failure %s and preserves answers for retry', async code => {
    if (code === 'transport') mocks.submit.mockRejectedValue(new Error('PRIVATE network diagnostic'));
    else mocks.submit.mockResolvedValue({ error: code });
    render(<QuizRunner quiz={quiz} initialAttemptsUsed={0} initialAlreadyPassed={false} />, options);
    expect(screen.getByText(t('quiz.questions', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t('quiz.threshold', { percent: 0.7 }).replace(/\s/g, ' '))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.quiz.start }));
    expect(screen.getByRole('button', { name: copy.quiz.submit })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Authored answer' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.quiz.submit })); });
    const key = code === 'maxAttemptsReached' || code === 'saveAttemptFailed' ? code : 'submitFailed';
    expect(mocks.danger).toHaveBeenCalledWith(copy.errors[key]);
    expect(mocks.submit).toHaveBeenCalledWith({ quizId: 'quiz', answers: { question: 'answer' } });
    expect(screen.getByRole('radio', { name: 'Authored answer' })).toBeChecked();
    expect(screen.getByRole('button', { name: copy.quiz.submit })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: copy.quiz.passed })).toBeNull();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('renders localized failed score and retry with authored answers hidden', async () => {
    mocks.submit.mockResolvedValue({ scorePercent: 0, passed: false, correctCount: 0, totalQuestions: 1, attemptsUsed: 1, maxAttempts: 2, perQuestion: null });
    render(<QuizRunner quiz={quiz} initialAttemptsUsed={0} initialAlreadyPassed={false} />, options);
    fireEvent.click(screen.getByRole('button', { name: copy.quiz.start }));
    fireEvent.click(screen.getByRole('radio', { name: 'Authored answer' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.quiz.submit })); });
    expect(screen.getByRole('heading', { name: copy.quiz.failed })).toBeInTheDocument();
    expect(screen.getByText(copy.quiz.answersHidden)).toBeInTheDocument();
    expect(document.querySelector('strong')?.textContent).toBe(new Intl.NumberFormat(locale, { style: 'percent' }).format(0));
    fireEvent.click(screen.getByRole('button', { name: copy.quiz.retry }));
    expect(screen.getByRole('radio', { name: 'Authored answer' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: copy.quiz.submit })).toBeDisabled();
  });

  it('does not refresh or celebrate completion on returned or thrown failures', async () => {
    mocks.complete.mockResolvedValueOnce({ error: 'saveProgressFailed' }).mockRejectedValueOnce(new Error('PRIVATE')).mockResolvedValueOnce({ success: true, courseJustCompleted: false });
    render(<MarkCompleteButton lessonId="lesson" isCompleted={false} />, options);
    for (let i = 0; i < 2; i++) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.completion.mark })); });
      expect(mocks.danger).toHaveBeenLastCalledWith(copy.errors.saveProgress);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.confetti).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.completion.mark })); });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith(copy.completion.lessonTitle, copy.completion.lessonMessage);
  });

  it('uses status-based rating errors and restores the saved rating after failed updates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ myRating: { stars: 3, comment: null }, aggregate: { avg: 3.5, count: 2, distribution: {} } })))
      .mockResolvedValueOnce(new Response('PRIVATE save diagnostic', { status: 403 }))
      .mockRejectedValueOnce(new Error('PRIVATE remove diagnostic'));
    render(<LessonRating lessonId="lesson" />, options);
    await waitFor(() => expect(screen.getByRole('radio', { name: t('rating.stars', { count: 3 }) })).toBeChecked());
    expect(screen.getByText(new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(3.5))).toBeInTheDocument();
    expect(screen.getByText(t('rating.count', { count: 2 }), { exact: false })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: t('rating.stars', { count: 5 }) })); });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.rating.accessDenied);
    expect(screen.getByRole('radio', { name: t('rating.stars', { count: 3 }) })).toBeChecked();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.rating.remove })); });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.rating.removeFailed);
    expect(screen.getByRole('button', { name: copy.rating.remove })).toBeEnabled();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('renders localized progress accessibility and counts while keeping numeric values', () => {
    render(<SegmentedProgressBar modules={[]} totalLessons={3} completedLessons={1} />, options);
    expect(screen.getByRole('progressbar', { name: t('progress.label', { completed: 1, total: 3 }) })).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText(t('progress.completed', { completed: 1, total: 3 }))).toBeInTheDocument();
    expect(screen.getByText(new Intl.NumberFormat(locale, { style: 'percent' }).format(0.33).replace(/\s/g, ' '))).toBeInTheDocument();
  });
});
