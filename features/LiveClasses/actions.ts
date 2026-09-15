'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/core/access/admin';
import {
  listAllLiveClasses,
  createLiveClass as createLiveClassQuery,
  updateLiveClass as updateLiveClassQuery,
  deleteLiveClass as deleteLiveClassQuery,
} from './queries.server';
import type { LiveClassWithCourse } from './types';
import {
  zonedWallClockToUtcIso,
  DEFAULT_ORIGIN_TIMEZONE,
} from './lib/timezone';

const InputSchema = z.object({
  courseIds: z
    .array(z.string().uuid())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  startsAt: z.string().min(1),
  durationMinutes: z.number().int().min(5).max(600),
  meetingUrl: z.string().trim().url(),
  originTimezone: z.string().trim().min(1).max(64),
});

type FormResult = { success: true } | { error: string };
const idSchema = z.string().uuid();

function parseCourseIds(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed))
      return parsed.filter((v) => typeof v === 'string');
  } catch {
    // fall through
  }
  // Fallback: comma-separated
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseForm(
  formData: FormData,
): z.infer<typeof InputSchema> | { error: string } {
  const raw = {
    courseIds: parseCourseIds(formData.get('courseIds')),
    title: String(formData.get('title') ?? ''),
    description: formData.get('description')
      ? String(formData.get('description'))
      : null,
    startsAt: String(formData.get('startsAt') ?? ''),
    durationMinutes: Number(formData.get('durationMinutes') ?? 60),
    meetingUrl: String(formData.get('meetingUrl') ?? ''),
    originTimezone:
      String(formData.get('originTimezone') ?? '') || DEFAULT_ORIGIN_TIMEZONE,
  };
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const error =
      field === 'courseIds'
        ? 'liveCourses'
        : field === 'title'
          ? 'liveTitle'
          : field === 'durationMinutes'
            ? 'liveDuration'
            : field === 'meetingUrl'
              ? 'liveUrl'
              : field === 'startsAt' || field === 'originTimezone'
                ? 'liveDate'
                : field === 'description'
                  ? 'liveDescription'
                  : 'invalidInput';
    return { error };
  }
  return parsed.data;
}

export async function getAdminLiveClasses(): Promise<LiveClassWithCourse[]> {
  await requireAdmin();
  return listAllLiveClasses();
}

export async function createLiveClassAction(
  formData: FormData,
): Promise<FormResult> {
  await requireAdmin();
  const parsed = parseForm(formData);
  if ('error' in parsed) return parsed;

  try {
    await createLiveClassQuery({
      courseIds: parsed.courseIds,
      title: parsed.title,
      description: parsed.description?.trim() || null,
      startsAt: zonedWallClockToUtcIso(parsed.startsAt, parsed.originTimezone),
      durationMinutes: parsed.durationMinutes,
      meetingUrl: parsed.meetingUrl,
      originTimezone: parsed.originTimezone,
    });
    revalidatePath('/admin/live-classes');
    revalidatePath('/dashboard');
    revalidatePath('/progress');
    return { success: true };
  } catch {
    return { error: 'operationFailed' };
  }
}

export async function updateLiveClassAction(
  id: string,
  formData: FormData,
): Promise<FormResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: 'invalidInput' };
  const parsed = parseForm(formData);
  if ('error' in parsed) return parsed;

  try {
    await updateLiveClassQuery(id, {
      courseIds: parsed.courseIds,
      title: parsed.title,
      description: parsed.description?.trim() || null,
      startsAt: zonedWallClockToUtcIso(parsed.startsAt, parsed.originTimezone),
      durationMinutes: parsed.durationMinutes,
      meetingUrl: parsed.meetingUrl,
      originTimezone: parsed.originTimezone,
    });
    revalidatePath('/admin/live-classes');
    revalidatePath('/dashboard');
    revalidatePath('/progress');
    return { success: true };
  } catch {
    return { error: 'operationFailed' };
  }
}

export async function deleteLiveClassAction(id: string): Promise<FormResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: 'invalidInput' };
  try {
    await deleteLiveClassQuery(id);
    revalidatePath('/admin/live-classes');
    revalidatePath('/dashboard');
    revalidatePath('/progress');
    return { success: true };
  } catch {
    return { error: 'operationFailed' };
  }
}
