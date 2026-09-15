import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseTestTarget } from '../database/environment.mjs';

test('database tests preserve E5 by default and require an exact pilot selection', () => {
  assert.equal(databaseTestTarget({}), 'e5');
  assert.equal(databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: 'e5' }), 'e5');
  assert.equal(databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: 'pilot' }), 'pilot');
  assert.equal(databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: 'recovery' }), 'recovery');
});

test('database target refuses unknown names and destinations instead of falling back', () => {
  for (const target of ['', 'production', 'Pilot', 'pilot ', 'http://localhost:56431', 'e5,pilot']) {
    assert.throws(() => databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: target }), /documented e5, pilot or recovery/);
  }
  assert.equal(databaseTestTarget({ DATABASE_URL: 'postgres://external.invalid/db', NEXT_PUBLIC_SUPABASE_URL: 'https://external.invalid' }), 'e5');
});
