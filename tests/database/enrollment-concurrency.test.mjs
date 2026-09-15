import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { getDatabaseTestStatus } from './environment.mjs';

const local = getDatabaseTestStatus();
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const manualSql = 'SELECT public.apply_manual_enrollment($1,$2,$3,$4,$5,$6,$7::jsonb) AS result';
const paymentSql = 'SELECT public.apply_payment_enrollment($1,$2,$3,$4,$5,$6,$7) AS result';

async function fixture(run) {
  const tag = `interleave-${randomUUID()}`;
  const ids = Object.fromEntries(['level', 'course', 'manualCohort', 'paidCohort', 'nextCohort', 'config', 'mapping'].map(key => [key, randomUUID()]));
  const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString: local.DB_URL, statement_timeout: 10_000, connectionTimeoutMillis: 5000 }));
  const connected = new Set();
  const [observer, first, second] = clients;
  let userId;
  try {
    for (const client of clients) {
      await client.connect();
      connected.add(client);
    }
    const created = await service.auth.admin.createUser({ email: `${tag}@example.test`, email_confirm: true });
    assert.equal(created.error, null);
    userId = created.data.user.id;
    await observer.query('INSERT INTO public.courses(id,title,slug) VALUES($1,$2,$2)', [ids.course, tag]);
    await observer.query('INSERT INTO public.access_levels(id,name,slug) VALUES($1,$2,$2)', [ids.level, tag]);
    await observer.query('INSERT INTO public.access_level_courses(access_level_id,course_id) VALUES($1,$2)', [ids.level, ids.course]);
    for (const key of ['manualCohort', 'paidCohort', 'nextCohort']) {
      await observer.query('INSERT INTO public.cohorts(id,course_id,name,slug) VALUES($1,$2,$3,$3)', [ids[key], ids.course, key]);
    }
    await observer.query("INSERT INTO public.webhook_configs(id,provider,name,secret_key,is_active) VALUES($1,'generic',$2,'fictitious-inactive',false)", [ids.config, tag]);
    await observer.query('INSERT INTO public.webhook_product_mappings(id,webhook_config_id,external_product_id,access_level_id) VALUES($1,$2,$3,$4)', [ids.mapping, ids.config, tag, ids.level]);
    await observer.query('INSERT INTO public.webhook_product_mapping_cohorts(mapping_id,course_id,cohort_id) VALUES($1,$2,$3)', [ids.mapping, ids.course, ids.paidCohort]);
    const manual = [userId, ids.level, 'manual', null, '2028-01-01T00:00:00Z', 'replace', JSON.stringify([{ course_id: ids.course, cohort_id: ids.manualCohort }])];
    const payment = ['generic', tag, userId, ids.level, tag, '2029-01-01T00:00:00Z', ids.mapping];
    await observer.query(manualSql, manual);
    const snapshot = async () => {
      const rows = (await observer.query('SELECT id,source,source_transaction_id,expires_at FROM public.enrollments WHERE user_id=$1 AND access_level_id=$2', [userId, ids.level])).rows;
      assert.equal(rows.length, 1);
      const cohorts = (await observer.query('SELECT cohort_id FROM public.enrollment_cohorts WHERE enrollment_id=$1', [rows[0].id])).rows;
      assert.equal(cohorts.length, 1);
      const receipts = (await observer.query('SELECT enrollment_id FROM public.webhook_enrollment_receipts WHERE provider=$1 AND transaction_id=$2', ['generic', tag])).rows;
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].enrollment_id, rows[0].id);
      return { ...rows[0], cohort: cohorts[0].cohort_id };
    };
    await run({ ids, observer, first, second, manual, payment, snapshot });
  } finally {
    // Roll back locks before cleanup even when a concurrent assertion fails.
    try {
      await Promise.allSettled([first, second].filter(client => connected.has(client)).map(client => client.query('ROLLBACK')));
      if (userId) {
        const cleanup = await Promise.allSettled([
          service.auth.admin.deleteUser(userId).then(result => assert.equal(result.error, null)),
          observer.query('DELETE FROM public.webhook_configs WHERE id=$1', [ids.config]),
        ]);
        // Other independent cleanup still runs if either deletion above fails.
        cleanup.push(...await Promise.allSettled([
          observer.query('DELETE FROM public.access_levels WHERE id=$1', [ids.level]),
          observer.query('DELETE FROM public.courses WHERE id=$1', [ids.course]),
        ]));
        assert.deepEqual(cleanup.filter(result => result.status === 'rejected'), []);
      }
    } finally {
      await Promise.allSettled(clients.map(client => client.end()));
    }
  }
}

async function waitUntilBlocked(observer, first, second) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await observer.query('SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS blocked', [first.processID, second.processID]);
    if (rows[0].blocked) return;
    await delay(20);
  }
  assert.fail('Second grant never waited for the first transaction');
}

for (const order of ['manual-first', 'payment-first']) {
  test(`manual and payment grants serialize one enrollment with ${order}`, async () => {
    await fixture(async ({ ids, observer, first, second, manual, payment, snapshot }) => {
      const manualFirst = order === 'manual-first';
      await first.query('BEGIN');
      await first.query(manualFirst ? manualSql : paymentSql, manualFirst ? manual : payment);
      const pending = second.query(manualFirst ? paymentSql : manualSql, manualFirst ? payment : manual);
      // Observe both branches immediately so failures do not become unhandled rejections.
      const completion = pending.then(value => ({ value }), error => ({ error }));
      await waitUntilBlocked(observer, first, second);
      await first.query('COMMIT');
      const result = await completion;
      assert.equal(result.error, undefined);
      const state = await snapshot();
      assert.equal(state.source, manualFirst ? 'generic' : 'manual');
      assert.equal(state.source_transaction_id, manualFirst ? payment[1] : null);
      assert.equal(state.cohort, manualFirst ? ids.paidCohort : ids.manualCohort);
      assert.equal(state.expires_at.toISOString(), manualFirst ? '2029-01-01T00:00:00.000Z' : '2028-01-01T00:00:00.000Z');
      assert.equal((await observer.query(paymentSql, payment)).rows[0].result.duplicate, true);
      assert.deepEqual(await snapshot(), state);
    });
  });
}

test('payment reads the committed cohort mapping after waiting for the enrollment row', async () => {
  await fixture(async ({ ids, observer, first, second, payment, snapshot }) => {
    await first.query('BEGIN');
    await first.query('SELECT id FROM public.enrollments WHERE user_id=$1 AND access_level_id=$2 FOR UPDATE', [payment[2], ids.level]);
    const completion = second.query(paymentSql, payment).then(value => ({ value }), error => ({ error }));
    await waitUntilBlocked(observer, first, second);
    await observer.query('UPDATE public.webhook_product_mapping_cohorts SET cohort_id=$1 WHERE mapping_id=$2 AND course_id=$3', [ids.nextCohort, ids.mapping, ids.course]);
    await first.query('COMMIT');
    const result = await completion;
    assert.equal(result.error, undefined);
    assert.equal((await snapshot()).cohort, ids.nextCohort);
  });
});
