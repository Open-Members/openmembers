import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { getDatabaseTestStatus } from './environment.mjs';

// The shared helper refuses remote API/database hosts and unexpected local ports.
const local = getDatabaseTestStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const anon = createClient(local.API_URL, local.ANON_KEY, options);
const db = new pg.Client({ connectionString: local.DB_URL });

before(async () => { await db.connect(); });
after(async () => { await db.end(); });

async function insert(table, values) {
  const { data, error } = await service.from(table).insert(values).select().single();
  assert.equal(error, null, `Fixture insert failed: ${table}`);
  return data;
}

async function withFixture(run) {
  const tag = `contract-${randomUUID()}`;
  const users = [];
  const courses = [];
  const levels = [];
  const fixture = {
    tag,
    async user({ role = 'user', status = 'active' } = {}) {
      const email = `${tag}-${users.length}@example.test`;
      const password = `Fixture-${randomUUID()}-aA9!`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null);
      const id = created.data.user.id;
      users.push(id);
      const client = createClient(local.API_URL, local.ANON_KEY, options);
      const signedIn = await client.auth.signInWithPassword({ email, password });
      assert.equal(signedIn.error, null);
      const profile = await service.from('profiles').update({ role, status, display_name: tag }).eq('id', id);
      assert.equal(profile.error, null);
      return { id, email, client };
    },
    async course() {
      const id = randomUUID();
      courses.push(id);
      return insert('courses', { id, title: 'Contract course', slug: `${tag}-${courses.length}`, is_published: true });
    },
    async module(courseId) {
      return insert('modules', { id: randomUUID(), course_id: courseId, title: 'Contract module', is_published: true });
    },
    async lesson(moduleId) {
      const id = randomUUID();
      return insert('lessons', { id, module_id: moduleId, title: 'Contract lesson', slug: id, content_type: 'text', text_content: 'Fictitious contract material.', is_published: true });
    },
    async enrollment(userId, courseId, { daysAgo = 0, isActive = true, expired = false } = {}) {
      const levelId = randomUUID();
      levels.push(levelId);
      await insert('access_levels', { id: levelId, name: 'Contract access', slug: `${tag}-${levels.length}` });
      await insert('access_level_courses', { access_level_id: levelId, course_id: courseId });
      const id = randomUUID();
      await db.query(`INSERT INTO public.enrollments (id, user_id, access_level_id, enrolled_at, is_active, expires_at)
        VALUES ($1, $2, $3, now() - make_interval(days => $4), $5,
          CASE WHEN $6 THEN now() - interval '1 day' ELSE NULL END)`,
      [id, userId, levelId, daysAgo, isActive, expired]);
      return { id, levelId };
    },
    async rule(courseId, values = {}) {
      return insert('drip_rules', { id: randomUUID(), course_id: courseId, rule_type: 'days_after_enrollment', days_after: 0, ...values });
    },
  };
  try {
    return await run(fixture);
  } finally {
    // Only UUIDs created by this fixture are removed; demo records are untouched.
    // Attempt every cleanup even if one deletion fails.
    const cleanupErrors = [];
    for (const id of users) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) cleanupErrors.push(error.message);
    }
    for (const [table, ids] of [['courses', courses], ['access_levels', levels]]) {
      if (!ids.length) continue;
      const { error } = await service.from(table).delete().in('id', ids);
      if (error) cleanupErrors.push(error.message);
    }
    assert.deepEqual(cleanupErrors, [], 'Fixture cleanup failed');
  }
}

async function assertLessonAccess(client, lessonId, allowed) {
  const rpc = await client.rpc('can_access_lesson', { p_lesson_id: lessonId });
  assert.equal(rpc.error, null);
  assert.equal(rpc.data, allowed, 'Lesson RPC decision');
  const rows = await client.from('lessons').select('id,text_content').eq('id', lessonId);
  assert.equal(rows.error, null);
  assert.deepEqual(rows.data.map(row => row.id), allowed ? [lessonId] : [], 'Lesson body RLS must agree with RPC');
}

test('privileged RPCs have exact app signatures, a fixed search path and no PUBLIC execute grant', async () => {
  const signatures = [
    'public.get_user_id_by_email(text)',
    'public.compute_user_streak(uuid)',
    'public.admin_search_students(text,text,text,text,integer,text,uuid,integer,integer)',
  ];
  const expectedArguments = [
    ['p_email'],
    ['p_user_id'],
    ['p_search', 'p_role', 'p_status', 'p_inactive', 'p_joined_days', 'p_source', 'p_access_level_id', 'p_page', 'p_page_size'],
  ];
  for (let i = 0; i < signatures.length; i++) {
    const { rows } = await db.query(`SELECT p.prosecdef, p.proconfig, p.proargnames[1:p.pronargs] AS input_names,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
      FROM pg_proc p WHERE p.oid = to_regprocedure($1)`, [signatures[i]]);
    assert.equal(rows.length, 1, signatures[i]);
    assert.deepEqual(rows[0].input_names, expectedArguments[i]);
    assert.equal(rows[0].prosecdef, true);
    assert.ok(rows[0].proconfig.includes('search_path=""'));
    assert.equal(rows[0].public_execute, false);
    assert.equal(rows[0].anon_execute, false);
    assert.equal(rows[0].authenticated_execute, i !== 0);
    assert.equal(rows[0].service_execute, true);
  }
});

test('email lookup is service-only even for an authenticated administrator', async () => {
  await withFixture(async f => {
    const student = await f.user();
    const administrator = await f.user({ role: 'admin' });
    const found = await service.rpc('get_user_id_by_email', { p_email: student.email.toUpperCase() });
    assert.equal(found.error, null);
    assert.equal(found.data, student.id);
    const missing = await service.rpc('get_user_id_by_email', { p_email: `missing-${f.tag}@example.test` });
    assert.equal(missing.error, null);
    assert.equal(missing.data, null);
    for (const client of [anon, student.client, administrator.client]) {
      const denied = await client.rpc('get_user_id_by_email', { p_email: student.email });
      assert.equal(denied.error?.code, '42501');
      assert.equal(denied.data, null);
    }
  });
});

test('streak RPC returns UTC activity streaks only to their active owner, active admins or service', async () => {
  await withFixture(async f => {
    const student = await f.user();
    const other = await f.user();
    const administrator = await f.user({ role: 'admin' });
    const course = await f.course();
    const courseModule = await f.module(course.id);
    // A recent 2-day streak, an older 4-day streak, a duplicate day and a stale row.
    for (const daysAgo of [1, 2, 7, 8, 9, 10, 10, 400]) {
      const lesson = await f.lesson(courseModule.id);
      await db.query(`INSERT INTO public.lesson_progress (user_id, lesson_id, is_completed, updated_at)
        VALUES ($1, $2, true,
          ((now() AT TIME ZONE 'UTC')::date - $3::integer + time '12:00') AT TIME ZONE 'UTC')`,
      [student.id, lesson.id, daysAgo]);
    }
    for (const client of [student.client, administrator.client, service]) {
      const result = await client.rpc('compute_user_streak', { p_user_id: student.id });
      assert.equal(result.error, null);
      assert.deepEqual(result.data, [{ current_streak: 2, longest_streak: 4 }]);
    }
    const forbidden = await other.client.rpc('compute_user_streak', { p_user_id: student.id });
    assert.equal(forbidden.error, null);
    assert.deepEqual(forbidden.data, [{ current_streak: 0, longest_streak: 0 }]);
    const suspended = await service.from('profiles').update({ status: 'suspended' }).eq('id', student.id);
    assert.equal(suspended.error, null);
    const ownSuspended = await student.client.rpc('compute_user_streak', { p_user_id: student.id });
    assert.equal(ownSuspended.error, null);
    assert.deepEqual(ownSuspended.data, [{ current_streak: 0, longest_streak: 0 }]);
    assert.equal((await anon.rpc('compute_user_streak', { p_user_id: student.id })).error?.code, '42501');
  });
});

test('student search honors its app parameters and denies students and suspended administrators', async () => {
  await withFixture(async f => {
    const student = await f.user();
    await f.user();
    const administrator = await f.user({ role: 'admin' });
    const suspended = await f.user({ role: 'admin', status: 'suspended' });
    const course = await f.course();
    const enrollment = await f.enrollment(student.id, course.id);
    await db.query(`UPDATE public.profiles SET signup_source = $2,
      last_login_at = now() - interval '10 days', created_at = now() - interval '2 days' WHERE id = $1`, [student.id, f.tag]);
    const args = { p_search: student.email, p_role: 'user', p_status: 'active', p_inactive: 'inactive_7',
      p_joined_days: 3, p_source: f.tag, p_access_level_id: enrollment.levelId, p_page: 1, p_page_size: 50 };
    for (const client of [administrator.client, service]) {
      const result = await client.rpc('admin_search_students', args);
      assert.equal(result.error, null);
      assert.equal(result.data.length, 1);
      const row = result.data[0];
      assert.deepEqual(Object.keys(row).sort(), ['id', 'email', 'display_name', 'role', 'status', 'created_at', 'last_sign_in_at', 'signup_source', 'enrollment_count', 'total_count'].sort());
      assert.equal(row.id, student.id);
      assert.equal(row.email, student.email);
      assert.equal(row.enrollment_count, 1);
      assert.equal(row.total_count, 1);
    }
    for (const client of [student.client, suspended.client]) {
      const result = await client.rpc('admin_search_students', args);
      assert.equal(result.error, null);
      assert.deepEqual(result.data, []);
    }
    for (const filter of [{ p_inactive: 'inactive_30' }, { p_joined_days: 1 }, { p_access_level_id: randomUUID() }]) {
      const result = await administrator.client.rpc('admin_search_students', { ...args, ...filter });
      assert.equal(result.error, null);
      assert.deepEqual(result.data, []);
    }
    const pages = [];
    for (const p_page of [1, 2]) {
      const result = await administrator.client.rpc('admin_search_students', { p_search: f.tag, p_role: 'user', p_page, p_page_size: 1 });
      assert.equal(result.error, null);
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].total_count, 2);
      pages.push(result.data[0].id);
    }
    assert.equal(new Set(pages).size, 2, 'Pagination must not repeat a row');
    assert.equal((await anon.rpc('admin_search_students', args)).error?.code, '42501');
  });
});

test('days-after-enrollment uses the earliest valid enrollment and ignores expired, inactive or unrelated access', async () => {
  await withFixture(async f => {
    const student = await f.user();
    const course = await f.course();
    const unrelated = await f.course();
    const courseModule = await f.module(course.id);
    const lesson = await f.lesson(courseModule.id);
    await f.rule(course.id, { days_after: 7 });
    const older = await f.enrollment(student.id, course.id, { daysAgo: 20 });
    const recent = await f.enrollment(student.id, course.id, { daysAgo: 1 });
    await f.enrollment(student.id, course.id, { daysAgo: 100, expired: true });
    await f.enrollment(student.id, course.id, { daysAgo: 100, isActive: false });
    await f.enrollment(student.id, unrelated.id, { daysAgo: 100 });
    await assertLessonAccess(student.client, lesson.id, true);
    await db.query('UPDATE public.enrollments SET is_active = false WHERE id = $1', [older.id]);
    await assertLessonAccess(student.client, lesson.id, false);
    await db.query("UPDATE public.enrollments SET enrolled_at = now() - interval '8 days' WHERE id = $1", [recent.id]);
    await assertLessonAccess(student.client, lesson.id, true);
    await db.query("UPDATE public.enrollments SET expires_at = now() - interval '1 minute' WHERE id = $1", [recent.id]);
    await assertLessonAccess(student.client, lesson.id, false);
    const courseAccess = await student.client.rpc('can_access_course', { p_course_id: course.id });
    assert.equal(courseAccess.error, null);
    assert.equal(courseAccess.data, false, 'Enrollment in another course does not confer access');
  });
});

test('lesson rules override module rules, module rules override course rules, and fixed dates respect time', async () => {
  await withFixture(async f => {
    const student = await f.user();
    const course = await f.course();
    const courseModule = await f.module(course.id);
    const lesson = await f.lesson(courseModule.id);
    await f.enrollment(student.id, course.id, { daysAgo: 20 });
    const courseRule = await f.rule(course.id, { days_after: 90 });
    await assertLessonAccess(student.client, lesson.id, false);
    const moduleRule = await f.rule(course.id, { module_id: courseModule.id });
    await assertLessonAccess(student.client, lesson.id, true);
    const lessonRule = await f.rule(course.id, { module_id: courseModule.id, lesson_id: lesson.id, days_after: 90 });
    await assertLessonAccess(student.client, lesson.id, false);
    await db.query('DELETE FROM public.drip_rules WHERE id = $1', [lessonRule.id]);
    await assertLessonAccess(student.client, lesson.id, true);
    await db.query('DELETE FROM public.drip_rules WHERE id = $1', [moduleRule.id]);
    await assertLessonAccess(student.client, lesson.id, false);
    await db.query("UPDATE public.drip_rules SET rule_type = 'fixed_date', fixed_date = now() - interval '1 hour' WHERE id = $1", [courseRule.id]);
    await assertLessonAccess(student.client, lesson.id, true);
    await db.query("UPDATE public.drip_rules SET fixed_date = now() + interval '1 hour' WHERE id = $1", [courseRule.id]);
    await assertLessonAccess(student.client, lesson.id, false);
  });
});

test('drip rules reject crossed course/module/lesson links and edits that would invalidate existing rules', async () => {
  await withFixture(async f => {
    const administrator = await f.user({ role: 'admin' });
    const course = await f.course();
    const otherCourse = await f.course();
    const courseModule = await f.module(course.id);
    const sibling = await f.module(course.id);
    const otherModule = await f.module(otherCourse.id);
    const lesson = await f.lesson(courseModule.id);
    const otherLesson = await f.lesson(otherModule.id);
    for (const links of [
      { module_id: otherModule.id },
      { lesson_id: otherLesson.id },
      { module_id: sibling.id, lesson_id: lesson.id },
    ]) {
      const result = await administrator.client.from('drip_rules').insert({ course_id: course.id, rule_type: 'days_after_enrollment', days_after: 0, ...links });
      assert.equal(result.error?.code, '23503');
    }
    const rule = await f.rule(course.id, { module_id: courseModule.id, lesson_id: lesson.id });
    for (const patch of [{ course_id: otherCourse.id }, { module_id: sibling.id }, { lesson_id: otherLesson.id }]) {
      const result = await administrator.client.from('drip_rules').update(patch).eq('id', rule.id);
      assert.equal(result.error?.code, '23503');
    }
    const movedModule = await administrator.client.from('modules').update({ course_id: otherCourse.id }).eq('id', courseModule.id);
    assert.equal(movedModule.error?.code, '23503');
    const movedLesson = await administrator.client.from('lessons').update({ module_id: sibling.id }).eq('id', lesson.id);
    assert.equal(movedLesson.error?.code, '23503');
    const stored = await service.from('drip_rules').select('course_id,module_id,lesson_id').eq('id', rule.id).single();
    assert.equal(stored.error, null);
    assert.deepEqual(stored.data, { course_id: course.id, module_id: courseModule.id, lesson_id: lesson.id });
  });
});

test('comment replies and enrollment cohorts cannot point across their parent relationships', async () => {
  await withFixture(async f => {
    const student = await f.user();
    const course = await f.course();
    const otherCourse = await f.course();
    const courseModule = await f.module(course.id);
    const lesson = await f.lesson(courseModule.id);
    const secondLesson = await f.lesson(courseModule.id);
    const enrollment = await f.enrollment(student.id, course.id);
    const parent = await student.client.from('lesson_comments').insert({ user_id: student.id, lesson_id: lesson.id, content: 'Fixture parent.' }).select('id').single();
    assert.equal(parent.error, null);
    const validReply = await student.client.from('lesson_comments').insert({ user_id: student.id, lesson_id: lesson.id, parent_id: parent.data.id, content: 'Fixture reply.' });
    assert.equal(validReply.error, null);
    const crossedReply = await student.client.from('lesson_comments').insert({ user_id: student.id, lesson_id: secondLesson.id, parent_id: parent.data.id, content: 'Invalid cross-lesson reply.' });
    assert.equal(crossedReply.error?.code, '23503');
    const cohort = await insert('cohorts', { course_id: otherCourse.id, name: 'Fixture cohort', slug: f.tag });
    const crossedCohort = await service.from('enrollment_cohorts').insert({ enrollment_id: enrollment.id, course_id: course.id, cohort_id: cohort.id });
    assert.equal(crossedCohort.error?.code, '23503');
  });
});

test('progress resume upserts preserve completion and unmarking preserves position', async () => {
  await withFixture(async fixture => {
    const learner = await fixture.user();
    const other = await fixture.user();
    const course = await fixture.course();
    const courseModule = await fixture.module(course.id);
    const lesson = await fixture.lesson(courseModule.id);
    await fixture.enrollment(learner.id, course.id);
    await fixture.enrollment(other.id, course.id);
    const key = { user_id: learner.id, lesson_id: lesson.id };
    const options = { onConflict: 'user_id,lesson_id' };
    const completedAt = new Date().toISOString();
    let result = await learner.client.from('lesson_progress').upsert({ ...key, is_completed: true, completed_at: completedAt }, options);
    assert.equal(result.error, null);
    result = await learner.client.from('lesson_progress').upsert({ ...key, video_position_seconds: 43 }, options);
    assert.equal(result.error, null);
    let saved = await learner.client.from('lesson_progress').select('is_completed,completed_at,video_position_seconds').match(key).single();
    assert.equal(saved.error, null);
    assert.equal(saved.data.is_completed, true);
    assert.equal(new Date(saved.data.completed_at).getTime(), new Date(completedAt).getTime());
    assert.equal(saved.data.video_position_seconds, 43);
    const hidden = await other.client.from('lesson_progress').select('user_id').match(key);
    assert.equal(hidden.error, null);
    assert.deepEqual(hidden.data, []);
    result = await learner.client.from('lesson_progress').upsert({ ...key, is_completed: false, completed_at: null }, options);
    assert.equal(result.error, null);
    saved = await learner.client.from('lesson_progress').select('is_completed,completed_at,video_position_seconds').match(key).single();
    assert.equal(saved.error, null);
    assert.deepEqual(saved.data, { is_completed: false, completed_at: null, video_position_seconds: 43 });
  });
});
