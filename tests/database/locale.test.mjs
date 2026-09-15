import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getDatabaseTestStatus } from './environment.mjs';

const local = getDatabaseTestStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const anon = createClient(local.API_URL, local.ANON_KEY, options);
const users = [];

before(async () => {
  for (let index = 0; index < 2; index++) {
    const email = `locale-${randomUUID()}@example.test`;
    const password = `Locale-${randomUUID()}-aA9!`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null);
    const user = { id: created.data.user.id, client: createClient(local.API_URL, local.ANON_KEY, options) };
    users.push(user);
    assert.equal((await user.client.auth.signInWithPassword({ email, password })).error, null);
  }
});

after(async () => {
  const errors = [];
  for (const user of users) {
    if ((await service.auth.admin.deleteUser(user.id)).error) errors.push(user.id);
  }
  assert.deepEqual(errors, [], 'Only this test’s fixture accounts must be cleaned up');
});

test('a new profile has no forced language and can save each supported locale', async () => {
  const own = users[0];
  const initial = await own.client.from('profiles').select('preferred_locale').eq('id', own.id).single();
  assert.equal(initial.error, null);
  assert.equal(initial.data.preferred_locale, null);
  for (const locale of ['pt', 'es', 'en']) {
    const result = await own.client.from('profiles').update({ preferred_locale: locale }).eq('id', own.id).select('preferred_locale').single();
    assert.equal(result.error, null);
    assert.equal(result.data.preferred_locale, locale);
  }
});

test('a profile cannot save an unsupported locale', async () => {
  const result = await users[0].client.from('profiles').update({ preferred_locale: 'de' }).eq('id', users[0].id);
  assert.equal(result.error?.code, '23514');
});

test('students and administrators cannot set another account’s language', async () => {
  for (const role of ['user', 'admin']) {
    assert.equal((await service.from('profiles').update({ role }).eq('id', users[0].id)).error, null);
    const result = await users[0].client.from('profiles').update({ preferred_locale: 'es' }).eq('id', users[1].id).select('id');
    assert.equal(result.error, null);
    assert.deepEqual(result.data, []);
  }
  const other = await service.from('profiles').select('preferred_locale').eq('id', users[1].id).single();
  assert.equal(other.error, null);
  assert.equal(other.data.preferred_locale, null);
});

test('locale grant does not allow privileged profile fields or anonymous updates', async () => {
  for (const payload of [{ role: 'super_admin' }, { status: 'active' }, { must_change_password: false }]) {
    assert.ok((await users[0].client.from('profiles').update(payload).eq('id', users[0].id)).error);
  }
  const result = await anon.from('profiles').update({ preferred_locale: 'pt' }).eq('id', users[0].id);
  assert.ok(result.error);
});

test('suspended accounts cannot update preferences through REST', async () => {
  assert.equal((await service.from('profiles').update({ status: 'suspended' }).eq('id', users[1].id)).error, null);
  const result = await users[1].client.from('profiles').update({ preferred_locale: 'pt' }).eq('id', users[1].id).select('id');
  assert.equal(result.error, null);
  assert.deepEqual(result.data, []);
});
