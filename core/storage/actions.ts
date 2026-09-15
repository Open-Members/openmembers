'use server';

import { createClient } from '@/core/supabase/server';
import {
  createSignedUpload,
  deleteImage,
  assertAllowed,
  type UploadFolder,
  type SignedUploadResult,
} from '@/core/storage/server';

async function requireAdmin(): Promise<true | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.status !== 'active' || !['admin', 'super_admin'].includes(profile.role)) {
    return { error: 'Forbidden' };
  }
  return true;
}

export async function createSignedUploadUrlAction(
  folder: string,
  fileName: string,
  mime: string,
  size: number,
): Promise<SignedUploadResult | { error: string }> {
  const auth = await requireAdmin();
  if (auth !== true) return auth;

  if (!folder || !fileName) return { error: 'Missing folder or file name' };

  try {
    assertAllowed(mime, size);
    return await createSignedUpload(folder as UploadFolder, fileName);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not start upload' };
  }
}

export async function deleteImageAction(
  pathOrUrl: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await requireAdmin();
  if (auth !== true) return auth;

  if (!pathOrUrl) return { error: 'Missing path' };

  try {
    await deleteImage(pathOrUrl);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Delete failed' };
  }
}
