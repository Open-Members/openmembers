'use server';

import { requireAdmin } from '@/core/access/admin';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/core/supabase/admin';
import type {
  AdminQuiz,
  AdminQuizQuestion,
  AdminQuizOption,
  QuestionType,
} from '@/features/Quizzes/types';

type QuizRow = {
  id: string;
  lesson_id: string;
  intro: string | null;
  pass_threshold_percent: number;
  max_attempts: number | null;
  show_correct_answers: boolean;
};

const QUIZ_SELECT =
  'id, lesson_id, intro, pass_threshold_percent, max_attempts, show_correct_answers';

async function loadQuiz(
  supabase: ReturnType<typeof createAdminClient>,
  quiz: QuizRow,
): Promise<AdminQuiz> {
  const { data: questions, error: questionsError } = await supabase
    .from('quiz_questions')
    .select('id, type, prompt, explanation, sort_order')
    .eq('quiz_id', quiz.id)
    .order('sort_order');

  if (questionsError) throw new Error('loadFailed');

  const questionIds = (questions ?? []).map((q) => q.id);
  const optionsResult = questionIds.length
    ? await supabase
        .from('quiz_options')
        .select('id, question_id, text, is_correct, sort_order')
        .in('question_id', questionIds)
        .order('sort_order')
    : { data: [], error: null };

  if (optionsResult.error) throw new Error('loadFailed');
  const options = optionsResult.data;

  const optsByQuestion = new Map<string, AdminQuizOption[]>();
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

  return {
    id: quiz.id,
    lessonId: quiz.lesson_id,
    intro: quiz.intro,
    passThresholdPercent: quiz.pass_threshold_percent,
    maxAttempts: quiz.max_attempts,
    showCorrectAnswers: quiz.show_correct_answers,
    questions: (questions ?? []).map(
      (q): AdminQuizQuestion => ({
        id: q.id,
        type: q.type as QuestionType,
        prompt: q.prompt,
        explanation: q.explanation,
        sortOrder: q.sort_order,
        options: optsByQuestion.get(q.id) ?? [],
      }),
    ),
  };
}

/** Read-only lookup. Missing quiz configuration is distinct from a failed read. */
export async function getQuizForLesson(
  lessonId: string,
): Promise<AdminQuiz | null> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: quiz, error } = await supabase
    .from('quizzes')
    .select(QUIZ_SELECT)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  if (error) throw new Error('loadFailed');
  return quiz ? loadQuiz(supabase, quiz as QuizRow) : null;
}

/** Create the default quiz only after an explicit administrator action. */
export async function createQuizForLesson(lessonId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: created, error } = await supabase
    .from('quizzes')
    .insert({ lesson_id: lessonId })
    .select(QUIZ_SELECT)
    .single();

  if (error || !created) return { error: 'operationFailed' };

  try {
    return {
      success: true,
      data: await loadQuiz(supabase, created as QuizRow),
    };
  } catch {
    return { error: 'loadFailed' };
  }
}

export type QuizConfigInput = {
  intro?: string | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  showCorrectAnswers: boolean;
};

export async function updateQuizConfig(
  quizId: string,
  input: QuizConfigInput,
  courseSlug: string,
) {
  await requireAdmin();
  const supabase = createAdminClient();

  if (input.passThresholdPercent < 1 || input.passThresholdPercent > 100) {
    return { error: 'thresholdInvalid' };
  }
  if (
    input.maxAttempts !== null &&
    (!Number.isFinite(input.maxAttempts) ||
      !Number.isInteger(input.maxAttempts) ||
      input.maxAttempts < 1)
  ) {
    return { error: 'attemptsInvalid' };
  }

  const { data: changed, error } = await supabase
    .from('quizzes')
    .update({
      intro: input.intro?.trim() || null,
      pass_threshold_percent: input.passThresholdPercent,
      max_attempts: input.maxAttempts,
      show_correct_answers: input.showCorrectAnswers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quizId)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  revalidatePath(`/admin/content/${courseSlug}`);
  return { success: true };
}

export type QuestionInput = {
  type: QuestionType;
  prompt: string;
  explanation?: string | null;
  options: Array<{ id?: string; text: string; isCorrect: boolean }>;
};

function validateQuestionInput(input: QuestionInput): string | null {
  if (!input.prompt.trim()) return 'questionInvalid';
  if (input.type === 'true_false' && input.options.length !== 2) {
    return 'questionInvalid';
  }
  if (input.type === 'single_choice' && input.options.length < 2) {
    return 'questionInvalid';
  }
  const correctCount = input.options.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) return 'questionInvalid';
  if (input.options.some((o) => !o.text.trim())) return 'questionInvalid';
  const persistedIds = input.options.flatMap((option) =>
    option.id ? [option.id] : [],
  );
  if (new Set(persistedIds).size !== persistedIds.length) {
    return 'invalidInput';
  }
  return null;
}

export async function createQuestion(
  quizId: string,
  input: QuestionInput,
  courseSlug: string,
) {
  await requireAdmin();
  const invalid = validateQuestionInput(input);
  if (invalid) return { error: invalid };

  const supabase = createAdminClient();

  const { data: last, error: lastError } = await supabase
    .from('quiz_questions')
    .select('sort_order')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { error: 'operationFailed' };
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data: q, error } = await supabase
    .from('quiz_questions')
    .insert({
      quiz_id: quizId,
      type: input.type,
      prompt: input.prompt.trim(),
      explanation: input.explanation?.trim() || null,
      sort_order: nextOrder,
    })
    .select('id')
    .single();
  if (error || !q) return { error: 'operationFailed' };

  const optionRows = input.options.map((o, idx) => ({
    question_id: q.id,
    text: o.text.trim(),
    is_correct: o.isCorrect,
    sort_order: idx,
  }));
  const { data: insertedOptions, error: optErr } = await supabase
    .from('quiz_options')
    .insert(optionRows)
    .select('id');
  if (optErr || insertedOptions?.length !== optionRows.length) {
    // Roll back the question so we don't leave orphans
    await supabase.from('quiz_questions').delete().eq('id', q.id);
    return { error: 'operationFailed' };
  }

  revalidatePath(`/admin/content/${courseSlug}`);
  return { success: true, data: { id: q.id } };
}

export async function updateQuestion(
  questionId: string,
  input: QuestionInput,
  courseSlug: string,
) {
  await requireAdmin();
  const invalid = validateQuestionInput(input);
  if (invalid) return { error: invalid };

  const supabase = createAdminClient();

  const { data: existingQuestion, error: questionReadError } = await supabase
    .from('quiz_questions')
    .select('id')
    .eq('id', questionId)
    .maybeSingle();
  if (questionReadError) return { error: 'operationFailed' };
  if (!existingQuestion) return { error: 'notFound' };

  const { data: existingOptions, error: optionsReadError } = await supabase
    .from('quiz_options')
    .select('id')
    .eq('question_id', questionId);
  if (optionsReadError) return { error: 'operationFailed' };

  const existingIds = new Set(
    (existingOptions ?? []).map((option) => option.id),
  );
  const requestedExistingIds = new Set(
    input.options.flatMap((option) => (option.id ? [option.id] : [])),
  );
  if ([...requestedExistingIds].some((id) => !existingIds.has(id))) {
    return { error: 'invalidInput' };
  }

  // Add new options before removing prior answers. These are separate,
  // confirmed writes rather than a database transaction; an insert failure
  // therefore leaves the saved option set intact.
  const newOptions = input.options
    .map((option, sortOrder) => ({ option, sortOrder }))
    .filter(({ option }) => !option.id);
  if (newOptions.length > 0) {
    const rows = newOptions.map(({ option, sortOrder }) => ({
      question_id: questionId,
      text: option.text.trim(),
      is_correct: option.isCorrect,
      sort_order: sortOrder,
    }));
    const { data: inserted, error: insertError } = await supabase
      .from('quiz_options')
      .insert(rows)
      .select('id');
    if (insertError || inserted?.length !== rows.length) {
      return { error: 'operationFailed' };
    }
  }

  const optionUpdates = input.options.flatMap((option, sortOrder) =>
    option.id
      ? [
          supabase
            .from('quiz_options')
            .update({
              text: option.text.trim(),
              is_correct: option.isCorrect,
              sort_order: sortOrder,
            })
            .eq('id', option.id)
            .eq('question_id', questionId)
            .select('id')
            .maybeSingle(),
        ]
      : [],
  );
  const optionUpdateResults = await Promise.all(optionUpdates);
  if (optionUpdateResults.some((result) => result.error || !result.data)) {
    return { error: 'operationFailed' };
  }

  const removedIds = [...existingIds].filter(
    (id) => !requestedExistingIds.has(id),
  );
  if (removedIds.length > 0) {
    const { data: removed, error: removeError } = await supabase
      .from('quiz_options')
      .delete()
      .eq('question_id', questionId)
      .in('id', removedIds)
      .select('id');
    if (removeError || removed?.length !== removedIds.length) {
      return { error: 'operationFailed' };
    }
  }

  const { data: changed, error: qErr } = await supabase
    .from('quiz_questions')
    .update({
      type: input.type,
      prompt: input.prompt.trim(),
      explanation: input.explanation?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', questionId)
    .select('id')
    .maybeSingle();
  if (qErr) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  revalidatePath(`/admin/content/${courseSlug}`);
  return { success: true };
}

export async function deleteQuestion(questionId: string, courseSlug: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: deleted, error } = await supabase
    .from('quiz_questions')
    .delete()
    .eq('id', questionId)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };
  revalidatePath(`/admin/content/${courseSlug}`);
  return { success: true };
}

export async function reorderQuestions(
  quizId: string,
  orderedIds: string[],
  courseSlug: string,
) {
  await requireAdmin();
  const supabase = createAdminClient();
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: 'invalidInput' };
  }
  const updates = orderedIds.map((id, idx) =>
    supabase
      .from('quiz_questions')
      .update({ sort_order: idx })
      .eq('id', id)
      .eq('quiz_id', quizId)
      .select('id')
      .maybeSingle(),
  );
  const results = await Promise.all(updates);
  if (results.some((result) => result.error))
    return { error: 'operationFailed' };
  if (results.some((result) => !result.data)) return { error: 'notFound' };
  revalidatePath(`/admin/content/${courseSlug}`);
  return { success: true };
}
