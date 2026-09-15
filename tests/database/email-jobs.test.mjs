import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getDatabaseTestStatus } from './environment.mjs';

// The helper refuses remote or unexpected local services before fixture creation.
const local = getDatabaseTestStatus();
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

test('scheduled notifications are unique per user and event while ordinary notifications remain unrestricted', async () => {
  const created = await service.auth.admin.createUser({ email: `email-job-${randomUUID()}@example.test`, email_confirm: true });
  assert.equal(created.error, null);
  const userId = created.data.user.id;
  try {
    const notice = { user_id: userId, type: 'drip_unlock', title: 'Fixture unlock', message: 'Fictitious content is available.', message_key: 'content.dripCourse', message_params: { courseTitle: 'Fixture course' }, dedupe_key: `fixture/${randomUUID()}` };
    const results = await Promise.all([1, 2].map(() => service.from('notifications').upsert(notice, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }).select('id')));
    for (const result of results) assert.equal(result.error, null);
    const stored = await service.from('notifications').select('id').eq('user_id', userId).eq('dedupe_key', notice.dedupe_key);
    assert.equal(stored.error, null); assert.equal(stored.data.length, 1);
    const descriptor = await service.from('notifications').select('message_key,message_params').eq('id', stored.data[0].id).single();
    assert.equal(descriptor.error, null);
    assert.deepEqual(descriptor.data, { message_key: notice.message_key, message_params: notice.message_params });
    const ordinary = await service.from('notifications').insert([1, 2].map(() => ({ ...notice, dedupe_key: null }))).select('id');
    assert.equal(ordinary.error, null); assert.equal(ordinary.data.length, 2);
    const invalid = await service.from('notifications').insert({ ...notice, message_params: null, dedupe_key: `invalid/${randomUUID()}` });
    assert.ok(invalid.error, 'A descriptor key without object parameters must be rejected');
  } finally { assert.equal((await service.auth.admin.deleteUser(userId)).error, null); }
});

test('repeated signed-provider event identity conflicts atomically in email_events', async () => {
  const id = randomUUID();
  const event = { id, provider: 'resend', event_type: 'delivered', email: 'fixture@example.test', message_id: 'fixture-message', raw: { fictitious: true }, occurred_at: new Date().toISOString() };
  try {
    const results = await Promise.all([1, 2].map(() => service.from('email_events').insert(event)));
    assert.equal(results.filter(result => !result.error).length, 1);
    assert.equal(results.filter(result => result.error?.code === '23505').length, 1);
  } finally { assert.equal((await service.from('email_events').delete().eq('id', id)).error, null); }
});
