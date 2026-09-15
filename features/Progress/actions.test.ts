// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), user: vi.fn(), access: vi.fn(), upsert: vi.fn(),
  findCourse: vi.fn(), completeCourse: vi.fn(), incompleteCourse: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/core/access/server', () => ({ isUserLessonAccessible: mocks.access }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/activity/track', () => ({
  findCourseIdForLesson: mocks.findCourse,
  markCourseCompletedIfReady: mocks.completeCourse,
  markCourseIncomplete: mocks.incompleteCourse,
}));
import { markLessonComplete, saveVideoPosition, setLessonCompleted } from './actions';

const lessonId = '11111111-1111-4111-8111-111111111111';
let from: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: 'session-user' } }, error: null });
  mocks.access.mockResolvedValue(true);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.findCourse.mockResolvedValue('course-id');
  mocks.completeCourse.mockResolvedValue({ courseJustCompleted: false });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { slug: 'demo-course' }, error: null }) };
  from = vi.fn((table: string) => table === 'lesson_progress' ? { upsert: mocks.upsert } : query);
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.user }, from });
});

const actions = [
  ['completion toggle', () => setLessonCompleted(lessonId, true)],
  ['video completion', () => markLessonComplete(lessonId)],
  ['resume position', () => saveVideoPosition(lessonId, 43.8)],
] as const;

for (const [name, action] of actions) {
  describe(name, () => {
    it('returns a safe error key for an unexpected transport failure', async () => {
      mocks.client.mockRejectedValue(new Error('Private transport details'));
      expect(await action()).toEqual({ error: 'saveProgressFailed' });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
    });
    it('rejects missing session before access or persistence', async () => {
      mocks.user.mockResolvedValue({ data: { user: null }, error: null });
      expect(await action()).toEqual({ error: 'notAuthenticated' });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    });
    it('rejects an errored identity response even if a user object is present', async () => {
      mocks.user.mockResolvedValue({ data: { user: { id: 'session-user' } }, error: { message: 'Session invalid' } });
      expect(await action()).toEqual({ error: 'notAuthenticated' });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    });
    it('rejects access denial before writing or triggering course completion', async () => {
      mocks.access.mockResolvedValue(false);
      expect(await action()).toEqual({ error: 'accessDenied' });
      expect(mocks.access).toHaveBeenCalledWith('session-user', lessonId);
      expect(from).not.toHaveBeenCalled();
      expect(mocks.findCourse).not.toHaveBeenCalled();
    });
    it('propagates a persistence failure without notifications or invalidation', async () => {
      mocks.upsert.mockResolvedValue({ error: { message: 'Write rejected' } });
      expect(await action()).toEqual({ error: 'saveProgressFailed' });
      expect(mocks.findCourse).not.toHaveBeenCalled();
      expect(mocks.completeCourse).not.toHaveBeenCalled();
      expect(mocks.incompleteCourse).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it('always writes progress owned by the verified session', async () => {
      await action();
      expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'session-user', lesson_id: lessonId }), { onConflict: 'user_id,lesson_id' });
    });
  });
}

it.each([
  (id: string) => setLessonCompleted(id, true),
  (id: string) => markLessonComplete(id),
  (id: string) => saveVideoPosition(id, 10),
])('rejects an invalid lesson ID at the server boundary', async action => {
  expect(await action('not-a-uuid')).toHaveProperty('error');
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each([null, 'false', 1, undefined])('rejects non-boolean completion %s', async completed => {
  expect(await setLessonCompleted(lessonId, completed as unknown as boolean)).toHaveProperty('error');
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each([NaN, Infinity, -Infinity, -1, 2147483648, '12', null])('rejects invalid stored position %s', async seconds => {
  expect(await saveVideoPosition(lessonId, seconds as number)).toHaveProperty('error');
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each([0, 43.8, 2147483647])('persists valid position %s without overwriting completion', async seconds => {
  expect(await saveVideoPosition(lessonId, seconds)).toEqual({ success: true });
  expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({ user_id: 'session-user', lesson_id: lessonId, video_position_seconds: Math.floor(seconds) }, { onConflict: 'user_id,lesson_id' });
  expect(mocks.completeCourse).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it.each([() => markLessonComplete(lessonId), () => setLessonCompleted(lessonId, true)])('returns course completion only after a successful progress write', async action => {
  mocks.completeCourse.mockResolvedValue({ courseJustCompleted: true });
  expect(await action()).toEqual({ success: true, courseJustCompleted: true, courseSlug: 'demo-course' });
  expect(mocks.completeCourse).toHaveBeenCalledWith('session-user', 'course-id');
  expect(mocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(mocks.completeCourse.mock.invocationCallOrder[0]);
});
it('unmarks course completion while preserving the last video position', async () => {
  expect(await setLessonCompleted(lessonId, false)).toMatchObject({ success: true, courseJustCompleted: false });
  expect(mocks.upsert).toHaveBeenCalledWith({ user_id: 'session-user', lesson_id: lessonId, is_completed: false, completed_at: null }, { onConflict: 'user_id,lesson_id' });
  expect(mocks.incompleteCourse).toHaveBeenCalledWith('session-user', 'course-id');
  expect(mocks.completeCourse).not.toHaveBeenCalled();
});
