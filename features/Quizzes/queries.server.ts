import { createAdminClient } from '@/core/supabase/admin';
import type {
  StudentQuiz,
  StudentQuizQuestion,
  StudentQuizOption,
  QuestionType,
} from './types';

/**
 * Student-facing quiz loader. Intentionally does NOT expose is_correct —
 * that stays server-side until grading in submitQuizAttempt.
 */
export async function fetchStudentQuizForLesson(
  lessonId: string,
): Promise<StudentQuiz | null> {
  const supabase = createAdminClient();

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id, lesson_id, intro, pass_threshold_percent, max_attempts, show_correct_answers')
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (!quiz) return null;

  const { data: questions } = await supabase
    .from('quiz_questions')
    .select('id, type, prompt, sort_order')
    .eq('quiz_id', quiz.id)
    .order('sort_order');

  const questionIds = (questions ?? []).map((q) => q.id);
  const { data: options } = questionIds.length
    ? await supabase
        .from('quiz_options')
        .select('id, question_id, text, sort_order')
        .in('question_id', questionIds)
        .order('sort_order')
    : { data: [] };

  const optsByQuestion = new Map<string, StudentQuizOption[]>();
  for (const o of options ?? []) {
    const arr = optsByQuestion.get(o.question_id) ?? [];
    arr.push({ id: o.id, text: o.text, sortOrder: o.sort_order });
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
      (q): StudentQuizQuestion => ({
        id: q.id,
        type: q.type as QuestionType,
        prompt: q.prompt,
        sortOrder: q.sort_order,
        options: optsByQuestion.get(q.id) ?? [],
      }),
    ),
  };
}

/** How many attempts the user has made for this quiz so far. */
export async function countUserAttempts(
  userId: string,
  quizId: string,
): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('quiz_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('quiz_id', quizId);
  return count ?? 0;
}

/** Whether the user has ever passed this quiz. */
export async function hasPassed(userId: string, quizId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('quiz_attempts')
    .select('id')
    .eq('user_id', userId)
    .eq('quiz_id', quizId)
    .eq('passed', true)
    .limit(1)
    .maybeSingle();
  return !!data;
}
