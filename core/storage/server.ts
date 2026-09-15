import { createAdminClient } from '@/core/supabase/admin';

export const PLATFORM_ASSETS_BUCKET = 'platform-assets';

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export type UploadFolder =
  | 'branding'
  | `courses/${string}`
  | `instructors/${string}`;

export type SignedUploadResult = {
  signedUrl: string;
  path: string;
  publicUrl: string;
};

export function assertAllowed(mime: string, size: number) {
  if (!ALLOWED_MIME_TYPES.includes(mime as AllowedMime)) {
    throw new Error(`Unsupported file type: ${mime}`);
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File too large: ${(size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)`,
    );
  }
}

function sanitizeFileName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

export async function createSignedUpload(
  folder: UploadFolder,
  fileName: string,
): Promise<SignedUploadResult> {
  const safeName = sanitizeFileName(fileName);
  const path = `${folder}/${Date.now()}-${safeName}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PLATFORM_ASSETS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    throw new Error(`Could not create signed URL: ${error?.message ?? 'unknown'}`);
  }

  const { data: publicData } = supabase.storage
    .from(PLATFORM_ASSETS_BUCKET)
    .getPublicUrl(path);

  return { signedUrl: data.signedUrl, path, publicUrl: publicData.publicUrl };
}

export async function deleteImage(path: string): Promise<void> {
  if (!path) return;

  // Accept either a bare storage path or a full public URL.
  const normalized = path.includes(`/${PLATFORM_ASSETS_BUCKET}/`)
    ? path.split(`/${PLATFORM_ASSETS_BUCKET}/`)[1]
    : path;

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(PLATFORM_ASSETS_BUCKET)
    .remove([normalized]);

  if (error) throw new Error(`Delete failed: ${error.message}`);
}

export function getPublicUrl(path: string): string {
  const supabase = createAdminClient();
  const { data } = supabase.storage
    .from(PLATFORM_ASSETS_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}
