import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import { localBrowserContext } from '../../e2e/fixtures/database-context.mjs';

const env = {
  OPENMEMBERS_LOCAL_BROWSER_TEST: '1',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3101',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55431',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fictitious-local-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fictitious-local-service-key',
};
const identity = { testId: 'demo-test-id', projectName: 'chromium', retry: 0, repeatEachIndex: 0 };
const baseURL = 'http://localhost:3101';

test('browser contexts receive deterministic IPv6 documentation identities without extra headers', () => {
  const result = localBrowserContext(env, identity, baseURL);
  const ip = result.headers['x-forwarded-for'];
  assert.equal(isIP(ip), 6);
  assert.match(ip, /^2001:db8:/);
  assert.deepEqual(result.headers, { 'x-forwarded-for': ip, 'x-real-ip': ip });
  assert.deepEqual(localBrowserContext(env, identity, baseURL).headers, result.headers);
});

test('test, project, retry and repetition select separate login buckets', () => {
  const ips = new Set();
  let count = 0;
  for (const testId of ['demo-test-id', 'another-test-id']) {
    for (const projectName of ['chromium', 'mobile']) {
      for (const retry of [0, 1, 2]) {
        for (const repeatEachIndex of [0, 1, 2]) {
          const ip = localBrowserContext(env, { testId, projectName, retry, repeatEachIndex }, baseURL).headers['x-forwarded-for'];
          assert.equal(ips.has(ip), false, 'Distinct test contexts must not share the tested login bucket');
          ips.add(ip);
          count++;
        }
      }
    }
  }
  assert.equal(ips.size, count);
});

test('identity headers apply only to the local application origin', () => {
  const { matchesUrl } = localBrowserContext(env, identity, baseURL);
  assert.equal(matchesUrl(new URL(`${baseURL}/login`)), true);
  assert.equal(matchesUrl(new URL(`${baseURL}/api/auth/callback?code=fictitious`)), true);
  for (const url of [
    'http://localhost:3000/login', 'http://localhost:3100/login',
    'http://127.0.0.1:3101/login', 'http://127.0.0.1:55431/auth/v1/token',
    'http://127.0.0.1:55434/api/v1/messages', 'https://localhost:3101/login',
    'https://members.example.test/login', 'http://localhost.attacker.test:3101/login',
  ]) assert.equal(matchesUrl(new URL(url)), false, url);
});

test('identity setup rejects missing runner opt-in, keys and changed destinations', () => {
  for (const field of Object.keys(env)) {
    for (const value of [undefined, '', 'untrusted']) {
      if (field.endsWith('_KEY') && value === 'untrusted') continue;
      assert.throws(() => localBrowserContext({ ...env, [field]: value }, identity, baseURL), /guarded Open Members local test runner/);
    }
  }
  for (const value of [undefined, '', 'http://localhost:3000', 'https://members.example.test']) {
    assert.throws(() => localBrowserContext(env, identity, value), /guarded Open Members local test runner/);
  }
});

test('identity setup rejects incomplete IDs and ambiguous retry/repetition values', () => {
  for (const field of ['testId', 'projectName']) {
    for (const value of ['', null, undefined, 1]) {
      assert.throws(() => localBrowserContext(env, { ...identity, [field]: value }, baseURL), /complete test identity/);
    }
  }
  for (const field of ['retry', 'repeatEachIndex']) {
    for (const value of [-1, 0.5, NaN, Infinity, null, undefined, '0']) {
      assert.throws(() => localBrowserContext(env, { ...identity, [field]: value }, baseURL), /complete test identity/);
    }
  }
});
