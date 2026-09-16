import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseTestTarget } from '../database/environment.mjs';

test('database tests default to development and require exact target names', () => {
  assert.equal(databaseTestTarget({}), 'development');
  assert.equal(databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: 'development' }), 'development');
  assert.equal(databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: 'pilot' }), 'pilot');
  assert.equal(databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: 'recovery' }), 'recovery');
});

test('database target refuses unknown names and destinations instead of falling back', () => {
  for (const target of ['', 'e5', 'E5', 'production', 'Development', 'development ', ' development', 'Pilot', 'pilot ', 'http://localhost:56431', 'development,pilot']) {
    assert.throws(() => databaseTestTarget({ OPENMEMBERS_DATABASE_TEST_TARGET: target }), /documented development, pilot or recovery/);
  }
  assert.equal(databaseTestTarget({ DATABASE_URL: 'postgres://external.invalid/db', NEXT_PUBLIC_SUPABASE_URL: 'https://external.invalid' }), 'development');
});
