'use server';

import { requireAdmin } from '@/core/access/admin';

import { revalidatePath } from 'next/cache';
import {
  createMaterialSignedUploadUrl,
  deleteMaterial,
  isValidMaterialUpload,
  isMaterialPathForLesson,
} from '@/core/storage/materials';

export type AdminAttachment = {
  id: string;
  lessonId: string;
  fileName: string;
  filePath: string; // storage path inside the private bucket
  fileType: string | null;
  fileSizeBytes: number | null;
  sortOrder: number;
};

export async function listAttachmentsForLesson(
  lessonId: string,
): Promise<AdminAttachment[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('lesson_attachments')
    .select(
      'id, lesson_id, file_name, file_url, file_type, file_size_bytes, sort_order',
    )
    .eq('lesson_id', lessonId)
    .order('sort_order');

  if (error) throw new Error('loadFailed');

  return (data ?? []).map((a) => ({
    id: a.id,
    lessonId: a.lesson_id,
    fileName: a.file_name,
    filePath: a.file_url,
    fileType: a.file_type,
    fileSizeBytes: a.file_size_bytes,
    sortOrder: a.sort_order,
  }));
}

/**
 * Step 1 of the direct-upload flow: mint a short-lived signed PUT URL so
 * the browser can stream bytes straight to Supabase Storage. Bytes never
 * pass through the Next.js server.
 */
export async function createMaterialUploadUrlAction(input: {
  lessonId: string;
  fileName: string;
  mime: string;
  size: number;
}) {
  await requireAdmin();

  if (!isValidMaterialUpload(input)) return { error: 'materialInvalid' };
  const mime = input.mime;

  try {
    const { signedUrl, path } = await createMaterialSignedUploadUrl({
      lessonId: input.lessonId,
      fileName: input.fileName,
      mime,
      size: input.size,
    });
    return { success: true as const, signedUrl, path };
  } catch {
    return { error: 'uploadFailed' };
  }
}

/**
 * Step 2: after the browser PUT succeeds, record the DB row. If this
 * fails the bytes are orphaned in the bucket — caller can retry or a
 * future cleanup job can sweep unreferenced paths.
 */
export async function finalizeAttachmentAction(input: {
  lessonId: string;
  path: string;
  fileName: string;
  mime: string;
  size: number;
}) {
  const { supabase } = await requireAdmin();

  if (
    !isValidMaterialUpload(input) ||
    typeof input.path !== 'string' ||
    !isMaterialPathForLesson(input.path, input.lessonId)
  ) {
    return { error: 'materialInvalid' };
  }
  const mime = input.mime;

  const { data: last, error: orderError } = await supabase
    .from('lesson_attachments')
    .select('sort_order')
    .eq('lesson_id', input.lessonId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return { error: 'operationFailed' };
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('lesson_attachments')
    .insert({
      lesson_id: input.lessonId,
      file_name: input.fileName,
      file_url: input.path,
      file_type: mime,
      file_size_bytes: input.size,
      sort_order: nextOrder,
    })
    .select('id, file_name, file_url, file_type, file_size_bytes, sort_order')
    .single();

  if (error || !data) {
    // Keep bytes available for retry; this path may already be referenced.
    return { error: 'operationFailed' };
  }

  revalidatePath('/admin/content');
  return {
    success: true as const,
    data: {
      id: data.id,
      lessonId: input.lessonId,
      fileName: data.file_name,
      filePath: data.file_url,
      fileType: data.file_type,
      fileSizeBytes: data.file_size_bytes,
      sortOrder: data.sort_order,
    } satisfies AdminAttachment,
  };
}

export async function deleteAttachment(attachmentId: string) {
  const { supabase } = await requireAdmin();

  const { data: row, error: readError } = await supabase
    .from('lesson_attachments')
    .select('file_url')
    .eq('id', attachmentId)
    .maybeSingle();
  if (readError) return { error: 'operationFailed' };
  if (!row) return { error: 'notFound' };

  const { data: deleted, error } = await supabase
    .from('lesson_attachments')
    .delete()
    .eq('id', attachmentId)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };

  // Best-effort removal of the bytes (DB row already gone either way)
  if (row?.file_url) {
    await deleteMaterial(row.file_url).catch(() => {});
  }

  revalidatePath('/admin/content');
  return { success: true };
}

export async function reorderAttachments(
  lessonId: string,
  orderedIds: string[],
) {
  const { supabase } = await requireAdmin();
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: 'invalidInput' };
  }
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('lesson_attachments')
      .update({ sort_order: index })
      .eq('id', id)
      .eq('lesson_id', lessonId)
      .select('id')
      .maybeSingle(),
  );
  const results = await Promise.all(updates);
  if (results.some((result) => result.error)) {
    return { error: 'operationFailed' };
  }
  if (results.some((result) => !result.data)) return { error: 'notFound' };
  revalidatePath('/admin/content');
  return { success: true };
}
