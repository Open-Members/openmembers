import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { getDatabaseTestStatus } from './environment.mjs';

const local = getDatabaseTestStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const anon = createClient(local.API_URL, local.ANON_KEY, options);
const db = new pg.Client({ connectionString: local.DB_URL });

before(async () => db.connect());
after(async () => db.end());

async function callAttempt(args) {
  const result = await service.rpc('submit_quiz_attempt', args);
  assert.equal(result.error, null);
  return result.data;
}

async function fixture(run, { maxAttempts = 1 } = {}) {
  const tag = `quiz-transaction-${randomUUID()}`;
  const courseId = randomUUID();
  const moduleId = randomUUID();
  const lessonId = randomUUID();
  const quizId = randomUUID();
  const created = await service.auth.admin.createUser({
    email: `${tag}@example.test`,
    email_confirm: true,
  });
  assert.equal(created.error, null);
  const userId = created.data.user.id;

  try {
    assert.equal(
      (
        await service.from('courses').insert({
          id: courseId,
          title: 'Transactional quiz fixture',
          slug: tag,
        })
      ).error,
      null,
    );
    assert.equal(
      (
        await service.from('modules').insert({
          id: moduleId,
          course_id: courseId,
          title: 'Transactional quiz module',
        })
      ).error,
      null,
    );
    assert.equal(
      (
        await service.from('lessons').insert({
          id: lessonId,
          module_id: moduleId,
          title: 'Transactional quiz lesson',
          slug: 'transactional-quiz',
          content_type: 'quiz',
        })
      ).error,
      null,
    );
    assert.equal(
      (
        await service.from('quizzes').insert({
          id: quizId,
          lesson_id: lessonId,
          pass_threshold_percent: 70,
          max_attempts: maxAttempts,
        })
      ).error,
      null,
    );

    await run({ userId, courseId, moduleId, lessonId, quizId });
  } finally {
    assert.equal((await service.auth.admin.deleteUser(userId)).error, null);
    assert.equal(
      (await service.from('courses').delete().eq('id', courseId)).error,
      null,
    );
  }
}

function attemptArgs(userId, quizId, overrides = {}) {
  return {
    p_user_id: userId,
    p_quiz_id: quizId,
    p_score_percent: 100,
    p_passed: true,
    p_answers: { question: 'correct-option' },
    p_completed_at: '2026-09-12T12:00:00.000Z',
    ...overrides,
  };
}

test('parallel submissions cannot exceed max_attempts and passing progress commits once', async () => {
  await fixture(async ({ userId, lessonId, quizId }) => {
    const args = attemptArgs(userId, quizId);
    const receipts = await Promise.all([callAttempt(args), callAttempt(args)]);

    assert.deepEqual(
      receipts.map((receipt) => receipt.status).sort(),
      ['max_attempts_reached', 'saved'],
    );
    for (const receipt of receipts) {
      assert.equal(receipt.attempts_used, 1);
      assert.equal(receipt.max_attempts, 1);
    }

    const attempts = await service
      .from('quiz_attempts')
      .select('id,passed,score_percent')
      .eq('user_id', userId)
      .eq('quiz_id', quizId);
    assert.equal(attempts.error, null);
    assert.equal(attempts.data.length, 1);
    assert.equal(attempts.data[0].passed, true);

    const progress = await service
      .from('lesson_progress')
      .select('is_completed,completed_at')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .single();
    assert.equal(progress.error, null);
    assert.equal(progress.data.is_completed, true);
    assert.equal(
      new Date(progress.data.completed_at).toISOString(),
      new Date(args.p_completed_at).toISOString(),
    );
  });
});

test('a repeated pass preserves the first completed_at value', async () => {
  await fixture(
    async ({ userId, lessonId, quizId }) => {
      const firstCompletedAt = '2025-01-02T03:04:05.000Z';
      const progress = await service.from('lesson_progress').insert({
        user_id: userId,
        lesson_id: lessonId,
        is_completed: true,
        completed_at: firstCompletedAt,
      });
      assert.equal(progress.error, null);

      const receipt = await callAttempt(
        attemptArgs(userId, quizId, {
          p_completed_at: '2026-09-12T12:00:00.000Z',
        }),
      );
      assert.equal(receipt.status, 'saved');
      assert.equal(receipt.progress_completed, true);

      const current = await service
        .from('lesson_progress')
        .select('is_completed,completed_at')
        .eq('user_id', userId)
        .eq('lesson_id', lessonId)
        .single();
      assert.equal(current.error, null);
      assert.equal(current.data.is_completed, true);
      assert.equal(
        new Date(current.data.completed_at).toISOString(),
        new Date(firstCompletedAt).toISOString(),
      );
    },
    { maxAttempts: 2 },
  );
});

test('a failed attempt commits without completing lesson progress', async () => {
  await fixture(
    async ({ userId, lessonId, quizId }) => {
      const receipt = await callAttempt(
        attemptArgs(userId, quizId, {
          p_score_percent: 0,
          p_passed: false,
        }),
      );
      assert.equal(receipt.status, 'saved');
      assert.equal(receipt.progress_completed, false);

      const attempts = await service
        .from('quiz_attempts')
        .select('passed')
        .eq('user_id', userId)
        .eq('quiz_id', quizId);
      assert.equal(attempts.error, null);
      assert.deepEqual(attempts.data, [{ passed: false }]);

      const progress = await service
        .from('lesson_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('lesson_id', lessonId);
      assert.equal(progress.error, null);
      assert.deepEqual(progress.data, []);
    },
    { maxAttempts: 2 },
  );
});

test('grading mismatches and unknown quizzes return stable statuses without writes', async () => {
  await fixture(async ({ userId, quizId }) => {
    const mismatch = await callAttempt(
      attemptArgs(userId, quizId, { p_score_percent: 0, p_passed: true }),
    );
    assert.equal(mismatch.status, 'invalid_submission');

    const missing = await callAttempt(attemptArgs(userId, randomUUID()));
    assert.equal(missing.status, 'quiz_unavailable');

    const attempts = await service
      .from('quiz_attempts')
      .select('id')
      .eq('user_id', userId);
    assert.equal(attempts.error, null);
    assert.deepEqual(attempts.data, []);
  });
});

test('a progress failure rolls back the attempt in the same transaction', async () => {
  await fixture(
    async ({ userId, lessonId, quizId }) => {
      const suffix = randomUUID().replaceAll('-', '');
      const functionName = `i4_reject_quiz_progress_${suffix}`;
      const triggerName = `i4_reject_quiz_progress_${suffix}`;

      await db.query('BEGIN');
      try {
        await db.query(`CREATE FUNCTION public.${functionName}()
          RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'Fictitious quiz progress failure'; END $$`);
        await db.query(`CREATE TRIGGER ${triggerName}
          BEFORE INSERT OR UPDATE ON public.lesson_progress
          FOR EACH ROW
          WHEN (NEW.user_id = '${userId}'::uuid AND NEW.lesson_id = '${lessonId}'::uuid)
          EXECUTE FUNCTION public.${functionName}()`);
        await db.query('SAVEPOINT before_attempt');

        await assert.rejects(
          db.query(
            `SELECT public.submit_quiz_attempt(
              $1::uuid,$2::uuid,$3::integer,$4::boolean,$5::jsonb,$6::timestamptz
            )`,
            [
              userId,
              quizId,
              100,
              true,
              JSON.stringify({ question: 'correct-option' }),
              '2026-09-12T12:00:00.000Z',
            ],
          ),
          /Fictitious quiz progress failure/,
        );
        await db.query('ROLLBACK TO SAVEPOINT before_attempt');

        const attemptCount = await db.query(
          'SELECT count(*)::integer AS count FROM public.quiz_attempts WHERE user_id=$1 AND quiz_id=$2',
          [userId, quizId],
        );
        const progressCount = await db.query(
          'SELECT count(*)::integer AS count FROM public.lesson_progress WHERE user_id=$1 AND lesson_id=$2',
          [userId, lessonId],
        );
        assert.equal(attemptCount.rows[0].count, 0);
        assert.equal(progressCount.rows[0].count, 0);
      } finally {
        await db.query('ROLLBACK');
      }
    },
    { maxAttempts: 2 },
  );
});

test('quiz attempt RPC is service-only with a fixed search path and exact arguments', async () => {
  const { rows } = await db.query(`SELECT p.prosecdef,p.proconfig,p.proargnames,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS member,
    has_function_privilege('service_role',p.oid,'EXECUTE') AS service,
    EXISTS(
      SELECT 1
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
    ) AS public_execute
    FROM pg_proc p
    WHERE p.oid=to_regprocedure(
      'public.submit_quiz_attempt(uuid,uuid,integer,boolean,jsonb,timestamp with time zone)'
    )`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prosecdef, true);
  assert.ok(rows[0].proconfig.includes('search_path=""'));
  assert.deepEqual(rows[0].proargnames, [
    'p_user_id',
    'p_quiz_id',
    'p_score_percent',
    'p_passed',
    'p_answers',
    'p_completed_at',
  ]);
  assert.equal(rows[0].anon, false);
  assert.equal(rows[0].member, false);
  assert.equal(rows[0].service, true);
  assert.equal(rows[0].public_execute, false);

  const denied = await anon.rpc('submit_quiz_attempt', {
    p_user_id: randomUUID(),
    p_quiz_id: randomUUID(),
    p_score_percent: 0,
    p_passed: false,
    p_answers: {},
    p_completed_at: '2026-09-12T12:00:00.000Z',
  });
  assert.ok(denied.error);
});
