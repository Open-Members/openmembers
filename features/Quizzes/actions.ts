'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import {
  findCourseIdForLesson,
  markCourseCompletedIfReady,
} from '@/lib/activity/track';
import { isUserLessonAccessible } from '@/core/access/server';
import type { QuizResult, QuizResultQuestion, QuestionType } from './types';

export type SubmitQuizInput = {
  quizId: string;
  /** Map of questionId → selected optionId. */
  answers: Record<string, string>;
};

type QuizAttemptReceipt =
  | {
      status: 'saved';
      attemptId: string;
      attemptsUsed: number;
      maxAttempts: number | null;
      progressCompleted: boolean;
    }
  | {
      status: 'max_attempts_reached';
    }
  | {
      status: 'quiz_unavailable';
    }
  | {
      status: 'invalid_submission';
    };

function parseQuizAttemptReceipt(value: unknown): QuizAttemptReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const receipt = value as Record<string, unknown>;
  if (
    receipt.status === 'max_attempts_reached' ||
    receipt.status === 'quiz_unavailable' ||
    receipt.status === 'invalid_submission'
  ) {
    return { status: receipt.status };
  }

  const maxAttempts = receipt.max_attempts;
  if (
    receipt.status !== 'saved' ||
    typeof receipt.attempt_id !== 'string' ||
    !receipt.attempt_id ||
    !Number.isSafeInteger(receipt.attempts_used) ||
    (receipt.attempts_used as number) < 1 ||
    (maxAttempts !== null &&
      (!Number.isSafeInteger(maxAttempts) || (maxAttempts as number) < 1)) ||
    typeof receipt.progress_completed !== 'boolean'
  ) {
    return null;
  }

  return {
    status: 'saved',
    attemptId: receipt.attempt_id,
    attemptsUsed: receipt.attempts_used as number,
    maxAttempts: maxAttempts as number | null,
    progressCompleted: receipt.progress_completed,
  };
}

/**
 * Grades the attempt server-side, stores the row, and marks the lesson as
 * completed when the user passes. Returns a structured result for the UI.
 */
export async function submitQuizAttempt(
  input: SubmitQuizInput,
): Promise<QuizResult | { error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return { error: 'notAuthenticated' };

    const admin = createAdminClient();

    // Load the quiz config
    const { data: quiz, error: quizError } = await admin
      .from('quizzes')
      .select('id, lesson_id, pass_threshold_percent, max_attempts, show_correct_answers')
      .eq('id', input.quizId)
      .maybeSingle();
    if (quizError || !quiz) return { error: 'quizUnavailable' };
    if (!(await isUserLessonAccessible(user.id, quiz.lesson_id))) return { error: 'accessDenied' };

    // Load questions + options (including is_correct) for grading
    const { data: questions, error: questionsError } = await admin
      .from('quiz_questions')
      .select('id, type, prompt, explanation, sort_order')
      .eq('quiz_id', quiz.id)
      .order('sort_order');
    if (questionsError) return { error: 'questionsUnavailable' };
    const questionList = questions ?? [];
    if (questionList.length === 0) {
      return { error: 'quizEmpty' };
    }

    const questionIds = questionList.map((q) => q.id);
    const { data: options, error: optionsError } = await admin
      .from('quiz_options')
      .select('id, question_id, text, is_correct, sort_order')
      .in('question_id', questionIds)
      .order('sort_order');

    if (optionsError || !options?.length) return { error: 'optionsUnavailable' };

    const optsByQuestion = new Map<
      string,
      Array<{ id: string; text: string; isCorrect: boolean; sortOrder: number }>
    >();
    for (const o of options ?? []) {
      const arr = optsByQuestion.get(o.question_id) ?? [];
      arr.push({
        id: o.id,
        text: o.text,
        isCorrect: o.is_correct,
        sortOrder: o.sort_order,
      });
      optsByQuestion.set(o.question_id, arr);
    }

    // Grade
    let correctCount = 0;
    const perQuestion: QuizResultQuestion[] = [];
    for (const q of questionList) {
      const opts = optsByQuestion.get(q.id) ?? [];
      const correctOpt = opts.find((o) => o.isCorrect);
      const selectedId = input.answers[q.id] ?? null;
      const isCorrect =
        !!correctOpt && !!selectedId && selectedId === correctOpt.id;
      if (isCorrect) correctCount += 1;

      perQuestion.push({
        id: q.id,
        prompt: q.prompt,
        type: q.type as QuestionType,
        selectedOptionId: selectedId,
        correctOptionId: correctOpt?.id ?? '',
        isCorrect,
        explanation: q.explanation,
        options: opts.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      });
    }

    const scorePercent = Math.round((correctCount / questionList.length) * 100);
    const passed = scorePercent >= quiz.pass_threshold_percent;

    // The database serializes the limit and commits an approved attempt with
    // lesson progress atomically. No positive result is returned without a
    // validated persistence receipt.
    const { data: persisted, error: persistError } = await admin.rpc(
      'submit_quiz_attempt',
      {
        p_user_id: user.id,
        p_quiz_id: quiz.id,
        p_score_percent: scorePercent,
        p_passed: passed,
        p_answers: input.answers,
        p_completed_at: new Date().toISOString(),
      },
    );
    if (persistError) return { error: 'saveAttemptFailed' };

    const receipt = parseQuizAttemptReceipt(persisted);
    if (!receipt) return { error: 'saveAttemptFailed' };
    if (receipt.status === 'max_attempts_reached') {
      return { error: 'maxAttemptsReached' };
    }
    if (receipt.status === 'quiz_unavailable') {
      return { error: 'quizUnavailable' };
    }
    if (receipt.status === 'invalid_submission') {
      return { error: 'saveAttemptFailed' };
    }
    if (receipt.progressCompleted !== passed) {
      return { error: 'saveAttemptFailed' };
    }

    // Course completion is an aggregate, fail-soft follow-up. The attempt and
    // lesson completion have already committed together before this point.
    if (passed) {
      try {
        const courseId = await findCourseIdForLesson(quiz.lesson_id);
        if (courseId) {
          await markCourseCompletedIfReady(user.id, courseId);
        }
      } catch {
        // Aggregate completion will be reconciled by a later progress write.
      }
    }

    try {
      revalidatePath('/dashboard');
    } catch {
      // Cache invalidation must not turn a committed attempt into a retry.
    }

    return {
      scorePercent,
      passed,
      correctCount,
      totalQuestions: questionList.length,
      attemptsUsed: receipt.attemptsUsed,
      maxAttempts: receipt.maxAttempts,
      perQuestion: quiz.show_correct_answers ? perQuestion : null,
    };
  } catch {
    return { error: 'submitFailed' };
  }
}
