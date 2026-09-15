// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/core/access/admin', () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { reorderQuestions, updateQuizConfig } from './quizzes';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({});
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  'rejects invalid max-attempt value %s before a database write',
  async (maxAttempts) => {
    await expect(
      updateQuizConfig(
        'quiz-1',
        {
          intro: null,
          passThresholdPercent: 70,
          maxAttempts,
          showCorrectAnswers: true,
        },
        'course',
      ),
    ).resolves.toEqual({ error: 'attemptsInvalid' });
    expect(mocks.from).not.toHaveBeenCalled();
  },
);

it('rejects duplicate question IDs before a reorder write', async () => {
  await expect(
    reorderQuestions('quiz-1', ['question-1', 'question-1'], 'course'),
  ).resolves.toEqual({ error: 'invalidInput' });
  expect(mocks.from).not.toHaveBeenCalled();
});
