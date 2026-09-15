import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getDatabaseTestStatus } from './environment.mjs';

// Refuses remote/linked projects and unexpected API/database ports. Executing
// this file requires the isolated local stack; node --check does not contact it.
const local = getDatabaseTestStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const anon = createClient(local.API_URL, local.ANON_KEY, options);
const day = 24 * 60 * 60 * 1000;

async function insert(table, values) {
  const result = await service.from(table).insert(values).select().single();
  assert.equal(result.error, null, `Fixture insert failed: ${table}`);
  return result.data;
}

async function update(table, id, values) {
  const result = await service.from(table).update(values).eq('id', id).select('id').single();
  assert.equal(result.error, null, `Fixture update failed: ${table}`);
  assert.equal(result.data.id, id);
}

async function withFixture(run) {
  const tag = `search-${randomUUID()}`;
  const users = [];
  const courses = [];
  const levels = [];
  const fixture = {
    tag,
    async user({ status = 'active', role = 'user' } = {}) {
      const email = `${tag}-${users.length}@example.test`;
      const password = `Fixture-${randomUUID()}-aA9!`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null);
      const id = created.data.user.id;
      users.push(id);
      await update('profiles', id, { status, role, display_name: tag });
      const client = createClient(local.API_URL, local.ANON_KEY, options);
      const signedIn = await client.auth.signInWithPassword({ email, password });
      assert.equal(signedIn.error, null);
      return { id, client };
    },
    async course() {
      const id = randomUUID();
      courses.push(id);
      return insert('courses', { id, title: tag, slug: `${tag}-${courses.length}`, is_published: true });
    },
    async module(courseId) {
      return insert('modules', { id: randomUUID(), course_id: courseId, title: tag, is_published: true });
    },
    async lesson(moduleId, values = {}) {
      const id = randomUUID();
      return insert('lessons', {
        id, module_id: moduleId, slug: id, title: tag, description: `Metadata for ${id}`,
        text_content: 'Fictitious lesson body, never selected by search.',
        content_type: 'text', is_published: true, ...values,
      });
    },
    async enrollment(userId, courseId, { expired = false } = {}) {
      const levelId = randomUUID();
      levels.push(levelId);
      await insert('access_levels', { id: levelId, name: tag, slug: `${tag}-${levels.length}` });
      await insert('access_level_courses', { access_level_id: levelId, course_id: courseId });
      return insert('enrollments', {
        id: randomUUID(), user_id: userId, access_level_id: levelId,
        enrolled_at: new Date(Date.now() - 2 * day).toISOString(),
        expires_at: expired ? new Date(Date.now() - day).toISOString() : null,
        is_active: true,
      });
    },
    async rule(courseId, lessonId, released = false) {
      return insert('drip_rules', {
        id: randomUUID(), course_id: courseId, lesson_id: lessonId,
        rule_type: 'fixed_date', fixed_date: new Date(Date.now() + (released ? -day : day)).toISOString(),
      });
    },
  };
  try {
    return await run(fixture);
  } finally {
    // No demo IDs or shared records are edited/deleted. Attempt all cleanup
    // even when an earlier deletion fails; courses cascade their own content.
    const failures = [];
    for (const id of users) {
      try {
        const { error } = await service.auth.admin.deleteUser(id);
        if (error) failures.push(`user ${id}: ${error.message}`);
      } catch {
        failures.push(`user ${id}: cleanup request failed`);
      }
    }
    for (const [table, ids] of [['courses', courses], ['access_levels', levels]]) {
      if (!ids.length) continue;
      try {
        const { error } = await service.from(table).delete().in('id', ids);
        if (error) failures.push(`${table}: ${error.message}`);
      } catch {
        failures.push(`${table}: cleanup request failed`);
      }
    }
    assert.deepEqual(failures, [], 'Search fixture cleanup failed');
  }
}

async function searchLessons(client, fixture, courseId) {
  const pattern = `%${fixture.tag}%`;
  // Same projection, inner relations, publication filters and limit as
  // features/Search/queries.server.ts. The fixture ID prevents interference
  // from other concurrently executing contract files; order makes limit
  // assertions deterministic without changing which rows RLS permits.
  const result = await client.from('lessons').select(`id, slug, title, description,
    module:modules!inner (course:courses!inner (id, slug, title))`)
    .eq('is_published', true)
    .eq('module.is_published', true)
    .eq('module.course.is_published', true)
    .eq('module.course.is_coming_soon', false)
    .eq('module.course.id', courseId)
    .or(`title.ilike.${pattern},description.ilike.${pattern}`)
    .order('sort_order')
    .limit(8);
  assert.equal(result.error, null, 'Session search query failed');
  for (const row of result.data) {
    assert.equal(row.module.course.id, courseId);
    assert.deepEqual(Object.keys(row).sort(), ['description', 'id', 'module', 'slug', 'title']);
  }
  return result.data;
}

async function assertDecisions(client, candidates, expected) {
  const allowed = new Set(expected);
  for (const lesson of candidates) {
    const result = await client.rpc('can_access_lesson', { p_lesson_id: lesson.id });
    assert.equal(result.error, null);
    assert.equal(result.data, allowed.has(lesson.id), 'Canonical RPC disagrees with search expectation');
  }
}

function sortedIds(rows) {
  return rows.map(row => row.id).sort();
}

test('search join applies the same lesson access to students, visitors, expired members and suspended profiles', async () => {
  await withFixture(async f => {
    const course = await f.course();
    const courseModule = await f.module(course.id);
    const lesson = await f.lesson(courseModule.id);
    const preview = await f.lesson(courseModule.id, { is_free_preview: true });
    const student = await f.user();
    const visitor = await f.user();
    const expired = await f.user();
    const suspended = await f.user({ status: 'suspended' });
    await f.enrollment(student.id, course.id);
    await f.enrollment(expired.id, course.id, { expired: true });
    await f.enrollment(suspended.id, course.id);

    for (const [user, expected] of [
      [student, [lesson.id, preview.id]], [visitor, [preview.id]],
      [expired, [preview.id]], [suspended, []],
    ]) {
      assert.deepEqual(sortedIds(await searchLessons(user.client, f, course.id)), [...expected].sort());
      await assertDecisions(user.client, [lesson, preview], expected);
    }
    const catalog = await anon.from('courses').select('id,title').eq('id', course.id).eq('is_published', true);
    assert.equal(catalog.error, null);
    assert.deepEqual(catalog.data, [{ id: course.id, title: course.title }]);
    const anonymousLessons = await anon.from('lessons').select('id,description').eq('module_id', courseModule.id);
    assert.ok(anonymousLessons.error || anonymousLessons.data.length === 0);
  });
});

test('student search excludes unpublished hierarchy and coming-soon courses even for an active administrator', async () => {
  await withFixture(async f => {
    const course = await f.course();
    const courseModule = await f.module(course.id);
    const lesson = await f.lesson(courseModule.id);
    const student = await f.user();
    const administrator = await f.user({ role: 'admin' });
    await f.enrollment(student.id, course.id);

    for (const [table, id, hidden, restored] of [
      ['lessons', lesson.id, { is_published: false }, { is_published: true }],
      ['modules', courseModule.id, { is_published: false }, { is_published: true }],
      ['courses', course.id, { is_published: false }, { is_published: true }],
      ['courses', course.id, { is_coming_soon: true }, { is_coming_soon: false }],
    ]) {
      for (const user of [student, administrator]) {
        assert.deepEqual(sortedIds(await searchLessons(user.client, f, course.id)), [lesson.id]);
      }
      await update(table, id, hidden);
      for (const user of [student, administrator]) {
        assert.deepEqual(await searchLessons(user.client, f, course.id), [], `${table} must not expose lesson metadata`);
      }
      await assertDecisions(student.client, [lesson], []);
      // The admin RPC bypass exists for content management. Publication filters
      // still constrain the student's search surface even under that session.
      await assertDecisions(administrator.client, [lesson], [lesson.id]);
      await update(table, id, restored);
    }
  });
});

test('drip-locked metadata is excluded before the eight-result limit and appears after release', async () => {
  await withFixture(async f => {
    const course = await f.course();
    const courseModule = await f.module(course.id);
    const student = await f.user();
    await f.enrollment(student.id, course.id);
    const locked = [];
    const released = [];
    for (let index = 0; index < 18; index++) {
      const lesson = await f.lesson(courseModule.id, { sort_order: index });
      const rule = await f.rule(course.id, lesson.id, index >= 10);
      (index < 10 ? locked : released).push({ ...lesson, rule });
    }
    const before = await searchLessons(student.client, f, course.id);
    assert.deepEqual(before.map(row => row.id), released.map(row => row.id));
    await assertDecisions(student.client, [...locked, ...released], released.map(row => row.id));

    await update('drip_rules', locked[0].rule.id, { fixed_date: new Date(Date.now() - day).toISOString() });
    const after = await searchLessons(student.client, f, course.id);
    assert.equal(after.length, 8);
    assert.deepEqual(after.map(row => row.id), [locked[0].id, ...released.slice(0, 7).map(row => row.id)]);
    const denied = new Set(locked.slice(1).map(row => row.id));
    assert.ok(after.every(row => !denied.has(row.id)));
  });
});
