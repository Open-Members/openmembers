import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  PILOT_ACTIONS,
  PILOT_PORTS,
  PILOT_PROJECT_ID,
  assertLocalDockerSocket,
  ensurePilotApplicationFiles,
  pilotCliArgs,
  pilotCliEnvironment,
  preparePilotLayout,
  runSupabase,
  validatePilotConfig,
  validatePilotStatus,
  verifyPreparedPilot,
} from '../../scripts/local-pilot.mjs';

const template = readFileSync(
  new URL('../../deploy/local-pilot/supabase.config.toml', import.meta.url),
  'utf8',
);
const compose = readFileSync(
  new URL('../../deploy/compose.local-pilot.yaml', import.meta.url),
  'utf8',
);

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'openmembers-pilot-'));
  const migrationsDir = path.join(root, 'canonical');
  const configTemplate = path.join(root, 'template.toml');
  mkdirSync(migrationsDir);
  writeFileSync(configTemplate, template);
  writeFileSync(
    path.join(migrationsDir, '20260913000100_fixture.sql'),
    'select 1;\n',
  );
  t.after(() => import('node:fs').then(({ rmSync }) =>
    rmSync(root, { recursive: true, force: true }),
  ));
  return { root: path.join(root, 'private'), migrationsDir, configTemplate };
}

test('tracked pilot config has its own exact identity, ports and Auth origin', () => {
  assert.equal(validatePilotConfig(template), true);
  assert.equal(PILOT_PROJECT_ID, 'openmembers-e6-pilot');
  assert.deepEqual(PILOT_PORTS, {
    shadow: 56430,
    api: 56431,
    database: 56432,
    mailpit: 56434,
    application: 3201,
  });
  for (const developmentPort of ['55430', '55431', '55432', '55434']) {
    assert.equal(template.includes(developmentPort), false);
  }
});

test('pilot config rejects development identity, ports and redirect destinations', () => {
  for (const changed of [
    template.replace('openmembers-e6-pilot', 'openmembers'),
    template.replace('56431', '55431'),
    template.replace('56432', '55432'),
    template.replace('56430', '55430'),
    template.replace('56434', '55434'),
    template.replace(
      'additional_redirect_urls = ["http://localhost:3201/**"]',
      'additional_redirect_urls = ["http://localhost:3101/**"]',
    ),
  ]) assert.throws(() => validatePilotConfig(changed), /Pilot config|development port/);
});

test('pilot Compose fixes private inputs and keeps an isolated namespace', () => {
  assert.match(compose, /name: openmembers-e6-pilot-app/);
  assert.match(compose, /pilot-app:\n\s+image: openmembers:e6-local-pilot/);
  assert.match(compose, /container_name: openmembers-e6-pilot-app/);
  assert.match(compose, /127\.0\.0\.1:3201:3000/);
  assert.match(compose, /\.\.\/\.private\/e6-local-pilot\/application\.env/);
  assert.match(compose, /\.\.\/\.private\/e6-local-pilot\/installation\.json/);
  assert.doesNotMatch(compose, /OPENMEMBERS_PILOT_(?:ENV_FILE|CONFIG_PATH)/);
  assert.doesNotMatch(compose, /(?:^|[^0-9])5543[0124](?:[^0-9]|$)/);
});

test('prepare copies exact migrations, records hashes and verifies the workdir', t => {
  const options = fixture(t);
  const prepared = preparePilotLayout(options);
  assert.equal(prepared.migrationCount, 1);
  assert.deepEqual(verifyPreparedPilot(options), { migrationCount: 1 });
  const manifest = JSON.parse(readFileSync(prepared.manifestPath, 'utf8'));
  assert.equal(manifest.projectId, PILOT_PROJECT_ID);
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    readFileSync(
      path.join(prepared.workdir, manifest.files[0].path),
      'utf8',
    ),
    'select 1;\n',
  );
});

test('prepare refuses changed or unexpected files instead of overwriting them', t => {
  const options = fixture(t);
  const prepared = preparePilotLayout(options);
  const targetMigrations = path.join(prepared.workdir, 'supabase/migrations');
  writeFileSync(
    path.join(targetMigrations, '20260913000100_fixture.sql'),
    'select private_data;\n',
  );
  assert.throws(() => preparePilotLayout(options), /differs from the canonical/);
  writeFileSync(
    path.join(targetMigrations, '20260913000100_fixture.sql'),
    'select 1;\n',
  );
  writeFileSync(
    path.join(targetMigrations, '20260913000200_unexpected.sql'),
    'select 2;\n',
  );
  assert.throws(() => preparePilotLayout(options), /Unexpected prepared migration/);
});

test('prepare rejects migration names or symlinks outside the canonical set', t => {
  const options = fixture(t);
  writeFileSync(
    path.join(options.migrationsDir, '20260913000200-extra.sql'),
    'select 2;\n',
  );
  assert.throws(() => preparePilotLayout(options), /Unexpected migration entry/);

  const second = fixture(t);
  symlinkSync(
    path.join(second.migrationsDir, '20260913000100_fixture.sql'),
    path.join(second.migrationsDir, '20260913000200_link.sql'),
  );
  assert.throws(() => preparePilotLayout(second), /Unexpected migration entry/);
});

test('prepare rejects linked root and ancestor directories before creating anything outside', t => {
  for (const ancestor of [false, true]) {
    const options = fixture(t);
    const outside = path.join(path.dirname(options.root), 'outside');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'sentinel'), 'preserve outside');
    if (ancestor) {
      const redirected = path.join(path.dirname(options.root), 'redirected');
      symlinkSync(outside, redirected);
      options.root = path.join(redirected, 'pilot');
    } else symlinkSync(outside, options.root);
    assert.throws(() => preparePilotLayout(options), /symlink|unsafe path/);
    assert.deepEqual(readdirSync(outside), ['sentinel']);
    assert.equal(readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'preserve outside');
  }
});

for (const target of ['workdir/supabase/config.toml', 'installation.json', 'migration-manifest.json']) {
  test(`prepare refuses live and broken ${target} links without creating or changing external files`, t => {
    for (const dangling of [false, true]) {
      const options = fixture(t);
      const outside = path.join(path.dirname(options.root), 'external-file');
      if (!dangling) writeFileSync(outside, 'preserve outside');
      const destination = path.join(options.root, target);
      mkdirSync(path.dirname(destination), { recursive: true });
      symlinkSync(outside, destination);
      assert.throws(() => preparePilotLayout(options), /symlink|unsafe path/);
      if (dangling) assert.equal(existsSync(outside), false);
      else assert.equal(readFileSync(outside, 'utf8'), 'preserve outside');
      assert.equal(lstatSync(destination).isSymbolicLink(), true);
    }
  });
}

test('prepare refuses a changed existing manifest without overwriting its bytes', t => {
  const options = fixture(t);
  const { manifestPath } = preparePilotLayout(options);
  const preserved = '{"unexpected":"preserve evidence"}\n';
  writeFileSync(manifestPath, preserved);
  assert.throws(() => preparePilotLayout(options), /manifest differs/);
  assert.equal(readFileSync(manifestPath, 'utf8'), preserved);
});

test('status accepts only the pilot loopback endpoints and never returns keys', () => {
  const status = {
    API_URL: 'http://127.0.0.1:56431',
    DB_URL: 'postgresql://postgres:secret@127.0.0.1:56432/postgres',
    INBUCKET_URL: 'http://localhost:56434',
    ANON_KEY: 'fictitious-anon-key',
    SERVICE_ROLE_KEY: 'fictitious-service-key',
  };
  const safe = validatePilotStatus(status);
  assert.deepEqual(safe, {
    projectId: PILOT_PROJECT_ID,
    apiPort: 56431,
    databasePort: 56432,
    mailpitPort: 56434,
    credentialsAvailable: true,
  });
  assert.equal(JSON.stringify(safe).includes('fictitious'), false);
  for (const [field, value] of [
    ['API_URL', 'http://127.0.0.1:55431'],
    ['DB_URL', 'postgresql://postgres:secret@127.0.0.1:55432/postgres'],
    ['INBUCKET_URL', 'http://service.example.test:56434'],
  ]) {
    assert.throws(
      () => validatePilotStatus({ ...status, [field]: value }),
      /Refusing unexpected/,
    );
  }
});

test('runtime preparation writes a strict private environment without external providers', t => {
  const options = fixture(t);
  preparePilotLayout(options);
  const status = {
    API_URL: 'http://127.0.0.1:56431',
    DB_URL: 'postgresql://postgres:secret@127.0.0.1:56432/postgres',
    INBUCKET_URL: 'http://127.0.0.1:56434',
    ANON_KEY: 'fictitious-anon-key',
    SERVICE_ROLE_KEY: 'fictitious-service-key',
  };
  const first = ensurePilotApplicationFiles(status, options);
  const firstText = readFileSync(first.envPath, 'utf8');
  const second = ensurePilotApplicationFiles(status, options);

  assert.equal(lstatSync(first.envPath).mode & 0o077, 0);
  assert.equal(readFileSync(second.envPath, 'utf8'), firstText);
  assert.equal(first.values.NEXT_PUBLIC_SUPABASE_ANON_KEY, status.ANON_KEY);
  assert.equal(first.values.SUPABASE_SERVICE_ROLE_KEY, status.SERVICE_ROLE_KEY);
  assert.equal(first.values.EMAIL_TRANSPORT, 'mailpit');
  assert.equal(first.values.MAILPIT_URL, 'http://host.docker.internal:56434');
  assert.equal(first.values.OPENMEMBERS_INTERNAL_URL, 'http://127.0.0.1:3000');
  assert.match(first.values.CRON_SECRET, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(firstText, /STRIPE|RESEND|BREVO|R2_|SENTRY|AI_GATEWAY/);

  writeFileSync(first.envPath, `${firstText}STRIPE_SECRET_KEY=private\n`, {
    mode: 0o600,
  });
  assert.throws(
    () => ensurePilotApplicationFiles(status, options),
    /unexpected keys/,
  );
});

test('runtime environment refuses live and broken links without writing external credential files', t => {
  const status = {
    API_URL: 'http://127.0.0.1:56431',
    DB_URL: 'postgresql://postgres:secret@127.0.0.1:56432/postgres',
    INBUCKET_URL: 'http://127.0.0.1:56434',
    ANON_KEY: 'fictitious-anon-key',
    SERVICE_ROLE_KEY: 'fictitious-service-key',
  };
  for (const dangling of [false, true]) {
    const options = fixture(t);
    preparePilotLayout(options);
    const outside = path.join(path.dirname(options.root), 'external-env');
    if (!dangling) writeFileSync(outside, 'preserve outside');
    symlinkSync(outside, path.join(options.root, 'application.env'));
    assert.throws(() => ensurePilotApplicationFiles(status, options), /symlink|unsafe path/);
    if (dangling) assert.equal(existsSync(outside), false);
    else assert.equal(readFileSync(outside, 'utf8'), 'preserve outside');
  }
});

test('runtime validation rejects an ancestor symlink before creating an environment', t => {
  const options = fixture(t);
  preparePilotLayout(options);
  const redirected = path.join(path.dirname(options.root), 'redirected');
  symlinkSync(path.dirname(options.root), redirected);
  assert.throws(() => ensurePilotApplicationFiles({}, {
    ...options, root: path.join(redirected, path.basename(options.root)),
  }), /symlink|unsafe path/);
  assert.equal(existsSync(path.join(options.root, 'application.env')), false);
});

test('CLI contract always carries the isolated workdir and exposes no destructive action', () => {
  assert.deepEqual(PILOT_ACTIONS, ['prepare', 'preflight', 'start', 'status']);
  for (const forbidden of ['stop', 'reset', 'restart', 'link', 'seed']) {
    assert.equal(PILOT_ACTIONS.includes(forbidden), false);
  }
  const args = pilotCliArgs('status', '--output', 'json');
  assert.equal(args[0], '--workdir');
  assert.match(args[1], /\.private\/e6-local-pilot\/workdir$/);
  assert.deepEqual(args.slice(2), ['status', '--output', 'json']);

  const env = pilotCliEnvironment({
    PATH: '/usr/bin',
    DOCKER_HOST: 'unix:///var/run/docker.sock',
    DOCKER_CONTEXT: 'remote-client',
    COMPOSE_PROJECT_NAME: 'openmembers',
    SUPABASE_INTERNAL_URL: 'http://client.invalid',
    STRIPE_SECRET_KEY: 'client-key',
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.DOCKER_HOST, 'unix:///var/run/docker.sock');
  assert.equal(env.DOCKER_CONTEXT, undefined);
  assert.equal(env.COMPOSE_PROJECT_NAME, undefined);
  assert.equal(env.SUPABASE_INTERNAL_URL, undefined);
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
  assert.equal(env.SUPABASE_ACCESS_TOKEN, '');
});

test('Docker guard rejects an explicit context even with a local-looking host', () => {
  assert.throws(
    () => assertLocalDockerSocket({
      DOCKER_HOST: 'unix:///var/run/docker.sock',
      DOCKER_CONTEXT: 'remote-client',
    }),
    /Unset DOCKER_CONTEXT/,
  );
  assert.doesNotThrow(() => assertLocalDockerSocket({
    DOCKER_HOST: 'unix:///var/run/docker.sock',
  }));
  assert.throws(
    () => assertLocalDockerSocket({ DOCKER_HOST: 'ssh://remote.example.test' }),
    /local Unix Docker socket/,
  );
});

test('every Supabase command refuses a remote host or explicit context before spawning a process', t => {
  const previousHost = process.env.DOCKER_HOST;
  const previousContext = process.env.DOCKER_CONTEXT;
  let spawned = 0;
  t.mock.method(childProcess, 'execFileSync', () => {
    spawned++;
    throw new Error('Unexpected process spawn');
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    if (previousHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = previousHost;
    if (previousContext === undefined) delete process.env.DOCKER_CONTEXT;
    else process.env.DOCKER_CONTEXT = previousContext;
  });
  delete process.env.DOCKER_CONTEXT;
  process.env.DOCKER_HOST = 'ssh://remote.example.test';
  assert.throws(() => runSupabase(['status', '--output', 'json']), /local Unix Docker socket/);
  process.env.DOCKER_HOST = 'unix:///var/run/docker.sock';
  process.env.DOCKER_CONTEXT = 'remote-client';
  assert.throws(() => runSupabase(['status', '--output', 'json']), /Unset DOCKER_CONTEXT/);
  assert.equal(spawned, 0);
});
