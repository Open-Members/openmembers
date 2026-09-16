import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { getDatabaseTestStatus } from './environment.mjs';

const local = getDatabaseTestStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const db = new pg.Client({ connectionString: local.DB_URL });
before(async () => db.connect());
after(async () => db.end());
async function rpc(args) {
  const result = await service.rpc('apply_manual_enrollment', args);
  assert.equal(result.error, null);
  return result.data;
}
async function fixture(run) {
  const tag = `manual-${randomUUID()}`;
  const level = randomUUID(); const course = randomUUID(); const otherCourse = randomUUID();
  const cohort = randomUUID(); const replacement = randomUUID(); const otherCohort = randomUUID();
  const user = await service.auth.admin.createUser({ email: `${tag}@example.test`, email_confirm: true });
  assert.equal(user.error, null);
  const userId = user.data.user.id;
  try {
    assert.equal((await service.from('courses').insert([
      { id: course, title: 'Manual fixture', slug: tag }, { id: otherCourse, title: 'Other fixture', slug: `${tag}-other` },
    ])).error, null);
    assert.equal((await service.from('access_levels').insert({ id: level, name: 'Manual fixture', slug: tag })).error, null);
    assert.equal((await service.from('access_level_courses').insert([{ access_level_id: level, course_id: course }, { access_level_id: level, course_id: otherCourse }])).error, null);
    assert.equal((await service.from('cohorts').insert([
      { id: cohort, course_id: course, name: 'Original', slug: 'original' },
      { id: replacement, course_id: course, name: 'Replacement', slug: 'replacement' },
      { id: otherCohort, course_id: otherCourse, name: 'Other', slug: 'other' },
    ])).error, null);
    const args = { p_user_id: userId, p_access_level_id: level, p_source: 'manual', p_source_transaction_id: null,
      p_expires_at: '2027-01-01T00:00:00Z', p_cohort_mode: 'replace', p_cohorts: [{ course_id: course, cohort_id: cohort }] };
    await run({ userId, level, course, otherCourse, cohort, replacement, otherCohort, args });
  } finally {
    assert.equal((await service.auth.admin.deleteUser(userId)).error, null);
    assert.equal((await service.from('access_levels').delete().eq('id', level)).error, null);
    assert.equal((await service.from('courses').delete().in('id', [course, otherCourse])).error, null);
  }
}
async function snapshot(id) {
  const enrollment = (await db.query('SELECT * FROM public.enrollments WHERE id=$1', [id])).rows[0];
  const cohorts = (await db.query('SELECT course_id,cohort_id FROM public.enrollment_cohorts WHERE enrollment_id=$1 ORDER BY course_id', [id])).rows;
  return { enrollment, cohorts };
}

test('parallel manual grants create one enrollment and preserve its original enrollment date on later edits', async () => {
  await fixture(async ({ args }) => {
    const grants = await Promise.all([rpc(args), rpc(args)]);
    assert.deepEqual(grants.map(grant => grant.created).sort(), [false, true]);
    assert.equal(grants[0].enrollment_id, grants[1].enrollment_id);
    const id = grants[0].enrollment_id;
    await db.query("UPDATE public.enrollments SET enrolled_at='2025-01-01',is_active=false,revocation_reason='refund',revoked_at=now(),external_product_id='previous-product' WHERE id=$1", [id]);
    assert.equal((await rpc({ ...args, p_expires_at: null })).created, false);
    const current = await snapshot(id);
    assert.equal(current.enrollment.enrolled_at.toISOString(), '2025-01-01T00:00:00.000Z');
    assert.equal(current.enrollment.expires_at, null);
    assert.equal(current.enrollment.is_active, true);
    assert.equal(current.enrollment.revocation_reason, null);
    assert.equal(current.enrollment.revoked_at, null);
    assert.equal(current.enrollment.external_product_id, null);
    assert.equal(current.cohorts.length, 1);
  });
});

test('manual cohort modes preserve omitted assignments, merge one course, and replace or clear explicitly', async () => {
  await fixture(async ({ args, course, otherCourse, replacement, otherCohort }) => {
    const { enrollment_id: id } = await rpc(args);
    await rpc({ ...args, p_cohort_mode: 'merge', p_cohorts: [{ cohort_id: otherCohort }] });
    const merged = await snapshot(id);
    assert.equal(merged.cohorts.length, 2);
    assert.ok(merged.cohorts.some(row => row.course_id === otherCourse && row.cohort_id === otherCohort));
    await rpc({ ...args, p_cohort_mode: 'preserve', p_cohorts: [] });
    assert.deepEqual((await snapshot(id)).cohorts, merged.cohorts);
    await rpc({ ...args, p_cohorts: [{ course_id: course, cohort_id: replacement }] });
    assert.deepEqual((await snapshot(id)).cohorts, [{ course_id: course, cohort_id: replacement }]);
    await rpc({ ...args, p_cohorts: [] });
    assert.deepEqual((await snapshot(id)).cohorts, []);
  });
});

test('invalid or duplicate cohorts fail without changing enrollment or existing assignments', async () => {
  await fixture(async ({ args, course, otherCohort, cohort }) => {
    const { enrollment_id: id } = await rpc(args);
    const before = await snapshot(id);
    for (const p_cohorts of [
      [{ course_id: course, cohort_id: randomUUID() }],
      [{ course_id: course, cohort_id: otherCohort }],
      [{ course_id: course, cohort_id: cohort }, { course_id: course, cohort_id: cohort }],
    ]) {
      const result = await service.rpc('apply_manual_enrollment', { ...args, p_expires_at: null, p_cohorts });
      assert.equal(result.error?.code, '23514');
      assert.deepEqual(await snapshot(id), before);
    }
  });
});

test('a database failure after the replacement delete rolls back both enrollment and cohorts', async () => {
  await fixture(async ({ args, replacement }) => {
    const { enrollment_id: id } = await rpc(args);
    const before = await snapshot(id);
    await db.query('BEGIN');
    try {
      // Transaction-local fault injection; rolled back in finally, never installed permanently.
      await db.query("CREATE FUNCTION public.development_reject_manual_cohort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious cohort insertion failure'; END $$");
      await db.query('CREATE TRIGGER development_manual_failure BEFORE INSERT ON public.enrollment_cohorts FOR EACH ROW EXECUTE FUNCTION public.development_reject_manual_cohort()');
      await db.query('SAVEPOINT before_grant');
      await assert.rejects(db.query('SELECT public.apply_manual_enrollment($1,$2,$3,$4,$5,$6,$7::jsonb)', [
        args.p_user_id, args.p_access_level_id, 'manual_admin_add', null, null, 'replace', JSON.stringify([{ cohort_id: replacement }]),
      ]), /Fictitious cohort insertion failure/);
      await db.query('ROLLBACK TO SAVEPOINT before_grant');
      assert.deepEqual(await snapshot(id), before);
    } finally {
      await db.query('ROLLBACK');
    }
    assert.deepEqual(await snapshot(id), before);
  });
});

test('manual grant RPC is service-only with fixed search path and exact arguments', async () => {
  const { rows } = await db.query(`SELECT p.prosecdef,p.proconfig,p.proargnames,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS member,
    has_function_privilege('service_role',p.oid,'EXECUTE') AS service,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p WHERE p.oid=to_regprocedure('public.apply_manual_enrollment(uuid,uuid,text,text,timestamp with time zone,text,jsonb)')`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prosecdef, true);
  assert.ok(rows[0].proconfig.includes('search_path=""'));
  assert.deepEqual(rows[0].proargnames, ['p_user_id','p_access_level_id','p_source','p_source_transaction_id','p_expires_at','p_cohort_mode','p_cohorts']);
  assert.equal(rows[0].anon, false); assert.equal(rows[0].member, false); assert.equal(rows[0].service, true); assert.equal(rows[0].public_execute, false);
});
