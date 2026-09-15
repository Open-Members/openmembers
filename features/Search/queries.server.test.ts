import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getUser: vi.fn(),
  profile: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/core/supabase/server', () => ({ createClient: state.createClient }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: state.createAdminClient }));
// Keep the real shared access helpers: these tests also exercise their session
// identity/profile boundary. RPC decisions remain controlled, not a DB proof.
import { searchGlobal } from './queries.server';

const course = {
  id: 'course-open', slug: 'open-members-demo', title: 'Demo course',
  short_description: 'Public course description', thumbnail_landscape_url: null,
  thumbnail_url: '/demo-course.svg',
};
const lesson = {
  id: 'lesson-open', slug: 'demo-lesson', title: 'Demo lesson',
  description: 'Lesson description', is_free_preview: false,
  module: { course: { id: course.id, slug: course.slug, title: course.title } },
};

type QueryResult = { data: unknown[] | null; error: { message: string } | null };
let courseResult: QueryResult;
let lessonResult: QueryResult;
let builders: ReturnType<typeof builder>[];

function builder(table: string) {
  let selected = '';
  const query = {
    table,
    select: vi.fn((fields: string) => { selected = fields; return query; }),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: state.profile,
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(resolve(
      table === 'lessons' ? lessonResult
        : selected === 'id' ? { data: [{ id: course.id }], error: null }
          : courseResult,
    )),
  };
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  builders = [];
  courseResult = { data: [{ ...course }], error: null };
  lessonResult = { data: [{ ...lesson }], error: null };
  state.getUser.mockResolvedValue({ data: { user: { id: 'student' } }, error: null });
  state.profile.mockResolvedValue({ data: { role: 'user', status: 'active' }, error: null });
  state.rpc.mockResolvedValue({ data: true, error: null });
  const client = {
    auth: { getUser: state.getUser }, rpc: state.rpc,
    from: (table: string) => {
      const query = builder(table);
      builders.push(query);
      return query;
    },
  };
  state.createClient.mockResolvedValue(client);
  state.createAdminClient.mockReturnValue(client);
});

function lessonDecision(data: unknown, error: { message: string } | null = null) {
  state.rpc.mockImplementation(async (name: string) => ({
    data: name === 'can_access_lesson' ? data : true, error,
  }));
}

function lessonQuery() {
  return builders.find(query => query.table === 'lessons');
}

describe('search visibility', () => {
  it('returns an authorized lesson and keeps the shared gate bound to the session', async () => {
    const result = await searchGlobal('Demo', 'student');
    expect(result.courses).toEqual([{
      kind: 'course', id: course.id, slug: course.slug, title: course.title,
      subtitle: course.short_description, thumbnailUrl: course.thumbnail_url,
      locked: false, href: '/courses/open-members-demo',
    }]);
    expect(result.lessons).toEqual([{
      kind: 'lesson', id: lesson.id, slug: lesson.slug, title: lesson.title,
      description: lesson.description, courseSlug: course.slug, courseTitle: course.title,
      locked: false, href: '/courses/open-members-demo/demo-lesson',
    }]);
    expect(state.rpc).toHaveBeenCalledWith('can_access_lesson', { p_lesson_id: lesson.id });
    expect(state.createAdminClient).not.toHaveBeenCalled();
  });

  it('keeps the anonymous catalog public without reading lesson metadata', async () => {
    const result = await searchGlobal('Demo', null);
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].locked).toBe(true);
    expect(result.lessons).toEqual([]);
    expect(lessonQuery()).toBeUndefined();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(['missing enrollment', 'expired enrollment', 'drip not released'])(
    'omits every lesson field when the canonical policy denies it: %s', async () => {
      lessonDecision(false);
      const result = await searchGlobal('Demo', 'student');
      expect(result.courses).toHaveLength(1);
      expect(result.lessons).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(lesson.slug);
      expect(JSON.stringify(result)).not.toContain(lesson.description);
    },
  );

  it('does not use course access or a preview flag to bypass a lesson denial', async () => {
    lessonResult.data = [{ ...lesson, is_free_preview: true }];
    lessonDecision(false);
    const result = await searchGlobal('Demo', 'student');
    expect(result.courses[0].locked).toBe(false);
    expect(result.lessons).toEqual([]);
  });

  it('returns an explicitly authorized preview while keeping its paid course locked', async () => {
    lessonResult.data = [{ ...lesson, is_free_preview: true }];
    state.rpc.mockImplementation(async (name: string) => ({
      data: name === 'can_access_lesson', error: null,
    }));
    const result = await searchGlobal('Demo', 'student');
    expect(result.courses[0].locked).toBe(true);
    expect(result.lessons[0].locked).toBe(false);
  });

  it.each([
    { data: null, error: null },
    { data: { role: 'user', status: 'suspended' }, error: null },
    { data: { role: 'admin', status: 'suspended' }, error: null },
    { data: { role: 'user', status: 'active' }, error: { message: 'unavailable' } },
  ])('withholds lessons from a missing, suspended or unreadable profile', async profile => {
    state.profile.mockResolvedValue(profile);
    const result = await searchGlobal('Demo', 'student');
    expect(result.lessons).toEqual([]);
    expect(result.courses[0].locked).toBe(true);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: 'another-user' } }, error: null },
    { data: { user: { id: 'student' } }, error: { message: 'invalid session' } },
  ])('does not trust an identity without its matching authenticated session', async session => {
    state.getUser.mockResolvedValue(session);
    const result = await searchGlobal('Demo', 'student');
    expect(result.lessons).toEqual([]);
    expect(result.courses[0].locked).toBe(true);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('constrains the RLS query to published lessons, modules and courses, even for an administrator', async () => {
    state.profile.mockResolvedValue({ data: { role: 'admin', status: 'active' }, error: null });
    await searchGlobal('Demo', 'student');
    const query = lessonQuery()!;
    expect(query.eq.mock.calls).toEqual([
      ['is_published', true], ['module.is_published', true],
      ['module.course.is_published', true], ['module.course.is_coming_soon', false],
    ]);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('module:modules!inner'));
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('course:courses!inner'));
    expect(query.limit).toHaveBeenCalledExactlyOnceWith(8);
  });

  it('omits rows without a parent course', async () => {
    lessonResult.data = [{ ...lesson, module: null }, { ...lesson, module: { course: null } }];
    expect((await searchGlobal('Demo', 'student')).lessons).toEqual([]);
  });
});

describe('search failure and input boundaries', () => {
  it.each([null, 'true', true])('fails closed when the lesson RPC is unavailable or nonboolean: %s', async data => {
    lessonDecision(data, data === true ? { message: 'unavailable' } : null);
    expect((await searchGlobal('Demo', 'student')).lessons).toEqual([]);
  });

  it('fails closed when the lesson RPC throws', async () => {
    state.rpc.mockImplementation(async (name: string) => {
      if (name === 'can_access_lesson') throw new Error('unavailable');
      return { data: true, error: null };
    });
    expect((await searchGlobal('Demo', 'student')).lessons).toEqual([]);
  });

  it('does not return lesson data alongside a query error', async () => {
    lessonResult.error = { message: 'unavailable' };
    const result = await searchGlobal('Demo', 'student');
    expect(result.lessons).toEqual([]);
    expect(result.courses).toHaveLength(1);
    expect(result.error).toBe('searchFailed');
    expect(state.rpc).not.toHaveBeenCalledWith('can_access_lesson', expect.anything());
  });

  it('does not return course data alongside a query error', async () => {
    courseResult.error = { message: 'unavailable' };
    const result = await searchGlobal('Demo', 'student');
    expect(result.courses).toEqual([]);
    expect(result.lessons).toHaveLength(1);
    expect(result.error).toBe('searchFailed');
  });

  it.each(['', ' ', 'a', '(%,*)'])('does no work for a query shorter than two safe characters: %s', async query => {
    expect(await searchGlobal(query, 'student')).toEqual({ query, courses: [], lessons: [] });
    expect(state.createClient).not.toHaveBeenCalled();
    expect(state.createAdminClient).not.toHaveBeenCalled();
  });

  it('removes filter syntax, preserves Unicode and bounds the search text', async () => {
    const rawQuery = `  Aula (ação),%* ${'x'.repeat(100)}`;
    await searchGlobal(rawQuery, 'student');
    const safe = `Aula ação ${'x'.repeat(100)}`.slice(0, 80);
    expect(lessonQuery()!.or).toHaveBeenCalledExactlyOnceWith(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  });
});
