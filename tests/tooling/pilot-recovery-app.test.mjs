import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {
  RECOVERY_APP_ACTIONS, RECOVERY_APP_PROJECT, RECOVERY_APP_SERVICE,
  prepareRecoveryApplicationFiles, readRecoveryApplicationFiles,
  recoveryBuildArgs, recoveryComposeArgs, recoveryComposeEnv, recoveryComposeFile,
  runRecoveryCompose, validateRecoveryApplicationEnv,
} from '../../scripts/pilot-recovery-app.mjs';

const status = {
  API_URL: 'http://127.0.0.1:57431',
  DB_URL: 'postgresql://postgres:fictitious@127.0.0.1:57432/postgres',
  INBUCKET_URL: 'http://127.0.0.1:57434',
  ANON_KEY: 'restored.anon.key',
  SERVICE_ROLE_KEY: 'restored.service.key',
};
const sha256 = value => createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'openmembers-recovery-app-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const backup = path.join(root, 'backup');
  mkdirSync(backup);
  const artifacts = {
    'roles.sql': '-- fictitious roles\n',
    'schema.sql': '-- fictitious schema\n',
    'data.sql': '-- fictitious data\n',
    'installation.json': '{"name":"Fictitious restored brand"}\r\n',
    'application.env': `NEXT_PUBLIC_SITE_URL=http://localhost:3201\nSUPABASE_SERVICE_ROLE_KEY=source-only-key\nCRON_SECRET=${'a'.repeat(64)}\n`,
    'migration-manifest.json': '{"schemaVersion":1}\n',
  };
  const manifest = {
    schemaVersion: 1, source: 'openmembers-e6-pilot', target: 'openmembers-e6-restore',
    tables: [], migrations: [], buckets: [], objects: [],
    files: Object.entries(artifacts).map(([file, contents]) => ({ file, sha256: sha256(contents) })),
  };
  for (const [file, contents] of Object.entries(artifacts)) writeFileSync(path.join(backup, file), contents, { mode: 0o600 });
  writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
  return { root, backup, artifacts, manifest };
}

function assertNoOutputs(root) {
  assert.equal(existsSync(path.join(root, 'application.env')), false);
  assert.equal(existsSync(path.join(root, 'installation.json')), false);
}

test('restored application fixes the Compose namespace, files and permitted actions', () => {
  assert.equal(RECOVERY_APP_PROJECT, 'openmembers-e6-restore-app');
  assert.equal(RECOVERY_APP_SERVICE, 'restore-app');
  assert.deepEqual(RECOVERY_APP_ACTIONS, ['prepare', 'preflight', 'start', 'status']);
  const args = recoveryComposeArgs('config', '--quiet');
  assert.deepEqual(args.slice(0, 4), ['compose', '-p', RECOVERY_APP_PROJECT, '--env-file']);
  assert.match(args[4], /\.private\/e6-recovery\/application\.env$/u);
  assert.equal(args[5], '-f');
  assert.equal(args[6], recoveryComposeFile);
  assert.deepEqual(args.slice(7), ['config', '--quiet']);
  for (const action of ['stop', 'down', 'restart', 'reset', 'seed', 'db-start']) assert.equal(RECOVERY_APP_ACTIONS.includes(action), false);
});

test('prepare verifies backup bytes and creates only presentation plus fresh destination environment', t => {
  const { root, backup, artifacts } = fixture(t);
  const prepared = prepareRecoveryApplicationFiles(status, { root });
  assert.equal(readFileSync(prepared.presentationPath, 'utf8'), artifacts['installation.json']);
  assert.equal(prepared.presentationSha256, sha256(artifacts['installation.json']));
  assert.equal(lstatSync(prepared.presentationPath).mode & 0o777, 0o644);
  assert.equal(lstatSync(prepared.envPath).mode & 0o777, 0o600);
  assert.equal(prepared.values.NEXT_PUBLIC_SUPABASE_ANON_KEY, status.ANON_KEY);
  assert.equal(prepared.values.SUPABASE_SERVICE_ROLE_KEY, status.SERVICE_ROLE_KEY);
  assert.equal(prepared.values.NEXT_PUBLIC_SITE_URL, 'http://localhost:3301');
  assert.equal(prepared.values.SUPABASE_INTERNAL_URL, 'http://host.docker.internal:57431');
  assert.equal(prepared.values.MAILPIT_URL, 'http://host.docker.internal:57434');
  assert.equal(prepared.values.OAUTH_PROVIDERS, '');
  assert.match(prepared.values.CRON_SECRET, /^[a-f0-9]{64}$/u);
  assert.notEqual(prepared.values.CRON_SECRET, 'a'.repeat(64));
  assert.doesNotMatch(readFileSync(prepared.envPath, 'utf8'), /source-only-key|3201|5643[0-9]/u);
  for (const [file, contents] of Object.entries(artifacts)) assert.equal(readFileSync(path.join(backup, file), 'utf8'), contents);
  const repeated = prepareRecoveryApplicationFiles(status, { root });
  assert.deepEqual(repeated, prepared);
  assert.deepEqual(readRecoveryApplicationFiles(status, { root }), prepared);
});

test('missing and modified backup artifacts refuse before any application output', t => {
  const { root, backup, manifest } = fixture(t);
  writeFileSync(path.join(backup, 'roles.sql'), 'tampered roles');
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /checksum/u);
  assertNoOutputs(root);
  manifest.files = manifest.files.filter(item => item.file !== 'roles.sql');
  writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /canonical artifact/u);
  assertNoOutputs(root);
});

test('invalid presentation is refused even when its backup checksum matches', t => {
  const { root, backup, manifest } = fixture(t);
  const presentation = '[]';
  writeFileSync(path.join(backup, 'installation.json'), presentation);
  manifest.files.find(item => item.file === 'installation.json').sha256 = sha256(presentation);
  writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /JSON object/u);
  assertNoOutputs(root);
});

test('recovery source, pilot, remote or incomplete status is rejected before outputs', t => {
  const { root } = fixture(t);
  for (const altered of [
    { ...status, API_URL: 'http://127.0.0.1:56431' },
    { ...status, DB_URL: 'postgresql://postgres:fictitious@127.0.0.1:55432/postgres' },
    { ...status, API_URL: 'https://client.example.test:57431' },
    { ...status, INBUCKET_URL: 'http://127.0.0.1:56434' },
    { ...status, ANON_KEY: '' },
  ]) {
    assert.throws(() => prepareRecoveryApplicationFiles(altered, { root }));
    assertNoOutputs(root);
  }
});

test('runtime validation rejects mixed credentials, origins, providers and weak secrets', t => {
  const { root } = fixture(t);
  const { values } = prepareRecoveryApplicationFiles(status, { root });
  for (const changed of [
    { NEXT_PUBLIC_SITE_URL: 'http://localhost:3201' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56431' },
    { SUPABASE_INTERNAL_URL: 'http://host.docker.internal:56431' },
    { MAILPIT_URL: 'http://host.docker.internal:56434' },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'source.anon.key' },
    { SUPABASE_SERVICE_ROLE_KEY: 'source.service.key' },
    { OAUTH_PROVIDERS: 'google' },
    { RESEND_API_KEY: 'fictitious-provider' },
    { CRON_SECRET: 'short' },
  ]) assert.throws(() => validateRecoveryApplicationEnv({ ...values, ...changed }, status), /Recovery application/u);
});

test('existing invalid environment prevents even a missing presentation from being created', t => {
  const { root } = fixture(t);
  const envPath = path.join(root, 'application.env');
  const sentinel = 'SUPABASE_SERVICE_ROLE_KEY=do-not-overwrite\n';
  writeFileSync(envPath, sentinel, { mode: 0o600 });
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /unexpected keys/u);
  assert.equal(readFileSync(envPath, 'utf8'), sentinel);
  assert.equal(existsSync(path.join(root, 'installation.json')), false);
});

test('presentation mismatch prevents a missing environment from being created', t => {
  const { root } = fixture(t);
  const presentationPath = path.join(root, 'installation.json');
  writeFileSync(presentationPath, '{"sentinel":true}', { mode: 0o644 });
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /differs/u);
  assert.equal(readFileSync(presentationPath, 'utf8'), '{"sentinel":true}');
  assert.equal(existsSync(path.join(root, 'application.env')), false);
});

test('existing permissions and duplicate environment fields are refused without repair', t => {
  const { root } = fixture(t);
  const prepared = prepareRecoveryApplicationFiles(status, { root });
  const original = readFileSync(prepared.envPath, 'utf8');
  chmodSync(prepared.envPath, 0o644);
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /0600/u);
  assert.equal(lstatSync(prepared.envPath).mode & 0o777, 0o644);
  chmodSync(prepared.envPath, 0o600);
  chmodSync(prepared.presentationPath, 0o600);
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /0644/u);
  assert.equal(lstatSync(prepared.presentationPath).mode & 0o777, 0o600);
  chmodSync(prepared.presentationPath, 0o644);
  writeFileSync(prepared.envPath, `${original}OAUTH_PROVIDERS=\n`);
  assert.throws(() => readRecoveryApplicationFiles(status, { root }), /syntax/u);
  assert.equal(readFileSync(prepared.envPath, 'utf8'), `${original}OAUTH_PROVIDERS=\n`);
});

test('preflight file reads never prepare missing configuration', t => {
  const { root } = fixture(t);
  assert.throws(() => readRecoveryApplicationFiles(status, { root }), /Prepare/u);
  assertNoOutputs(root);
});

test('live and dangling output symlinks are refused without writing to external targets', async t => {
  for (const file of ['application.env', 'installation.json']) {
    for (const dangling of [false, true]) {
      await t.test(`${file}: ${dangling ? 'dangling' : 'live'}`, child => {
        const { root } = fixture(child);
        const outside = path.join(root, 'outside');
        mkdirSync(outside);
        const sentinel = path.join(outside, 'sentinel');
        if (!dangling) writeFileSync(sentinel, 'unchanged');
        symlinkSync(sentinel, path.join(root, file));
        assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /symlinks/u);
        if (dangling) assert.equal(existsSync(sentinel), false);
        else assert.equal(readFileSync(sentinel, 'utf8'), 'unchanged');
        assert.equal(existsSync(path.join(root, file === 'application.env' ? 'installation.json' : 'application.env')), false);
      });
    }
  }
});

test('symlinked roots, ancestors and backup inputs cannot bypass path validation', t => {
  const { root, backup } = fixture(t);
  const rootAlias = path.join(root, 'alias');
  symlinkSync(root, rootAlias);
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root: rootAlias }), /symlinks/u);
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root: path.join(rootAlias, 'new/nested') }), /symlinks/u);
  const roles = path.join(backup, 'roles.sql');
  const sentinel = path.join(root, 'sentinel');
  writeFileSync(sentinel, '-- fictitious roles\n');
  rmSync(roles);
  symlinkSync(sentinel, roles);
  assert.throws(() => prepareRecoveryApplicationFiles(status, { root }), /symlinks/u);
  assert.equal(readFileSync(sentinel, 'utf8'), '-- fictitious roles\n');
  assertNoOutputs(root);
});

test('Compose environment removes inherited source destinations and provider secrets', t => {
  const { root } = fixture(t);
  const { values } = prepareRecoveryApplicationFiles(status, { root });
  const env = recoveryComposeEnv(values, {
    PATH: '/usr/bin', DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_CONTEXT: 'remote-client',
    COMPOSE_PROJECT_NAME: 'client', COMPOSE_FILE: 'client.yaml',
    OPENMEMBERS_CONFIG_FILE: 'client.json', NEXT_PUBLIC_SUPABASE_URL: 'https://client.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'client-service-key', STRIPE_SECRET_KEY: 'client-stripe-key',
    RESEND_API_KEY: 'client-resend-key', AUTH_ALLOWED_ORIGINS: 'https://client.example.test',
    BUILDKIT_HOST: 'tcp://remote-builder.example.test:1234', BUILDX_BUILDER: 'cloud-client',
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.DOCKER_HOST, 'unix:///var/run/docker.sock');
  assert.equal(env.COMPOSE_PROJECT_NAME, RECOVERY_APP_PROJECT);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, status.SERVICE_ROLE_KEY);
  assert.equal(env.SUPABASE_ACCESS_TOKEN, '');
  for (const key of ['DOCKER_CONTEXT', 'COMPOSE_FILE', 'OPENMEMBERS_CONFIG_FILE', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'AUTH_ALLOWED_ORIGINS', 'BUILDKIT_HOST', 'BUILDX_BUILDER']) assert.equal(env[key], undefined);
});

test('recovery build fixes the local default builder and rejects remote builder selection', () => {
  const local = { DOCKER_HOST: 'unix:///var/run/docker.sock' };
  assert.deepEqual(recoveryBuildArgs(local), ['build', '--builder', 'default', RECOVERY_APP_SERVICE]);
  assert.throws(
    () => recoveryBuildArgs({ ...local, BUILDX_BUILDER: 'cloud-client' }),
    /Unset BUILDX_BUILDER/u,
  );
  assert.throws(
    () => recoveryBuildArgs({ ...local, BUILDKIT_HOST: 'tcp://remote-builder.example.test:1234' }),
    /Unset BUILDKIT_HOST/u,
  );
});

test('every Compose invocation rejects remote Docker hosts and explicit contexts before spawning', t => {
  let spawned = 0;
  t.mock.method(childProcess, 'execFileSync', () => { spawned++; throw new Error('Unexpected process spawn'); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.throws(() => runRecoveryCompose(['config', '--quiet'], {}, { inherited: { DOCKER_HOST: 'ssh://remote.example.test' } }), /local Unix Docker socket/u);
  assert.throws(() => runRecoveryCompose(['config', '--quiet'], {}, { inherited: { DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_CONTEXT: 'remote' } }), /Unset DOCKER_CONTEXT/u);
  assert.equal(spawned, 0);
});

test('Compose defines only the exclusive restore application and read-only presentation mount', () => {
  const compose = readFileSync(recoveryComposeFile, 'utf8');
  assert.match(compose, /^name: openmembers-e6-restore-app$/mu);
  assert.match(compose, /image: openmembers:e6-local-restore/u);
  assert.match(compose, /container_name: openmembers-e6-restore-app/u);
  assert.match(compose, /"127\.0\.0\.1:3301:3000"/u);
  assert.match(compose, /http:\/\/host\.docker\.internal:57431/u);
  assert.match(compose, /source: \.\.\/\.private\/e6-recovery\/installation\.json/u);
  assert.match(compose, /read_only: true/u);
  assert.match(compose, /create_host_path: false/u);
  assert.match(compose, /name: openmembers-e6-restore-app-network/u);
  assert.doesNotMatch(compose, /5543[0-9]|5643[0-9]|3101|3201|docker\.sock|privileged: true/u);
});
