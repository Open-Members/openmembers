import { z } from 'zod';

// ─── Reusable primitives ───

export const uuid = z.string().uuid();
export const email = z.string().email().max(320);

// ─── Auth schemas ───

export const signInSchema = z.object({
  email: email,
  password: z.string().min(1, 'Password is required'),
});

export const signUpSchema = z.object({
  email: email,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(50),
});

export const resetPasswordRequestSchema = z.object({
  email: email,
});

export const updatePasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const oauthProviderSchema = z.enum(['google', 'apple']);

// ─── Course schemas ───

export const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(5000).optional(),
});

export const updateCourseSchema = createCourseSchema.partial().extend({
  id: uuid,
});

export const createModuleSchema = z.object({
  courseId: uuid,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const createLessonSchema = z.object({
  moduleId: uuid,
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  contentType: z.enum(['video', 'text', 'quiz']),
  description: z.string().max(2000).optional(),
  youtubeVideoId: z.string().max(20).optional(),
  textContent: z.string().max(50000).optional(),
});

// ─── Enrollment schemas ───

export const createEnrollmentSchema = z.object({
  userId: uuid,
  accessLevelId: uuid,
  source: z.enum(['stripe', 'hotmart', 'guru', 'manual']),
  // Accept either a date-only string (YYYY-MM-DD, from <input type="date">)
  // or a full ISO timestamp (from Date.toISOString()). Postgres coerces both.
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/, 'Invalid date')
    .optional(),
});

// ─── Access Level schemas ───

export const createAccessLevelSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000).optional(),
  courseIds: z.array(uuid).min(1),
});

// ─── Cohort schemas ───

export const createCohortSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateCohortSchema = createCohortSchema.partial().extend({
  id: uuid,
});

// ─── Comment schemas ───

export const addCommentSchema = z.object({
  lessonId: uuid,
  content: z.string().min(1).max(2000),
  parentId: uuid.optional(),
});

// ─── Webhook config schemas ───

export const createWebhookConfigSchema = z.object({
  provider: z.enum(['stripe', 'hotmart', 'guru', 'generic']),
  name: z.string().min(1).max(100),
  accessLevelId: uuid,
  expirationDays: z.number().int().positive().optional(),
});

// ─── Notification schemas ───

export const markNotificationReadSchema = z.object({
  notificationId: uuid,
});

export const deleteNotificationSchema = z.object({
  notificationId: uuid,
});

// ─── Support ticket schemas ───

export const supportTicketStatusSchema = z.enum(['open', 'in_progress', 'closed']);

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(10_000),
});

export const updateSupportTicketSchema = z.object({
  id: uuid,
  status: supportTicketStatusSchema,
  adminNote: z.string().max(5_000).optional(),
});

// ─── Helper ───

export function formDataToObject(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  formData.forEach((value, key) => {
    obj[key] = value.toString();
  });
  return obj;
}
