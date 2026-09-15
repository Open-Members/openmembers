import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), remove: vi.fn(), notify: vi.fn(), mutate: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/services/r2/presign', () => ({ bulkDeleteObjects: mocks.remove }));
vi.mock('@/lib/services/r2/client', () => ({ isR2Configured: () => true }));
vi.mock('@/features/Notifications/content-events', () => ({ notifyCoursePublished: mocks.notify, notifyLessonPublished: mocks.notify }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { deleteCourse, deleteLesson, deleteModule, toggleCoursePublished, updateCourse, updateLesson } from './actions';

const CONTENT_ID = '11111111-1111-4111-8111-111111111111';

function setupClient({ status = 'active', changed = false } = {}) {
  const from = vi.fn((table: string) => {
    let mutation = false;
    const row = table === 'profiles' ? { role: 'admin', status }
      : table === 'courses' ? { id: CONTENT_ID, trailer_r2_key: 'old-video.mp4', is_published: false }
      : { id: CONTENT_ID, video_provider: 'r2', video_external_id: 'old-video.mp4', is_published: true };
    const result = () => ({ data: mutation ? (changed ? { id: CONTENT_ID } : null) : row, error: null });
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder,
      update: (payload: unknown) => { mutation = true; mocks.mutate(table, payload); return builder; },
      delete: () => { mutation = true; mocks.mutate(table, 'delete'); return builder; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [row], error: null }).then(resolve),
    };
    return builder;
  });
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'session-admin' } } }) }, from });
  return from;
}

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

const actions = [
  ['replace trailer', () => updateCourse(form({ id: CONTENT_ID, trailerR2Key: 'replacement.mp4' }))],
  ['delete course', () => deleteCourse(CONTENT_ID)],
  ['delete module', () => deleteModule(CONTENT_ID)],
  ['replace lesson video', () => updateLesson(CONTENT_ID, form({ videoProvider: 'r2', videoExternalId: 'replacement.mp4' }))],
  ['delete lesson', () => deleteLesson(CONTENT_ID)],
  ['publish course', () => toggleCoursePublished(CONTENT_ID)],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  setupClient();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('content mutations require active authority and an affected row', () => {
  for (const [name, action] of actions) {
    it(`rejects a suspended administrator before ${name}`, async () => {
      setupClient({ status: 'suspended' });
      await expect(action()).rejects.toThrow('Forbidden');
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    });

    it(`does not run side effects when ${name} affects no row`, async () => {
      expect(await action()).toHaveProperty('error');
      expect(mocks.mutate).toHaveBeenCalledOnce();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    });
  }

  it('removes the previous object only after the lesson deletion is confirmed', async () => {
    setupClient({ changed: true });
    expect(await deleteLesson(CONTENT_ID)).toEqual({ success: true });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(['old-video.mp4']);
    expect(mocks.mutate.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  });
});
