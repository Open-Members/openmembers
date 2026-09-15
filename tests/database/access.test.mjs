import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { getDatabaseTestStatus } from './environment.mjs';
import { demoUsers, demoPassword, ids } from '../../scripts/demo-fixtures.mjs';

const local = getDatabaseTestStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const anon = createClient(local.API_URL, local.ANON_KEY, options);
const db = new pg.Client({ connectionString: local.DB_URL });
const sessions = new Map();
const createdUsers = [];

before(async () => {
  await db.connect();
  for (const user of demoUsers) {
    const client = createClient(local.API_URL, local.ANON_KEY, options);
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: demoPassword });
    assert.equal(error, null, `Demo sign-in failed for ${user.name}`);
    sessions.set(user.email.split('@')[0], client);
  }
});
after(async () => {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  await admin.from('lesson_progress').delete().eq('lesson_id', ids.lesson);
  await admin.from('lesson_comments').delete().eq('lesson_id', ids.lesson);
  await db.end();
});

const student = () => sessions.get('student');
async function lessonIds(client) {
  const { data, error } = await client.from('lessons').select('id,text_content').eq('module_id', ids.module);
  assert.equal(error, null);
  return data.map(row => row.id).sort();
}

test('every application table enables RLS and the schema contract exists', async () => {
  const { rows } = await db.query("select relname, relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' order by relname");
  assert.equal(rows.length, 47);
  assert.deepEqual(rows.filter(row => !row.relrowsecurity), []);
  const buckets = await admin.storage.listBuckets();
  assert.equal(buckets.error, null);
  assert.equal(buckets.data.find(b => b.id === 'lesson-materials')?.public, false);
  assert.equal(buckets.data.find(b => b.id === 'avatars')?.public, true);
  assert.equal(buckets.data.find(b => b.id === 'platform-assets')?.public, true);
});

test('anonymous requests cannot read lesson bodies or profiles', async () => {
  const lessons = await anon.from('lessons').select('id,text_content');
  assert.ok(lessons.error || lessons.data.length === 0);
  const profiles = await anon.from('profiles').select('id,email');
  assert.ok(profiles.error || profiles.data.length === 0);
});

test('student reads released lessons; visitor and expired member only read preview', async () => {
  assert.deepEqual(await lessonIds(student()), [ids.lesson, ids.previewLesson].sort());
  assert.deepEqual(await lessonIds(sessions.get('visitor')), [ids.previewLesson]);
  assert.deepEqual(await lessonIds(sessions.get('expired')), [ids.previewLesson]);
  assert.deepEqual(await lessonIds(sessions.get('suspended')), []);
  assert.deepEqual(await lessonIds(sessions.get('admin')), [ids.lesson, ids.lockedLesson, ids.draftLesson, ids.previewLesson].sort());
});

test('access RPCs fail closed for missing, locked and unauthorized content', async () => {
  for (const [client, lessonId, allowed] of [[student(), ids.lesson, true], [student(), ids.lockedLesson, false], [student(), ids.draftLesson, false], [student(), randomUUID(), false], [sessions.get('visitor'), ids.lesson, false], [sessions.get('suspended'), ids.previewLesson, false]]) {
    const { data, error } = await client.rpc('can_access_lesson', { p_lesson_id: lessonId });
    assert.equal(error, null);
    assert.equal(data, allowed);
  }
});

test('profile role, status and password flags cannot be changed by students or staff over REST', async () => {
  for (const client of [student(), sessions.get('staff')]) {
    for (const payload of [{ role: 'super_admin' }, { status: 'active' }, { must_change_password: false }]) {
      const { error } = await client.from('profiles').update(payload).eq('id', demoUsers[1].id);
      assert.ok(error, 'Privileged profile field must be denied');
    }
  }
  const result = await student().from('profiles').update({ display_name: 'Demo Student' }).eq('id', demoUsers[1].id).select('id');
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1);
});

test('a student cannot read another profile or grant an enrollment', async () => {
  const profiles = await student().from('profiles').select('id,email').neq('id', demoUsers[1].id);
  assert.equal(profiles.error, null);
  assert.deepEqual(profiles.data, []);
  const grant = await sessions.get('visitor').from('enrollments').insert({ user_id: demoUsers[2].id, access_level_id: ids.level, source: 'manual' });
  assert.ok(grant.error);
});

test('signup creates a regular profile even when metadata asks for privileges', async () => {
  const email = `signup-${randomUUID()}@example.test`;
  const { data, error } = await anon.auth.signUp({ email, password: demoPassword, options: { data: { display_name: 'Signup fixture', role: 'super_admin', status: 'active', must_change_password: false } } });
  assert.equal(error, null);
  assert.ok(data.user);
  createdUsers.push(data.user.id);
  assert.equal(data.session, null, 'Local email confirmation must be enabled');
  const profile = await admin.from('profiles').select('id,role,status,display_name').eq('id', data.user.id).single();
  assert.equal(profile.error, null);
  assert.equal(profile.data.role, 'user');
  assert.equal(profile.data.status, 'active');
  assert.equal(profile.data.display_name, 'Signup fixture');
});

test('progress requires the caller, a valid enrollment and a released lesson', async () => {
  const own = await student().from('lesson_progress').upsert({ user_id: demoUsers[1].id, lesson_id: ids.lesson, is_completed: true }, { onConflict: 'user_id,lesson_id' }).select('user_id');
  assert.equal(own.error, null);
  assert.equal(own.data.length, 1);
  for (const [client, userId, lessonId] of [[student(), demoUsers[2].id, ids.lesson], [student(), demoUsers[1].id, ids.lockedLesson], [sessions.get('visitor'), demoUsers[2].id, ids.lesson]]) {
    const result = await client.from('lesson_progress').upsert({ user_id: userId, lesson_id: lessonId, is_completed: true }, { onConflict: 'user_id,lesson_id' });
    assert.ok(result.error);
  }
});

test('comments cannot be forged for another user or pinned by students', async () => {
  const own = await student().from('lesson_comments').insert({ lesson_id: ids.lesson, user_id: demoUsers[1].id, content: 'A fictitious test comment.' }).select('id').single();
  assert.equal(own.error, null);
  const forged = await student().from('lesson_comments').insert({ lesson_id: ids.lesson, user_id: demoUsers[2].id, content: 'Forged author.' });
  assert.ok(forged.error);
  const pinned = await student().from('lesson_comments').update({ is_pinned: true }).eq('id', own.data.id);
  assert.ok(pinned.error);
});

test('secrets, internal support notes, quiz answers and email lookup are not public APIs', async () => {
  for (const table of ['webhook_configs', 'webhook_logs', 'email_templates', 'email_logs', 'quiz_options', 'quiz_questions']) {
    const result = await student().from(table).select('*');
    assert.ok(result.error || result.data.length === 0, table);
  }
  const notes = await student().from('support_tickets').select('admin_note');
  assert.ok(notes.error);
  const lookup = await student().rpc('get_user_id_by_email', { p_email: demoUsers[0].email });
  assert.ok(lookup.error);
  const privilege = await db.query("select has_function_privilege('anon', 'public.get_user_id_by_email(text)', 'execute') as exposed");
  assert.equal(privilege.rows[0].exposed, false);
});

test('private material cannot be downloaded or signed directly with a student token', async () => {
  const path = `lessons/${ids.lesson}/demo-notes.txt`;
  for (const client of [anon, student(), sessions.get('visitor')]) {
    assert.ok((await client.storage.from('lesson-materials').download(path)).error);
    assert.ok((await client.storage.from('lesson-materials').createSignedUrl(path, 60)).error);
  }
  const allowed = await admin.storage.from('lesson-materials').download(path);
  assert.equal(allowed.error, null);
  assert.match(await allowed.data.text(), /Private Open Members demo attachment/);
});

test('students cannot upload platform assets or another user avatar', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  assert.ok((await student().storage.from('platform-assets').upload('branding/forbidden.png', bytes, { contentType: 'image/png', upsert: true })).error);
  assert.ok((await student().storage.from('avatars').upload(`${demoUsers[0].id}.png`, bytes, { contentType: 'image/png', upsert: true })).error);
  const ownPath = `${demoUsers[1].id}.png`;
  const own = await student().storage.from('avatars').upload(ownPath, bytes, { contentType: 'image/png', upsert: true });
  assert.equal(own.error, null);
  await admin.storage.from('avatars').remove([ownPath]);
});
