import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PILOT_APP_ACTIONS,
  PILOT_COMPOSE_PROJECT,
  PILOT_COMPOSE_SERVICE,
  localComposeBuildArgs,
  pilotComposeArgs,
  pilotComposeEnv,
} from '../../scripts/local-pilot-app.mjs';

const values = {
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3201',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56431',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fictitious-pilot-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fictitious-pilot-service',
  SUPABASE_INTERNAL_URL: 'http://host.docker.internal:56431',
  OPENMEMBERS_INTERNAL_URL: 'http://127.0.0.1:3000',
  CRON_SECRET: 'a'.repeat(64),
  EMAIL_TRANSPORT: 'mailpit',
  MAILPIT_URL: 'http://host.docker.internal:56434',
  COURSE_CHAT_ENABLED: 'false',
  OAUTH_PROVIDERS: '',
};

test('application runner fixes the Compose project and private files', () => {
  const args = pilotComposeArgs('config', '--quiet');
  assert.deepEqual(PILOT_APP_ACTIONS, ['preflight', 'start', 'status']);
  assert.equal(PILOT_COMPOSE_SERVICE, 'pilot-app');
  assert.deepEqual(args.slice(0, 4), [
    'compose',
    '-p',
    PILOT_COMPOSE_PROJECT,
    '--env-file',
  ]);
  assert.match(args[4], /\.private\/e6-local-pilot\/application\.env$/);
  assert.equal(args[5], '-f');
  assert.match(args[6], /deploy\/compose\.local-pilot\.yaml$/);
  assert.deepEqual(args.slice(7), ['config', '--quiet']);
  for (const forbidden of ['down', 'stop', 'restart', 'rm']) {
    assert.equal(PILOT_APP_ACTIONS.includes(forbidden), false);
  }
});

test('application runner replaces inherited project, destinations and providers', () => {
  const env = pilotComposeEnv(values, {
    PATH: '/usr/bin',
    DOCKER_HOST: 'unix:///var/run/docker.sock',
    DOCKER_CONTEXT: 'remote-client',
    COMPOSE_PROJECT_NAME: 'openmembers',
    COMPOSE_FILE: 'deploy/compose.yaml',
    OPENMEMBERS_PILOT_IMAGE: 'client-image:latest',
    NEXT_PUBLIC_SUPABASE_URL: 'https://client-database.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'client-service-role',
    STRIPE_SECRET_KEY: 'client-stripe-key',
    RESEND_API_KEY: 'client-resend-key',
    BUILDKIT_HOST: 'tcp://remote-builder.example.test:1234',
    BUILDX_BUILDER: 'cloud-client',
  });

  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.DOCKER_HOST, 'unix:///var/run/docker.sock');
  assert.equal(env.DOCKER_CONTEXT, undefined);
  assert.equal(env.COMPOSE_PROJECT_NAME, PILOT_COMPOSE_PROJECT);
  assert.equal(env.COMPOSE_FILE, undefined);
  assert.equal(env.OPENMEMBERS_PILOT_IMAGE, undefined);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, values.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(
    env.SUPABASE_SERVICE_ROLE_KEY,
    values.SUPABASE_SERVICE_ROLE_KEY,
  );
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
  assert.equal(env.RESEND_API_KEY, undefined);
  assert.equal(env.BUILDKIT_HOST, undefined);
  assert.equal(env.BUILDX_BUILDER, undefined);
});

test('application build fixes the local default builder and refuses inherited overrides', () => {
  const local = { DOCKER_HOST: 'unix:///var/run/docker.sock' };
  assert.deepEqual(localComposeBuildArgs(PILOT_COMPOSE_SERVICE, local), [
    'build', '--builder', 'default', PILOT_COMPOSE_SERVICE,
  ]);
  for (const [key, value] of [
    ['BUILDKIT_HOST', 'tcp://remote-builder.example.test:1234'],
    ['BUILDX_BUILDER', 'cloud-client'],
  ]) {
    assert.throws(
      () => localComposeBuildArgs(PILOT_COMPOSE_SERVICE, { ...local, [key]: value }),
      new RegExp(`Unset ${key}`, 'u'),
    );
  }
});
