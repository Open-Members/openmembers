import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseVerificationEnvironment, verifyDatabase } from '../../scripts/verify-database.mjs';

const local = { project: 'fictitious-local-development' };
const snapshot = { schemaHash: 'fictitious-schema-hash', counts: { profiles: 2 } };

function fixture(env = {}) {
  const events = [];
  const commands = [];
  const options = {
    env,
    getStatus() { events.push('status'); return local; },
    exec(node, args, options) {
      events.push(args[0] === '--test' ? 'contracts' : args[0]);
      commands.push({ node, args, options });
    },
    async verifyAdmin(status, run) {
      assert.equal(status, local);
      events.push('admin');
      run('scripts/create-admin.mjs', ['first-admin@example.test'], {
        OPENMEMBERS_ADMIN_PASSWORD: 'fictitious-admin-password',
      });
    },
    async takeSnapshot(status) {
      assert.equal(status, local);
      events.push('snapshot');
      return structuredClone(snapshot);
    },
    readTests() { events.push('read-tests'); return ['first.test.mjs', 'environment.mjs', 'second.test.mjs']; },
    saveEvidence(results) {
      events.push('save');
      assert.deepEqual(results, [snapshot, snapshot]);
    },
    log() {},
  };
  return { options, events, commands };
}

test('verification accepts an absent or exact development target without changing the caller environment', () => {
  for (const target of [undefined, 'development']) {
    const env = Object.freeze({
      ...(target === undefined ? {} : { OPENMEMBERS_DATABASE_TEST_TARGET: target }),
      SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', SUPABASE_ACCESS_TOKEN: '',
      PATH: '/fictitious/toolchain',
    });
    assert.deepEqual(databaseVerificationEnvironment(env), {
      ...env, OPENMEMBERS_DATABASE_TEST_TARGET: 'development',
    });
    assert.equal(env.OPENMEMBERS_DATABASE_TEST_TARGET, target);
  }
});

test('non-development targets are rejected before services, commands, account provisioning or filesystem work', async t => {
  for (const target of ['e5', 'E5', 'pilot', 'recovery', 'production', '', 'Development', 'development ', ' development', 'http://localhost:55431']) {
    const spies = Object.fromEntries([
      'getStatus', 'exec', 'verifyAdmin', 'takeSnapshot', 'readTests', 'saveEvidence', 'log',
    ].map(name => [name, t.mock.fn(() => { throw new Error(`Unexpected ${name}`); })]));
    await assert.rejects(
      verifyDatabase({ env: { OPENMEMBERS_DATABASE_TEST_TARGET: target }, ...spies }),
      /db:verify only supports the development target.*use db:test for pilot\/recovery/,
    );
    for (const [name, spy] of Object.entries(spies)) {
      assert.equal(spy.mock.callCount(), 0, `${target}: ${name} must not run`);
    }
  }
});

test('both clean installations validate the local guard first and pin every child to development', async () => {
  for (const target of [undefined, 'development']) {
    const env = { OPENMEMBERS_DATABASE_TEST_TARGET: target, DO_NOT_TRACK: '1' };
    const { options, events, commands } = fixture(env);
    assert.deepEqual(await verifyDatabase(options), [snapshot, snapshot]);
    const iteration = [
      'scripts/local-db.mjs', 'status', 'admin', 'scripts/create-admin.mjs',
      'scripts/seed-demo.mjs', 'scripts/seed-demo.mjs', 'read-tests', 'contracts', 'snapshot',
    ];
    assert.deepEqual(events, ['status', ...iteration, ...iteration, 'save']);
    assert.equal(commands.length, 10);
    for (const command of commands) {
      assert.equal(command.node, process.execPath);
      assert.equal(command.options.env.OPENMEMBERS_DATABASE_TEST_TARGET, 'development');
      assert.equal(command.options.env.DO_NOT_TRACK, '1');
      assert.equal(command.options.stdio, 'inherit');
      if (command.args[0] === 'scripts/create-admin.mjs') {
        assert.equal(command.options.env.OPENMEMBERS_ADMIN_PASSWORD, 'fictitious-admin-password');
      } else assert.equal(command.options.env.OPENMEMBERS_ADMIN_PASSWORD, undefined);
    }
    assert.deepEqual(commands.filter(command => command.args[0] === '--test').map(command => command.args), [
      ['--test', 'tests/database/first.test.mjs', 'tests/database/second.test.mjs'],
      ['--test', 'tests/database/first.test.mjs', 'tests/database/second.test.mjs'],
    ]);
    assert.equal(env.OPENMEMBERS_DATABASE_TEST_TARGET, target);
  }
});

test('a changed caller environment or per-command override cannot switch an accepted run to pilot', async () => {
  const env = {};
  const { options, commands } = fixture(env);
  options.verifyAdmin = async (_local, run) => {
    env.OPENMEMBERS_DATABASE_TEST_TARGET = 'pilot';
    run('scripts/create-admin.mjs', ['first-admin@example.test'], {
      OPENMEMBERS_DATABASE_TEST_TARGET: 'recovery',
      OPENMEMBERS_ADMIN_PASSWORD: 'fictitious-admin-password',
    });
  };
  await verifyDatabase(options);
  assert.equal(env.OPENMEMBERS_DATABASE_TEST_TARGET, 'pilot');
  assert.equal(commands.length, 10);
  for (const command of commands) assert.equal(command.options.env.OPENMEMBERS_DATABASE_TEST_TARGET, 'development');
});

test('a failed socket or project guard stops before reset and evidence', async () => {
  const { options, events, commands } = fixture();
  options.getStatus = () => {
    events.push('status');
    throw new Error('Local project guard refused the target.');
  };
  await assert.rejects(verifyDatabase(options), /Local project guard refused/);
  assert.deepEqual(events, ['status']);
  assert.deepEqual(commands, []);
});

test('a failed contract run cannot continue to snapshot, a second reset or a success receipt', async () => {
  const { options, events, commands } = fixture();
  const exec = options.exec;
  options.exec = (...args) => {
    exec(...args);
    if (args[1][0] === '--test') throw new Error('Fixture contracts failed.');
  };
  await assert.rejects(verifyDatabase(options), /Fixture contracts failed/);
  assert.equal(commands.filter(command => command.args.includes('reset')).length, 1);
  assert.equal(events.includes('snapshot'), false);
  assert.equal(events.includes('save'), false);
});

test('different schema or fixture counts cannot create a reproducibility success receipt', async () => {
  for (const difference of [{ schemaHash: 'different-hash' }, { counts: { profiles: 3 } }]) {
    const { options, events } = fixture();
    let count = 0;
    options.takeSnapshot = async () => ++count === 1 ? snapshot : { ...snapshot, ...difference };
    await assert.rejects(verifyDatabase(options), /Clean installations must have equivalent schema and seed state/);
    assert.equal(events.includes('save'), false);
  }
});
