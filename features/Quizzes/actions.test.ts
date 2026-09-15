import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(),
  access: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  findCourseIdForLesson: vi.fn(),
  markCourseCompletedIfReady: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({ createClient: mocks.session }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/access/server', () => ({ isUserLessonAccessible: mocks.access }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/activity/track', () => ({
  findCourseIdForLesson: mocks.findCourseIdForLesson,
  markCourseCompletedIfReady: mocks.markCourseCompletedIfReady,
}));

import { submitQuizAttempt } from './actions';

type Response = {
  data?: unknown;
  error: { message: string } | null;
};

let responses: Record<string, Response>;
let from: ReturnType<typeof vi.fn>;

const correctAnswer = { 'question-1': 'option-correct' };
const wrongAnswer = { 'question-1': 'option-wrong' };

function savedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    status: 'saved',
    attempt_id: 'attempt-1',
    attempts_used: 1,
    max_attempts: 2,
    progress_completed: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  });
  mocks.access.mockResolvedValue(true);
  mocks.findCourseIdForLesson.mockResolvedValue('course-1');
  mocks.markCourseCompletedIfReady.mockResolvedValue({
    courseJustCompleted: false,
  });
  mocks.rpc.mockResolvedValue({ data: savedReceipt(), error: null });

  responses = {
    quizzes: {
      data: {
        id: 'quiz-1',
        lesson_id: 'lesson-1',
        pass_threshold_percent: 70,
        max_attempts: 2,
        show_correct_answers: true,
      },
      error: null,
    },
    quiz_questions: {
      data: [
        {
          id: 'question-1',
          type: 'single_choice',
          prompt: 'Authored question',
          explanation: 'Authored explanation',
          sort_order: 0,
        },
      ],
      error: null,
    },
    quiz_options: {
      data: [
        {
          id: 'option-correct',
          question_id: 'question-1',
          text: 'Correct authored option',
          is_correct: true,
          sort_order: 0,
        },
        {
          id: 'option-wrong',
          question_id: 'question-1',
          text: 'Wrong authored option',
          is_correct: false,
          sort_order: 1,
        },
      ],
      error: null,
    },
  };

  from = vi.fn((table: string) => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: async () => responses[table],
      then: (resolve: (response: Response) => unknown) =>
        resolve(responses[table]),
    };
    return builder;
  });
  mocks.admin.mockReturnValue({ from, rpc: mocks.rpc });
});

describe('transactional quiz submission', () => {
  it('rejects an errored identity response before opening the privileged client', async () => {
    mocks.session.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-1' } },
          error: { message: 'Session invalid' },
        }),
      },
    });

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toEqual({ error: 'notAuthenticated' });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('returns a safe key if the session provider throws', async () => {
    mocks.session.mockRejectedValue(new Error('Private provider details'));

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toEqual({ error: 'submitFailed' });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('does not open the privileged client without an authenticated user', async () => {
    mocks.session.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    });

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toEqual({ error: 'notAuthenticated' });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: 'Private database details' } },
  ])('fails closed when the quiz read is %s', async (response) => {
    responses.quizzes = response;

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toEqual({ error: 'quizUnavailable' });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not load grading content or write when lesson access is denied', async () => {
    mocks.access.mockResolvedValue(false);

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toEqual({ error: 'accessDenied' });
    expect(mocks.access).toHaveBeenCalledWith('user-1', 'lesson-1');
    expect(from.mock.calls.map(([table]) => table)).toEqual(['quizzes']);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['quiz_questions', { data: null, error: { message: 'Private details' } }, 'questionsUnavailable'],
    ['quiz_questions', { data: [], error: null }, 'quizEmpty'],
    ['quiz_options', { data: null, error: { message: 'Private details' } }, 'optionsUnavailable'],
    ['quiz_options', { data: [], error: null }, 'optionsUnavailable'],
  ] as const)(
    'does not persist when %s cannot provide grading input',
    async (table, response, expected) => {
      responses[table] = response;

      await expect(
        submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
      ).resolves.toEqual({ error: expected });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it('maps database errors and malformed receipts without exposing details', async () => {
    for (const response of [
      { data: null, error: { message: 'Private database details' } },
      { data: null, error: null },
      { data: { status: 'saved' }, error: null },
      {
        data: savedReceipt({ progress_completed: 'yes' }),
        error: null,
      },
    ]) {
      mocks.rpc.mockResolvedValueOnce(response);
      await expect(
        submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
      ).resolves.toEqual({ error: 'saveAttemptFailed' });
    }
    expect(mocks.findCourseIdForLesson).not.toHaveBeenCalled();
  });

  it.each([
    ['max_attempts_reached', 'maxAttemptsReached'],
    ['quiz_unavailable', 'quizUnavailable'],
    ['invalid_submission', 'saveAttemptFailed'],
  ] as const)('maps the stable RPC status %s to %s', async (status, error) => {
    mocks.rpc.mockResolvedValue({ data: { status }, error: null });

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toEqual({ error });
    expect(mocks.findCourseIdForLesson).not.toHaveBeenCalled();
  });

  it('returns a passed result only after the receipt confirms persisted progress', async () => {
    const result = await submitQuizAttempt({
      quizId: 'quiz-1',
      answers: correctAnswer,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('submit_quiz_attempt', {
      p_user_id: 'user-1',
      p_quiz_id: 'quiz-1',
      p_score_percent: 100,
      p_passed: true,
      p_answers: correctAnswer,
      p_completed_at: expect.any(String),
    });
    expect(result).toMatchObject({
      scorePercent: 100,
      passed: true,
      correctCount: 1,
      totalQuestions: 1,
      attemptsUsed: 1,
      maxAttempts: 2,
    });
    expect(mocks.findCourseIdForLesson).toHaveBeenCalledWith('lesson-1');
    expect(mocks.markCourseCompletedIfReady).toHaveBeenCalledWith(
      'user-1',
      'course-1',
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard');
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'quizzes',
      'quiz_questions',
      'quiz_options',
    ]);
  });

  it('never returns passed when the receipt does not confirm lesson progress', async () => {
    mocks.rpc.mockResolvedValue({
      data: savedReceipt({ progress_completed: false }),
      error: null,
    });

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toEqual({ error: 'saveAttemptFailed' });
    expect(mocks.findCourseIdForLesson).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('accepts a failed attempt with no completed progress and uses the locked database count', async () => {
    mocks.rpc.mockResolvedValue({
      data: savedReceipt({
        attempts_used: 2,
        max_attempts: 3,
        progress_completed: false,
      }),
      error: null,
    });

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: wrongAnswer }),
    ).resolves.toMatchObject({
      scorePercent: 0,
      passed: false,
      correctCount: 0,
      attemptsUsed: 2,
      maxAttempts: 3,
    });
    expect(mocks.findCourseIdForLesson).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps the committed result if aggregate completion or cache invalidation fails', async () => {
    mocks.findCourseIdForLesson.mockRejectedValue(
      new Error('Private aggregate failure'),
    );
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error('Private cache failure');
    });

    await expect(
      submitQuizAttempt({ quizId: 'quiz-1', answers: correctAnswer }),
    ).resolves.toMatchObject({ passed: true, attemptsUsed: 1 });
  });
});
