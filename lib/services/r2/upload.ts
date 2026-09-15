import { z } from 'zod';

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'] as const;

const uploadSchema = z.object({
  scope: z.enum(['lesson', 'course-trailer']).default('lesson'),
  scopeId: z.uuid().optional(),
  lessonId: z.uuid().optional(),
  filename: z.string().trim().min(1).max(255).refine(value => !/[\x00-\x1f\x7f\\/]/.test(value)),
  contentType: z.enum(VIDEO_MIME_TYPES),
  size: z.number().int().positive().max(MAX_VIDEO_BYTES),
}).strict().refine(value => Boolean(value.scopeId ?? value.lessonId), { path: ['scopeId'] })
  .refine(value => !value.lessonId || (value.scope === 'lesson' && (!value.scopeId || value.scopeId === value.lessonId)), { path: ['lessonId'] });

export function parseVideoUpload(value: unknown) {
  const result = uploadSchema.safeParse(value);
  return result.success ? { ...result.data, scopeId: (result.data.scopeId ?? result.data.lessonId)! } : null;
}
