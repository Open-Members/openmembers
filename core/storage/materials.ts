import { createAdminClient } from '@/core/supabase/admin';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const MATERIALS_BUCKET = 'lesson-materials';
export const MAX_MATERIAL_SIZE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MATERIAL_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
] as const;

const materialUploadSchema = z.object({
  lessonId: z.uuid(),
  fileName: z.string().trim().min(1).max(255).refine(value => !/[\x00-\x1f\x7f\\/]/.test(value)),
  mime: z.enum(ALLOWED_MATERIAL_MIMES),
  size: z.number().int().positive().max(MAX_MATERIAL_SIZE_BYTES),
});

export function isValidMaterialUpload(input: unknown): boolean {
  return materialUploadSchema.safeParse(input).success;
}

export function isMaterialPathForLesson(path: string, lessonId: string): boolean {
  const prefix = `lessons/${lessonId}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return /^[a-zA-Z0-9._-]+$/.test(name) && name !== '.' && name !== '..';
}

export type UploadMaterialResult = {
  path: string;
  size: number;
};

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

export type SignedMaterialUpload = {
  signedUrl: string;
  path: string;
};

/**
 * Returns a signed PUT URL so the browser can stream bytes directly to
 * Supabase Storage, bypassing the Next.js Server Action body limit and
 * avoiding heap pressure in dev. Validates MIME + size up front.
 */
export async function createMaterialSignedUploadUrl(input: {
  lessonId: string;
  fileName: string;
  mime: string;
  size: number;
}): Promise<SignedMaterialUpload> {
  if (!isValidMaterialUpload(input)) throw new Error('Invalid material: provide a lesson UUID, filename, supported type and positive size up to 25 MiB.');

  const safe = sanitizeFileName(input.fileName);
  const path = `lessons/${input.lessonId}/${randomUUID()}-${safe}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    throw new Error(`Could not create signed URL: ${error?.message ?? 'unknown'}`);
  }

  return { signedUrl: data.signedUrl, path };
}

export async function uploadMaterial(input: {
  lessonId: string;
  file: File | Blob;
  fileName: string;
}): Promise<UploadMaterialResult> {
  const mime = input.file.type || 'application/octet-stream';
  if (!isValidMaterialUpload({ ...input, mime, size: input.file.size })) throw new Error('Invalid material: provide a lesson UUID, filename, supported type and positive size up to 25 MiB.');

  const safe = sanitizeFileName(input.fileName);
  const path = `lessons/${input.lessonId}/${randomUUID()}-${safe}`;

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .upload(path, input.file, { contentType: mime, upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return { path, size: input.file.size };
}

export async function deleteMaterial(path: string): Promise<void> {
  if (!path) return;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(MATERIALS_BUCKET).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/**
 * Signed URL for direct download from the private bucket. TTL in seconds.
 * Used for non-PDF files; PDFs are streamed through the API route so they
 * can be watermarked.
 */
export async function createMaterialSignedUrl(
  path: string,
  ttlSeconds = 60 * 60,
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .createSignedUrl(path, ttlSeconds, {
      download: true, // force Content-Disposition: attachment
    });
  if (error || !data) {
    throw new Error(`Could not sign URL: ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

/**
 * Downloads the raw material bytes. Used by the watermark pipeline for PDFs.
 */
export async function downloadMaterialBytes(path: string): Promise<ArrayBuffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error(`Could not download: ${error?.message ?? 'unknown'}`);
  }
  return await data.arrayBuffer();
}
