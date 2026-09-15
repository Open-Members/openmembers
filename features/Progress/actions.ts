'use server';

import { createClient } from '@/core/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  findCourseIdForLesson,
  markCourseCompletedIfReady,
  markCourseIncomplete,
} from '@/lib/activity/track';
import { isUserLessonAccessible } from '@/core/access/server';
import { z } from 'zod';

const lessonIdSchema = z.string().uuid();

export async function setLessonCompleted(
  lessonId: string,
  completed: boolean,
) {
  if (!lessonIdSchema.safeParse(lessonId).success || typeof completed !== 'boolean') {
    return { error: 'invalidProgress' };
  }
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { error: 'notAuthenticated' };
    }

    // Access gate: without this, any signed-in user could POST an arbitrary
    // lessonId and stamp lesson_progress rows on courses they never bought,
    // which in turn fires markCourseCompletedIfReady → certificates. H6 in
    // the 2026-04-21 audit.
    const allowed = await isUserLessonAccessible(user.id, lessonId);
    if (!allowed) {
      return { error: 'accessDenied' };
    }

    const { error } = await supabase
      .from('lesson_progress')
      .upsert(
        {
          user_id: user.id,
          lesson_id: lessonId,
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
        },
        { onConflict: 'user_id,lesson_id' },
      );

    if (error) {
      return { error: 'saveProgressFailed' };
    }

    // Bubble up "this completion just finished the whole course" so the
    // client can fire a bigger celebration. Returning courseSlug saves
    // the caller a second round-trip when it wants to deep-link to the
    // course detail / certificate.
    let courseJustCompleted = false;
    let courseSlug: string | undefined;

    const courseId = await findCourseIdForLesson(lessonId);
    if (courseId) {
      if (completed) {
        const result = await markCourseCompletedIfReady(user.id, courseId);
        courseJustCompleted = result.courseJustCompleted;
        if (courseJustCompleted) {
          const { data: course } = await supabase
            .from('courses')
            .select('slug')
            .eq('id', courseId)
            .maybeSingle();
          courseSlug = course?.slug ?? undefined;
        }
      } else {
        await markCourseIncomplete(user.id, courseId);
      }
    }

    revalidatePath('/courses');
    revalidatePath('/progress');
    return { success: true, courseJustCompleted, courseSlug };
  } catch {
    return { error: 'saveProgressFailed' };
  }
}

export async function markLessonComplete(lessonId: string) {
  if (!lessonIdSchema.safeParse(lessonId).success) {
    return { error: 'invalidProgress' };
  }
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { error: 'notAuthenticated' };
    }

    const allowed = await isUserLessonAccessible(user.id, lessonId);
    if (!allowed) {
      return { error: 'accessDenied' };
    }

    const { error } = await supabase
      .from('lesson_progress')
      .upsert(
        {
          user_id: user.id,
          lesson_id: lessonId,
          is_completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lesson_id' },
      );

    if (error) {
      return { error: 'saveProgressFailed' };
    }

    // Opportunistic completion check — stamps enrollments.completed_at
    // if this was the last outstanding lesson in the course. Bubble up
    // the same flag setLessonCompleted does so the player can celebrate
    // when video-end auto-complete finishes the whole course.
    let courseJustCompleted = false;
    let courseSlug: string | undefined;

    const courseId = await findCourseIdForLesson(lessonId);
    if (courseId) {
      const result = await markCourseCompletedIfReady(user.id, courseId);
      courseJustCompleted = result.courseJustCompleted;
      if (courseJustCompleted) {
        const { data: course } = await supabase
          .from('courses')
          .select('slug')
          .eq('id', courseId)
          .maybeSingle();
        courseSlug = course?.slug ?? undefined;
      }
    }

    revalidatePath('/courses');
    revalidatePath('/progress');
    return { success: true, courseJustCompleted, courseSlug };
  } catch {
    return { error: 'saveProgressFailed' };
  }
}

export async function saveVideoPosition(lessonId: string, positionSeconds: number) {
  // Match PostgreSQL integer storage without coercing untrusted action input.
  if (!lessonIdSchema.safeParse(lessonId).success || typeof positionSeconds !== 'number'
    || !Number.isFinite(positionSeconds) || positionSeconds < 0 || positionSeconds > 2147483647) {
    return { error: 'invalidPosition' };
  }
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { error: 'notAuthenticated' };
    }

    const allowed = await isUserLessonAccessible(user.id, lessonId);
    if (!allowed) {
      return { error: 'accessDenied' };
    }

    const { error } = await supabase
      .from('lesson_progress')
      .upsert(
        {
          user_id: user.id,
          lesson_id: lessonId,
          video_position_seconds: Math.floor(positionSeconds),
        },
        { onConflict: 'user_id,lesson_id' },
      );

    if (error) {
      return { error: 'saveProgressFailed' };
    }

    // No revalidate needed — silent background save
    return { success: true };
  } catch {
    return { error: 'saveProgressFailed' };
  }
}
