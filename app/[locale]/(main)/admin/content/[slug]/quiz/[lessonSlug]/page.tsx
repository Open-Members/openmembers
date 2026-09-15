import { notFound } from 'next/navigation';
import { requireAdmin } from '@/core/access/admin';
import { getQuizForLesson } from '@/features/Admin/quizzes';
import { QuizEditor } from '@/features/Admin/components/QuizEditor';

export const dynamic = 'force-dynamic';

export default async function AdminQuizPage({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>;
}) {
  const { slug, lessonSlug } = await params;

  // Locate the lesson (via its course + slug). Quiz-type lessons only.
  const { supabase } = await requireAdmin();
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (courseError) throw new Error('loadFailed');
  if (!course) notFound();

  const { data: modules, error: modulesError } = await supabase
    .from('modules')
    .select('id')
    .eq('course_id', course.id);
  if (modulesError) throw new Error('loadFailed');
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) notFound();

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, title, content_type')
    .in('module_id', moduleIds)
    .eq('slug', lessonSlug)
    .maybeSingle();
  if (lessonError) throw new Error('loadFailed');
  if (!lesson) notFound();
  if (lesson.content_type !== 'quiz') notFound();

  const quiz = await getQuizForLesson(lesson.id);

  return (
    <QuizEditor
      courseSlug={slug}
      lessonSlug={lessonSlug}
      lessonId={lesson.id}
      lessonTitle={lesson.title}
      initialQuiz={quiz}
    />
  );
}
