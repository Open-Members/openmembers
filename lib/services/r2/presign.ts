import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, getR2Bucket } from './client';

const UPLOAD_TTL_SECONDS = 60 * 60; // 1 hour — plenty for any upload
const PLAYBACK_TTL_SECONDS = 60 * 60 * 6; // 6 hours — covers one study session

/**
 * Generate a presigned PUT URL for a direct browser-to-R2 upload.
 * The key is expected to be admin-scoped (e.g. `lessons/<id>/<uuid>.mp4`)
 * — this function doesn't enforce any auth, callers must.
 */
export async function presignUpload(params: {
  key: string;
  contentType: string;
}): Promise<string> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: params.key,
    ContentType: params.contentType,
  });
  return getSignedUrl(client, command, {
    expiresIn: UPLOAD_TTL_SECONDS,
    signableHeaders: new Set(['content-type']),
  });
}

/**
 * Generate a presigned GET URL for a six-hour playback session.
 * Existing links remain usable until expiration, even after access is revoked.
 */
export async function presignPlayback(key: string): Promise<string> {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: PLAYBACK_TTL_SECONDS });
}

/**
 * Permanently delete an object. Used when an admin replaces or removes
 * a lesson's video — keeps R2 storage from accumulating orphans.
 */
export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }),
  );
}

/**
 * Delete several R2 objects in parallel. Fail-soft: each failure is
 * caught and logged so one bad key doesn't abort the rest, and the
 * caller can always proceed (admin actions can't hang on R2 hiccups).
 * Empty/nullish keys are skipped.
 */
export async function bulkDeleteObjects(keys: Array<string | null | undefined>): Promise<void> {
  const valid = keys.filter((k): k is string => Boolean(k));
  if (valid.length === 0) return;
  const results = await Promise.allSettled(valid.map((k) => deleteObject(k)));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') {
      console.error(`[r2] Failed to delete ${valid[i]}:`, r.reason);
    }
  }
}

/**
 * Canonical key layout for lesson videos. Centralised so admin UI and
 * cleanup paths agree on how to address an object.
 */
export function buildLessonVideoKey(lessonId: string, filename: string): string {
  const ext = filename.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '';
  return `lessons/${lessonId}/${randomUUID()}${ext}`;
}

/**
 * Canonical key layout for course trailers (hover previews on catalog
 * cards). Separate prefix from lesson videos so cleanup and signed-URL
 * policies can differ if needed.
 */
export function buildCourseTrailerKey(courseId: string, filename: string): string {
  const ext = filename.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '';
  return `courses/${courseId}/trailer/${randomUUID()}${ext}`;
}
