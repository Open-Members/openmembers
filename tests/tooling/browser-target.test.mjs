import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBrowserTestEnvironment,
  browserTestTarget,
} from '../../e2e/fixtures/test-target.mjs';
import { localBrowserContext } from '../../e2e/fixtures/database-context.mjs';
import {
  pilotBrowserArgs,
  pilotBrowserArgsFor,
  pilotI4Environment,
  pilotBrowserEnvironment,
} from '../../scripts/pilot-browser.mjs';

const origins = {
  e5: {
    appOrigin: 'http://localhost:3101',
    apiOrigin: 'http://127.0.0.1:55431',
    mailboxOrigin: 'http://127.0.0.1:55434',
  },
  pilot: {
    appOrigin: 'http://localhost:3201',
    apiOrigin: 'http://127.0.0.1:56431',
    mailboxOrigin: 'http://127.0.0.1:56434',
  },
};

function guardedEnvironment(name) {
  const target = origins[name];
  return {
    OPENMEMBERS_LOCAL_BROWSER_TEST: '1',
    ...(name === 'pilot' ? { OPENMEMBERS_BROWSER_TEST_TARGET: 'pilot' } : {}),
    NEXT_PUBLIC_SITE_URL: target.appOrigin,
    NEXT_PUBLIC_SUPABASE_URL: target.apiOrigin,
    EMAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: target.mailboxOrigin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: `${name}-anon.key_1`,
    SUPABASE_SERVICE_ROLE_KEY: `${name}-service.key_1`,
  };
}

const testIdentity = {
  testId: 'browser-target-test',
  projectName: 'chromium',
  retry: 0,
  repeatEachIndex: 0,
};

test('browser targets preserve E5 by default and select only the exact pilot name', () => {
  assert.deepEqual(browserTestTarget({}), { name: 'e5', ...origins.e5 });
  assert.deepEqual(
    browserTestTarget({ OPENMEMBERS_BROWSER_TEST_TARGET: 'e5' }),
    { name: 'e5', ...origins.e5 },
  );
  assert.deepEqual(
    browserTestTarget({ OPENMEMBERS_BROWSER_TEST_TARGET: 'pilot' }),
    { name: 'pilot', ...origins.pilot },
  );
  for (const target of [
    '',
    'production',
    'Pilot',
    'pilot ',
    'http://localhost:3201',
    'e5,pilot',
  ]) {
    assert.throws(
      () => browserTestTarget({ OPENMEMBERS_BROWSER_TEST_TARGET: target }),
      /documented e5 or pilot target/,
    );
  }
});

test('browser identity accepts complete targets and routes only their app origin', () => {
  for (const name of ['e5', 'pilot']) {
    const env = guardedEnvironment(name);
    const target = assertBrowserTestEnvironment(env, origins[name].appOrigin);
    assert.equal(target.name, name);
    const context = localBrowserContext(env, testIdentity, target.appOrigin);
    assert.match(context.headers['x-forwarded-for'], /^2001:db8:/u);
    assert.equal(context.headers['x-real-ip'], context.headers['x-forwarded-for']);
    assert.equal(context.matchesUrl(new URL(`${target.appOrigin}/login`)), true);
    assert.equal(
      context.matchesUrl(new URL(name === 'e5' ? origins.pilot.appOrigin : origins.e5.appOrigin)),
      false,
    );
  }
});

test('browser identity refuses remote, incomplete and mixed target environments', () => {
  const e5 = guardedEnvironment('e5');
  const invalid = [
    { ...e5, OPENMEMBERS_LOCAL_BROWSER_TEST: '' },
    { ...e5, NEXT_PUBLIC_SITE_URL: origins.pilot.appOrigin },
    { ...e5, NEXT_PUBLIC_SUPABASE_URL: origins.pilot.apiOrigin },
    { ...e5, NEXT_PUBLIC_SITE_URL: 'https://members.example.test' },
    { ...e5, NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' },
    { ...e5, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' },
    { ...e5, SUPABASE_SERVICE_ROLE_KEY: 'invalid key' },
  ];
  for (const env of invalid) {
    assert.throws(
      () => assertBrowserTestEnvironment(env, origins.e5.appOrigin),
      /guarded Open Members local test runner/,
    );
  }
  assert.throws(
    () => assertBrowserTestEnvironment(e5, origins.pilot.appOrigin),
    /guarded Open Members local test runner/,
  );
  assert.throws(
    () => assertBrowserTestEnvironment(
      { ...guardedEnvironment('pilot'), NEXT_PUBLIC_SUPABASE_URL: origins.e5.apiOrigin },
      origins.pilot.appOrigin,
    ),
    /guarded Open Members local test runner/,
  );
});

test('pilot browser environment sanitizes inherited configuration and uses runtime values', () => {
  const status = {
    API_URL: origins.pilot.apiOrigin,
    DB_URL: 'postgresql://postgres:fixture@127.0.0.1:56432/postgres',
    INBUCKET_URL: origins.pilot.mailboxOrigin,
    ANON_KEY: 'pilot-anon.key_1',
    SERVICE_ROLE_KEY: 'pilot-service.key_1',
  };
  const env = pilotBrowserEnvironment(status, {
    PATH: '/fixture/bin',
    DOCKER_HOST: 'unix:///fixture/docker.sock',
    DOCKER_CONTEXT: 'remote',
    OPENMEMBERS_BROWSER_TEST_TARGET: 'e5',
    NEXT_PUBLIC_SITE_URL: 'https://customer.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://customer.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'customer-public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'customer-service-key',
    DATABASE_URL: 'postgresql://customer.example.test/database',
    RESEND_API_KEY: 'customer-email-key',
  });
  assert.equal(env.PATH, '/fixture/bin');
  assert.equal(env.DOCKER_HOST, 'unix:///fixture/docker.sock');
  assert.equal(env.DOCKER_CONTEXT, undefined);
  assert.equal(env.OPENMEMBERS_BROWSER_TEST_TARGET, 'pilot');
  assert.equal(env.OPENMEMBERS_LOCAL_BROWSER_TEST, '1');
  assert.equal(env.NEXT_PUBLIC_SITE_URL, origins.pilot.appOrigin);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, status.API_URL);
  assert.equal(env.MAILPIT_URL, status.INBUCKET_URL);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, status.ANON_KEY);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, status.SERVICE_ROLE_KEY);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.RESEND_API_KEY, undefined);
  assert.deepEqual(pilotBrowserArgs, [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    'playwright.pilot.config.ts',
  ]);
});

test('pilot browser environment refuses an unexpected runtime before spawning Playwright', () => {
  assert.throws(
    () => pilotBrowserEnvironment({
      API_URL: 'https://project.supabase.co',
      DB_URL: 'postgresql://remote.example.test/database',
      INBUCKET_URL: 'https://mail.example.test',
      ANON_KEY: 'remote-anon',
      SERVICE_ROLE_KEY: 'remote-service',
    }, {}),
    /unexpected pilot API_URL/,
  );
});

test('browser actions allowlist core and I4 without arbitrary CLI overrides', () => {
  assert.deepEqual(pilotBrowserArgsFor(), pilotBrowserArgs);
  assert.equal(pilotBrowserArgsFor('i4').at(-1), 'playwright.i4.config.ts');
  for (const action of ['--config', 'remote', '', '../config.ts']) assert.throws(() => pilotBrowserArgsFor(action), /core or i4/u);
  assert.throws(() => pilotI4Environment({}, {}), /validated local jobs secret/u);
  assert.deepEqual(pilotI4Environment({ SAMPLE: 'kept' }, { CRON_SECRET: 'a'.repeat(64) }), { SAMPLE: 'kept', OPENMEMBERS_PILOT_I4: '1', CRON_SECRET: 'a'.repeat(64) });
});
