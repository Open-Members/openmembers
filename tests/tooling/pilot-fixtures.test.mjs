import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionEmptyPilot } from '../../scripts/pilot-fixtures.mjs';

function database({ occupied = '', acquired = true, tableCount = 47 } = {}) {
  const calls = [];
  return { calls, async query(sql) {
    calls.push(sql);
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired }] };
    if (sql.includes('pg_advisory_unlock')) return { rows: [{}] };
    if (sql.includes('pg_class')) return { rows: Array.from({ length: tableCount }, (_, i) => ({ relname: `table_${i}` })) };
    return { rows: [{ occupied: occupied !== '' && sql.includes(occupied) }] };
  } };
}

test('empty pilot is provisioned once and lock is released', async () => {
  const db = database();
  let writes = 0;
  await provisionEmptyPilot(db, async () => { writes += 1; });
  assert.equal(writes, 1);
  assert.equal(db.calls.filter(sql => sql.startsWith('select exists')).length, 49);
  assert.match(db.calls.at(-1), /pg_advisory_unlock/u);
});

for (const occupied of ['auth.users', 'storage.objects', 'public."table_46"']) {
  test(`refuses existing ${occupied} before any write`, async () => {
    const db = database({ occupied });
    await assert.rejects(provisionEmptyPilot(db, async () => assert.fail('must not provision')), /already contains/u);
    assert.match(db.calls.at(-1), /pg_advisory_unlock/u);
  });
}

test('schema mismatch and concurrent invocation refuse writes', async () => {
  await assert.rejects(provisionEmptyPilot(database({ tableCount: 46 }), async () => assert.fail('must not provision')), /47-table/u);
  const db = database({ acquired: false });
  await assert.rejects(provisionEmptyPilot(db, async () => assert.fail('must not provision')), /Another pilot/u);
  assert.equal(db.calls.length, 1);
});

test('provisioning failure releases lock without retry or reset', async () => {
  const db = database();
  await assert.rejects(provisionEmptyPilot(db, async () => { throw new Error('partial provisioning'); }), /partial provisioning/u);
  assert.match(db.calls.at(-1), /pg_advisory_unlock/u);
  assert.ok(db.calls.every(sql => sql.startsWith('select ')));
});
