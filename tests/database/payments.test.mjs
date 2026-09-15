import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { getDatabaseTestStatus } from './environment.mjs';
const local = getDatabaseTestStatus(); // Refuses production/remote hosts and unexpected ports.
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, opts);
const anon = createClient(local.API_URL, local.ANON_KEY, opts);
const db = new pg.Client({ connectionString: local.DB_URL });
before(async () => db.connect()); after(async () => db.end());
const rpc = async (name, args) => { const result = await service.rpc(name, args); assert.equal(result.error, null, name); return result.data; };
async function fixture(run) {
  const tag = `payment-${randomUUID()}`; const level = randomUUID();
  const user = await service.auth.admin.createUser({ email: `${tag}@example.test`, password: `Fixture-${randomUUID()}-Aa9!`, email_confirm: true });
  assert.equal(user.error, null);
  const userId = user.data.user.id;
  try {
    assert.equal((await service.from('access_levels').insert({ id: level, name: 'Payment fixture', slug: tag })).error, null);
    await run({ tag, level, userId, args: { p_provider: 'generic', p_transaction_id: tag, p_user_id: userId, p_access_level_id: level, p_product_id: 'demo-product', p_expires_at: '2027-01-01T00:00:00Z', p_mapping_id: null } });
  } finally {
    const cleanup = await Promise.all([service.auth.admin.deleteUser(userId), service.from('processed_webhook_events').delete().eq('external_event_id', tag)]);
    for (const result of cleanup) assert.equal(result.error, null);
    assert.equal((await service.from('access_levels').delete().eq('id', level)).error, null);
  }
}

test('payment claims serialize delivery and reject stale owners while allowing expired lease recovery', async () => {
  await fixture(async ({ tag }) => {
    const args = { p_provider: 'generic', p_event_id: tag, p_event_type: 'purchase', p_token: randomUUID() };
    const other = { ...args, p_token: randomUUID() };
    const states = await Promise.all([rpc('claim_webhook_event', args), rpc('claim_webhook_event', other)]);
    assert.deepEqual(states.slice().sort(), ['busy', 'claimed']);
    const owner = states[0] === 'claimed' ? args : other;
    const loser = states[0] === 'claimed' ? other : args;
    assert.equal(await rpc('finish_webhook_event', { p_provider: 'generic', p_event_id: tag, p_token: loser.p_token, p_success: true }), false);
    await db.query("UPDATE public.processed_webhook_events SET lease_until=now()-interval '1 second' WHERE external_event_id=$1", [tag]);
    assert.equal(await rpc('claim_webhook_event', loser), 'claimed');
    assert.equal(await rpc('finish_webhook_event', { p_provider: 'generic', p_event_id: tag, p_token: owner.p_token, p_success: true }), false);
    assert.equal(await rpc('finish_webhook_event', { p_provider: 'generic', p_event_id: tag, p_token: loser.p_token, p_success: false }), true);
    assert.equal(await rpc('claim_webhook_event', owner), 'claimed');
    assert.equal(await rpc('finish_webhook_event', { p_provider: 'generic', p_event_id: tag, p_token: owner.p_token, p_success: true }), true);
    assert.equal(await rpc('claim_webhook_event', loser), 'processed');
  });
});

test('concurrent purchase application creates one receipt and replay never extends or resurrects access', async () => {
  await fixture(async ({ args }) => {
    const receipts = await Promise.all([rpc('apply_payment_enrollment', args), rpc('apply_payment_enrollment', args)]);
    assert.deepEqual(receipts.map(r => r.duplicate).sort(), [false, true]);
    assert.equal(receipts[0].enrollment_id, receipts[1].enrollment_id);
    const enrollmentId = receipts[0].enrollment_id;
    await db.query("UPDATE public.enrollments SET is_active=false,revocation_reason='refund',revoked_at=now() WHERE id=$1", [enrollmentId]);
    assert.equal((await rpc('apply_payment_enrollment', { ...args, p_expires_at: '2030-01-01T00:00:00Z' })).duplicate, true);
    const { rows } = await db.query('SELECT expires_at,is_active,revocation_reason FROM public.enrollments WHERE id=$1', [enrollmentId]);
    assert.equal(rows[0].expires_at.toISOString(), '2027-01-01T00:00:00.000Z'); assert.equal(rows[0].is_active, false); assert.equal(rows[0].revocation_reason, 'refund');
  });
});

test('refund records a definitive reason after cron expiration and renewal cannot reactivate it', async () => {
  await fixture(async ({ args }) => {
    const enrolled = await rpc('apply_payment_enrollment', args);
    await db.query('UPDATE public.enrollments SET is_active=false WHERE id=$1', [enrolled.enrollment_id]);
    const mutation = { p_provider: args.p_provider, p_transaction_id: args.p_transaction_id, p_kind: 'revoke', p_expires_at: null, p_reason: 'refund' };
    assert.equal((await rpc('mutate_payment_enrollment', mutation)).found, true);
    await rpc('mutate_payment_enrollment', { ...mutation, p_kind: 'renew', p_expires_at: '2028-01-01T00:00:00Z', p_reason: null });
    const { rows } = await db.query('SELECT is_active,revocation_reason FROM public.enrollments WHERE id=$1', [enrolled.enrollment_id]);
    assert.deepEqual(rows[0], { is_active: false, revocation_reason: 'refund' });
  });
});

test('parallel renewals and older cancellation preserve the greatest granted period', async () => {
  await fixture(async ({ args }) => {
    const enrolled = await rpc('apply_payment_enrollment', args);
    const mutation = { p_provider: args.p_provider, p_transaction_id: args.p_transaction_id, p_kind: 'renew', p_reason: null };
    await Promise.all(['2028-01-01T00:00:00Z', '2029-01-01T00:00:00Z'].map(p_expires_at => rpc('mutate_payment_enrollment', { ...mutation, p_expires_at })));
    await rpc('mutate_payment_enrollment', { ...mutation, p_kind: 'expire', p_expires_at: '2027-06-01T00:00:00Z' });
    const { rows } = await db.query('SELECT expires_at FROM public.enrollments WHERE id=$1', [enrolled.enrollment_id]);
    assert.equal(rows[0].expires_at.toISOString(), '2029-01-01T00:00:00.000Z');
  });
});

test('payment RPCs and receipts reject anonymous and authenticated access', async () => {
  const signatures = [
    'public.claim_webhook_event(text,text,text,uuid)', 'public.finish_webhook_event(text,text,uuid,boolean)',
    'public.apply_payment_enrollment(text,text,uuid,uuid,text,timestamp with time zone,uuid)',
    'public.mutate_payment_enrollment(text,text,text,timestamp with time zone,text)',
  ];
  for (const signature of signatures) {
    const { rows } = await db.query(`SELECT has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS member,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service,
      p.prosecdef,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure($1)`, [signature]);
    assert.equal(rows.length, 1); assert.equal(rows[0].anon, false); assert.equal(rows[0].member, false); assert.equal(rows[0].service, true);
    assert.equal(rows[0].prosecdef, true); assert.ok(rows[0].proconfig.includes('search_path=""'));
  }
  assert.equal((await anon.from('webhook_enrollment_receipts').select('*')).error?.code, '42501');
});
