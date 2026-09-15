'use server';

import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addCommentSchema, formDataToObject } from '@/core/validation/schemas';
import { notifyCommentReply } from '@/features/Notifications/engagement-events';
import { isUserLessonAccessible } from '@/core/access/server';
import type { LessonComment } from '@/shared/types/interfaces';
import type { CommentErrorCode } from './errors';

const idSchema = z.string().uuid();

class CommentAccessError extends Error {
  constructor(readonly code: 'notAuthenticated' | 'accessDenied') {
    super(code);
  }
}

function actionError(error: unknown, fallback: CommentErrorCode) {
  return { error: error instanceof CommentAccessError ? error.code : fallback };
}

// ─── Auth helper ────────────────────────────────────────────────────────────

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new CommentAccessError('notAuthenticated');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.status !== 'active') throw new CommentAccessError('accessDenied');

  return {
    supabase,
    userId: user.id,
    role: (profile?.role as string) ?? 'user',
  };
}

// ─── Add comment ────────────────────────────────────────────────────────────

export async function addComment(formData: FormData) {
  try {
    const { supabase, userId } = await requireAuth();

    const raw = formDataToObject(formData);
    const parsed = addCommentSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const error: CommentErrorCode = issue?.path[0] === 'content' && issue.code === 'too_big'
        ? 'contentTooLong'
        : issue?.path[0] === 'content' && issue.code === 'too_small'
          ? 'contentRequired'
          : 'invalidInput';
      return { error };
    }

    // Access gate: prevent unenrolled users from posting on paid lessons by
    // POSTing an arbitrary lessonId (H6 in 2026-04-21 audit).
    const allowed = await isUserLessonAccessible(userId, parsed.data.lessonId);
    if (!allowed) {
      return { error: 'accessDenied' };
    }

    const { data, error } = await supabase
      .from('lesson_comments')
      .insert({
        lesson_id: parsed.data.lessonId,
        user_id: userId,
        content: parsed.data.content,
        parent_id: parsed.data.parentId ?? null,
        is_pinned: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[addComment] insert failed:', error);
      return { error: 'saveFailed' };
    }

    if (!data?.id) return { error: 'saveFailed' };

    // Fire reply notification — helper self-filters top-level + self-reply.
    if (parsed.data.parentId) {
      await notifyCommentReply({ commentId: data.id });
    }

    revalidatePath('/');
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return actionError(error, 'saveFailed');
  }
}

// ─── Delete comment ─────────────────────────────────────────────────────────

export async function deleteComment(commentId: string) {
  try {
    if (!idSchema.safeParse(commentId).success) return { error: 'invalidInput' };
    const { supabase, userId, role } = await requireAuth();

    // Verify ownership or admin
    const { data: comment, error: commentError } = await supabase
      .from('lesson_comments')
      .select('user_id')
      .eq('id', commentId)
      .single();

    if (commentError || !comment) return { error: 'commentUnavailable' };

    const isOwner = comment.user_id === userId;
    const isAdmin = role === 'admin' || role === 'super_admin';

    if (!isOwner && !isAdmin) {
      return { error: 'accessDenied' };
    }

    const { data: deleted, error } = await supabase
      .from('lesson_comments')
      .delete()
      .eq('id', commentId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[deleteComment] delete failed:', error);
      return { error: 'deleteFailed' };
    }
    if (!deleted) return { error: 'commentUnavailable' };

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return actionError(error, 'deleteFailed');
  }
}

// ─── Pin/unpin comment (admin only) ─────────────────────────────────────────

export async function pinComment(commentId: string) {
  try {
    if (!idSchema.safeParse(commentId).success) return { error: 'invalidInput' };
    const { supabase, role } = await requireAuth();

    if (role !== 'admin' && role !== 'super_admin') {
      return { error: 'accessDenied' };
    }

    // Fetch current pinned state
    const { data: comment, error: commentError } = await supabase
      .from('lesson_comments')
      .select('is_pinned')
      .eq('id', commentId)
      .single();

    if (commentError || !comment) return { error: 'commentUnavailable' };

    const { data: updated, error } = await supabase
      .from('lesson_comments')
      .update({ is_pinned: !comment.is_pinned })
      .eq('id', commentId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[pinComment] update failed:', error);
      return { error: 'pinFailed' };
    }
    if (!updated) return { error: 'commentUnavailable' };

    revalidatePath('/');
    return { success: true, data: { isPinned: !comment.is_pinned } };
  } catch (error) {
    return actionError(error, 'pinFailed');
  }
}

// ─── Fetch comments for a lesson ────────────────────────────────────────────

export async function fetchComments(lessonId: string): Promise<{ data: LessonComment[]; error?: never } | { error: CommentErrorCode; data?: never }> {
  try {
    if (!idSchema.safeParse(lessonId).success) return { error: 'invalidInput' };
    const { supabase, userId } = await requireAuth();
    if (!(await isUserLessonAccessible(userId, lessonId))) return { error: 'accessDenied' };

    // Read comments with the session's RLS first; author profiles are resolved
    // separately through a minimal public projection after the lesson gate.
    const { data: comments, error } = await supabase
      .from('lesson_comments')
      .select('id, lesson_id, user_id, parent_id, content, is_pinned, created_at')
      .eq('lesson_id', lessonId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !comments) return { error: 'loadFailed' };

    const userIds = Array.from(new Set(comments.map(c => c.user_id)));
    const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();

    if (userIds.length > 0) {
      // Only the public author projection is returned after the lesson gate.
      const { data: profiles } = await createAdminClient()
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);
      for (const p of profiles ?? []) {
        profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
      }
    }

    return { data: comments.map(c => {
      const profile = profileMap.get(c.user_id);
      return {
        id: c.id,
        lessonId: c.lesson_id,
        userId: c.user_id,
        parentId: c.parent_id ?? undefined,
        content: c.content,
        isPinned: c.is_pinned,
        createdAt: c.created_at,
        userDisplayName: profile?.display_name ?? null,
        userAvatarUrl: profile?.avatar_url ?? undefined,
      };
    }) };
  } catch (error) {
    return actionError(error, 'loadFailed');
  }
}
