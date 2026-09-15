import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getDatabaseTestStatus } from './environment.mjs';

const local = getDatabaseTestStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);

async function fixture(run) {
  const users = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `notice-${randomUUID()}@example.test`;
      const password = `Notice-${randomUUID()}-aA9!`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null);
      const user = { id: created.data.user.id, client: createClient(local.API_URL, local.ANON_KEY, options) };
      users.push(user);
      assert.equal((await user.client.auth.signInWithPassword({ email, password })).error, null);
    }
    await run(users);
  } finally {
    const errors = [];
    for (const user of users) {
      if ((await service.auth.admin.deleteUser(user.id)).error) errors.push(user.id);
    }
    assert.deepEqual(errors, [], 'Only owned notification fixture users must be removed');
  }
}

test('literal notifications remain readable and descriptors preserve their authored snapshot', async () => {
  await fixture(async ([owner]) => {
    const rows = [
      { user_id: owner.id, type: 'announcement', title: 'Authored title', message: 'Authored literal', message_key: null, message_params: null },
      { user_id: owner.id, type: 'drip_unlock', title: 'Recovery title', message: 'Recovery snapshot', message_key: 'content.dripCourse', message_params: { courseTitle: 'Authored course' } },
    ];
    const inserted = await service.from('notifications').insert(rows).select('id');
    assert.equal(inserted.error, null);
    const result = await owner.client.from('notifications').select('title,message,message_key,message_params').eq('user_id', owner.id).order('title');
    assert.equal(result.error, null);
    assert.deepEqual(result.data, rows.map(({ title, message, message_key, message_params }) => ({ title, message, message_key, message_params })));
  });
});

test('notification descriptors reject missing fields, invalid JSON shapes and invalid key lengths', async () => {
  await fixture(async ([owner]) => {
    for (const descriptor of [
      { message_key: 'content.dripCourse', message_params: null },
      { message_key: null, message_params: {} },
      { message_key: '', message_params: {} },
      { message_key: 'x'.repeat(121), message_params: {} },
      { message_key: 'content.dripCourse', message_params: [] },
      { message_key: 'content.dripCourse', message_params: 'wrong-shape' },
    ]) {
      const result = await service.from('notifications').insert({ user_id: owner.id, type: 'drip_unlock', message: 'Recovery', ...descriptor });
      assert.equal(result.error?.code, '23514');
    }
    const count = await service.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', owner.id);
    assert.equal(count.error, null);
    assert.equal(count.count, 0);
  });
});

test('notification descriptors cannot be read by another user or rewritten by their recipient', async () => {
  await fixture(async ([owner, other]) => {
    const inserted = await service.from('notifications').insert({ user_id: owner.id, type: 'drip_unlock', message: 'Recovery', message_key: 'content.dripCourse', message_params: { courseTitle: 'Owned' } }).select('id').single();
    assert.equal(inserted.error, null);
    const id = inserted.data.id;
    const hidden = await other.client.from('notifications').select('message_key,message_params').eq('id', id);
    assert.equal(hidden.error, null);
    assert.deepEqual(hidden.data, []);
    const forbidden = await owner.client.from('notifications').update({ message_key: 'forged', message_params: {} }).eq('id', id);
    assert.equal(forbidden.error?.code, '42501');
    const read = await owner.client.from('notifications').update({ is_read: true }).eq('id', id).select('is_read,message_key,message_params').single();
    assert.equal(read.error, null);
    assert.deepEqual(read.data, { is_read: true, message_key: 'content.dripCourse', message_params: { courseTitle: 'Owned' } });
  });
});
