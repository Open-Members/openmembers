import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getDatabaseTestStatus } from './environment.mjs';
import { readAllRows } from '../../core/supabase/read-all.ts';
import { STUDENT_ROLES } from '../../features/Admin/student-roles.ts';

// Uses only the runner's guarded local target and fixture-owned IDs.
const local = getDatabaseTestStatus();
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test('complete reads recover 1,001 fixture levels from the real PostgREST row cap', async () => {
  const tag = `pagination-${randomUUID()}`;
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: randomUUID(), name: tag, slug: `${tag}-${index}`,
  }));
  try {
    for (let start = 0; start < rows.length; start += 100) {
      assert.equal((await service.from('access_levels').insert(rows.slice(start, start + 100))).error, null);
    }
    const capped = await service.from('access_levels').select('id', { count: 'exact' })
      .eq('name', tag).order('id').limit(10000);
    assert.equal(capped.error, null);
    assert.equal(capped.count, 1001);
    assert.equal(capped.data.length, 1000, 'The distributed local configuration caps one REST response at 1,000 rows');
    const complete = await readAllRows((from, to) => service.from('access_levels')
      .select('id', { count: 'exact' }).eq('name', tag).order('id').range(from, to), row => row.id);
    assert.deepEqual(complete.map(row => row.id).sort(), rows.map(row => row.id).sort());
  } finally {
    const errors = [];
    for (let start = 0; start < rows.length; start += 100) {
      const result = await service.from('access_levels').delete().eq('name', tag)
        .in('id', rows.slice(start, start + 100).map(row => row.id));
      if (result.error) errors.push('Fixture level cleanup failed');
    }
    assert.deepEqual(errors, []);
  }
});

test('student counts include each profile once and exact email lookup is independent of enrollment', async () => {
  const tag = `student-count-${randomUUID()}`;
  const users = [];
  const levels = [randomUUID(), randomUUID()];
  try {
    for (let index = 0; index < 4; index++) {
      const created = await service.auth.admin.createUser({ email: `${tag}-${index}@example.test`, email_confirm: true });
      assert.equal(created.error, null);
      users.push(created.data.user);
    }
    assert.equal((await service.from('profiles').update({ status: 'suspended' }).eq('id', users[2].id)).error, null);
    assert.equal((await service.from('profiles').update({ role: 'admin' }).eq('id', users[3].id)).error, null);
    assert.equal((await service.from('access_levels').insert(levels.map((id, i) => ({ id, name: tag, slug: `${tag}-${i}` })))).error, null);
    assert.equal((await service.from('enrollments').insert([
      ...levels.map(id => ({ user_id: users[0].id, access_level_id: id, is_active: true })),
      { user_id: users[2].id, access_level_id: levels[0], expires_at: '2020-01-01T00:00:00Z', is_active: false },
    ])).error, null);
    const count = await service.from('profiles').select('id', { count: 'exact', head: true })
      .in('id', users.map(user => user.id)).in('role', STUDENT_ROLES);
    assert.equal(count.error, null);
    assert.equal(count.count, 3, 'Two enrollments, no enrollment, and an expired suspended profile still represent three students');
    const lookup = await service.rpc('get_user_id_by_email', { p_email: users[1].email.toUpperCase() });
    assert.equal(lookup.error, null);
    assert.equal(lookup.data, users[1].id);
  } finally {
    const errors = [];
    for (const user of users) {
      if ((await service.auth.admin.deleteUser(user.id)).error) errors.push('Fixture account cleanup failed');
    }
    if ((await service.from('access_levels').delete().eq('name', tag).in('id', levels)).error) errors.push('Fixture level cleanup failed');
    assert.deepEqual(errors, []);
  }
});
