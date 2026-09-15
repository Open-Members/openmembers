import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLocalStatus, localAppEnv } from '../../scripts/local-environment.mjs';

const fixture = {
  API_URL: 'http://127.0.0.1:55431',
  DB_URL: 'postgresql://postgres:fixture-password@127.0.0.1:55432/postgres',
  INBUCKET_URL: 'http://127.0.0.1:55434',
  ANON_KEY: 'fictitious-local-anon-key',
  SERVICE_ROLE_KEY: 'fictitious-local-service-key',
};

// These are configuration contracts, deliberately independent of the runner's regex.
const optionalProviderKeys = [
  'RESEND_API_KEY', 'RESEND_SENDER_EMAIL', 'RESEND_SENDER_NAME', 'RESEND_WEBHOOK_SECRET',
  'SEND_EMAIL_HOOK_SECRET',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
  'CRON_SECRET', 'AI_GATEWAY_API_KEY', 'NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN',
  'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'NEXT_PUBLIC_GA4_MEASUREMENT_ID',
  'NEXT_PUBLIC_META_PIXEL_ID',
  'CERTIFICATE_IMAGE_ALLOWED_ORIGINS',
];

function withEnvironment(values, run) {
  const original = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('local status accepts documented IPv4, IPv6 and localhost endpoints', () => {
  for (const hostname of ['127.0.0.1', 'localhost', '[::1]']) {
    for (const databaseProtocol of ['postgres', 'postgresql']) {
      const status = {
        ...fixture,
        API_URL: `http://${hostname}:55431`,
        DB_URL: `${databaseProtocol}://postgres:fixture@${hostname}:55432/postgres`,
        INBUCKET_URL: `http://${hostname}:55434`,
      };
      assert.equal(validateLocalStatus(status), status);
    }
  }
});

test('local status refuses remote hosts and hostnames disguised as localhost', () => {
  for (const field of ['API_URL', 'DB_URL', 'INBUCKET_URL']) {
    for (const hostname of ['service.example.test', '192.0.2.10', 'localhost.example.test']) {
      const url = new URL(fixture[field]);
      url.hostname = hostname;
      assert.throws(() => validateLocalStatus({ ...fixture, [field]: url.href }), /Refusing non-local or unexpected/);
    }
  }
  assert.throws(() => validateLocalStatus({ ...fixture, API_URL: 'http://localhost:55431@service.example.test:55431' }), /Refusing non-local or unexpected API_URL/);
});

test('local status refuses unexpected ports, missing endpoints and malformed URLs', () => {
  for (const field of ['API_URL', 'DB_URL', 'INBUCKET_URL']) {
    const url = new URL(fixture[field]);
    url.port = '54321';
    assert.throws(() => validateLocalStatus({ ...fixture, [field]: url.href }), /Refusing non-local or unexpected/);
    url.port = '';
    assert.throws(() => validateLocalStatus({ ...fixture, [field]: url.href }), /Refusing non-local or unexpected/);
    for (const value of [undefined, '', 'not a URL']) {
      assert.throws(() => validateLocalStatus({ ...fixture, [field]: value }));
    }
  }
});

test('local status restricts each endpoint to its documented protocol', () => {
  const invalid = [
    ['API_URL', 'https://127.0.0.1:55431'],
    ['API_URL', 'ftp://127.0.0.1:55431'],
    ['DB_URL', 'http://127.0.0.1:55432'],
    ['DB_URL', 'https://127.0.0.1:55432'],
    ['INBUCKET_URL', 'https://127.0.0.1:55434'],
    ['INBUCKET_URL', 'postgresql://127.0.0.1:55434/postgres'],
  ];
  for (const [field, value] of invalid) {
    assert.throws(() => validateLocalStatus({ ...fixture, [field]: value }), /Refusing non-local or unexpected/);
  }
});

test('local status requires both public and service keys', () => {
  for (const field of ['ANON_KEY', 'SERVICE_ROLE_KEY']) {
    for (const value of [undefined, '']) {
      assert.throws(() => validateLocalStatus({ ...fixture, [field]: value }), /Local Supabase keys are unavailable/);
    }
  }
});

test('local runner explicitly blanks template providers even when absent from the shell', () => {
  const template = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  for (const key of optionalProviderKeys) {
    assert.match(template, new RegExp(`^${key}=`, 'm'), `Expected documented provider variable ${key}`);
  }
  withEnvironment(Object.fromEntries(optionalProviderKeys.map(key => [key, undefined])), () => {
    const env = localAppEnv(validateLocalStatus({ ...fixture }));
    for (const key of optionalProviderKeys) {
      assert.ok(Object.hasOwn(env, key), `${key} must shadow a value Next.js could load from .env.local`);
      assert.equal(env[key], '', key);
    }
  });
});

test('local runner blanks exported provider values, including new keys in known provider namespaces', () => {
  const keys = [...optionalProviderKeys, 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME', 'STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_ANNUAL', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'STRIPE_FUTURE_OPTION', 'R2_FUTURE_TOKEN', 'NEXT_PUBLIC_SENTRY_FUTURE_OPTION'];
  withEnvironment(Object.fromEntries(keys.map(key => [key, 'fictitious-provider-value'])), () => {
    const env = localAppEnv(validateLocalStatus({ ...fixture }));
    for (const key of keys) assert.equal(env[key], '', key);
  });
});

test('local runner replaces inherited service destinations with the validated local configuration', () => {
  const inherited = {
    NEXT_PUBLIC_SITE_URL: 'https://app.example.test',
    AUTH_ALLOWED_ORIGINS: 'https://app.example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fictitious-remote-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'fictitious-remote-service-key',
    SUPABASE_INTERNAL_URL: 'http://host.docker.internal:56431',
    OPENMEMBERS_INTERNAL_URL: 'http://127.0.0.1:3000',
    DATABASE_URL: 'postgresql://database.example.test/postgres',
    DATABASE_POOL_URL: 'postgresql://pool.example.test/postgres',
    NEXT_TELEMETRY_DISABLED: '0',
  };
  withEnvironment(inherited, () => {
    for (const port of ['3000', '3101']) {
      const env = localAppEnv(validateLocalStatus({ ...fixture }), port);
      assert.equal(env.NEXT_PUBLIC_SITE_URL, `http://localhost:${port}`);
      assert.equal(env.AUTH_ALLOWED_ORIGINS, 'http://localhost:3000,http://localhost:3101');
      assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, fixture.API_URL);
      assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, fixture.ANON_KEY);
      assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, fixture.SERVICE_ROLE_KEY);
      assert.equal(env.SUPABASE_INTERNAL_URL, '');
      assert.equal(env.OPENMEMBERS_INTERNAL_URL, '');
      assert.equal(env.DATABASE_URL, fixture.DB_URL);
      assert.equal(env.DATABASE_POOL_URL, fixture.DB_URL);
      assert.equal(env.NEXT_TELEMETRY_DISABLED, '1');
    }
  });
});

test('local runner chooses loopback capture and disables chat despite inherited optional configuration', () => {
  withEnvironment({ EMAIL_TRANSPORT: 'resend', MAILPIT_URL: 'https://mail.example.test', COURSE_CHAT_ENABLED: 'true', OAUTH_PROVIDERS: 'google,apple' }, () => {
    const env = localAppEnv(validateLocalStatus({ ...fixture }));
    assert.equal(env.EMAIL_TRANSPORT, 'mailpit');
    assert.equal(env.MAILPIT_URL, fixture.INBUCKET_URL);
    assert.equal(env.COURSE_CHAT_ENABLED, 'false');
    assert.equal(env.OAUTH_PROVIDERS, '');
  });
});
