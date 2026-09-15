import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/adminContent.json';
import pt from '@/core/i18n/locales/pt/adminContent.json';
import es from '@/core/i18n/locales/es/adminContent.json';
import type { AdminQuizQuestion } from '@/features/Quizzes/types';

const mocks = vi.hoisted(() => ({
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  toast: {
    success: vi.fn(),
    danger: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/features/Admin/quizzes', () => ({
  createQuestion: mocks.createQuestion,
  updateQuestion: mocks.updateQuestion,
}));
vi.mock('@/shared/lib/toast', () => ({ appToast: mocks.toast }));

import { QuestionDialog } from './QuestionDialog';

const catalogs = { en, pt, es } as const;
const savedQuestion: AdminQuizQuestion = {
  id: 'question-1',
  type: 'true_false',
  prompt: 'The authored prompt',
  explanation: 'The authored explanation',
  sortOrder: 0,
  options: [
    {
      id: 'option-1',
      text: 'Author choice A',
      isCorrect: true,
      sortOrder: 0,
    },
    {
      id: 'option-2',
      text: 'Author choice B',
      isCorrect: false,
      sortOrder: 1,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateQuestion.mockResolvedValue({ success: true });
});

afterEach(cleanup);

it.each(Object.entries(catalogs))(
  'preserves saved answer text and IDs in %s until the author changes type',
  async (locale, messages) => {
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={{ adminContent: messages }}
      >
        <QuestionDialog
          mode="edit"
          quizId="quiz-1"
          question={savedQuestion}
          courseSlug="course"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByDisplayValue('Author choice A')).toBeDisabled();
    expect(screen.getByDisplayValue('Author choice B')).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', { name: messages.saveQuestion }),
    );
    await waitFor(() => expect(mocks.updateQuestion).toHaveBeenCalledOnce());
    expect(mocks.updateQuestion).toHaveBeenCalledWith(
      'question-1',
      expect.objectContaining({
        options: [
          { id: 'option-1', text: 'Author choice A', isCorrect: true },
          { id: 'option-2', text: 'Author choice B', isCorrect: false },
        ],
      }),
      'course',
    );

    fireEvent.click(
      screen.getByRole('button', { name: messages.singleChoice }),
    );
    fireEvent.click(screen.getByRole('button', { name: messages.trueFalse }));
    expect(screen.getByDisplayValue(messages.true)).toBeDisabled();
    expect(screen.getByDisplayValue(messages.false)).toBeDisabled();
  },
);
