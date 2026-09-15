import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JOBS, runJob } from '../../scripts/run-job.mjs';

const secret = 'fictitious-cron-secret-for-runner-tests';
const privateText = 'fictitious-response-detail-never-for-logs';
const script = fileURLToPath(new URL('../../scripts/run-job.mjs', import.meta.url));

async function fixture(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return {
    server,
    env: { CRON_SECRET: secret, OPENMEMBERS_JOB_ORIGIN: `http://127.0.0.1:${server.address().port}` },
  };
}

function json(response, body, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function assertSafeRecord(result) {
  assert.ok(Number.isSafeInteger(result.durationMs) && result.durationMs >= 0);
  for (const key of Object.keys(result)) {
    assert.ok(['job', 'ok', 'status', 'counters', 'error', 'durationMs'].includes(key), `Unexpected log field ${key}`);
  }
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(privateText), false);
}

function assertFailure(result, error, status) {
  assertSafeRecord(result);
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
  assert.equal(result.status, status);
}

async function cli(args, env) {
  return new Promise(resolve => {
    execFile(process.execPath, [script, ...args], {
      env: { ...process.env, ...env }, timeout: 5_000,
    }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
}

test('all five jobs send authenticated GETs to their exact endpoints and log only public counters', async t => {
  const summaries = {
    'expire-enrollments': { expired: 2 },
    'expiration-warning-7d': { sent: 3, skipped: 1, failed: 0, total: 4 },
    'drip-check': { processed: 5, notified: 2 },
    'webhook-retry': { processed: 2, abandoned: 1, rescheduled: 3, batchSize: 6 },
    'webhook-cleanup': { rateLimitHitsPurged: 8, graceWindowsCleared: 1 },
  };
  assert.deepEqual([...JOBS].sort(), Object.keys(summaries).sort());
  const requests = [];
  const { env } = await fixture(t, (request, response) => {
    requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization, accept: request.headers.accept });
    const job = request.url.split('/').at(-1);
    json(response, { ...summaries[job], ranAt: '2026-09-11T12:00:00.000Z', detail: privateText, token: secret, email: 'fixture@example.test' });
  });
  for (const [job, counters] of Object.entries(summaries)) {
    const result = await runJob(job, { env });
    assertSafeRecord(result);
    assert.equal(result.job, job);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.counters, counters);
  }
  assert.deepEqual(requests, Object.keys(summaries).map(job => ({
    method: 'GET', path: `/api/cron/${job}`, authorization: `Bearer ${secret}`, accept: 'application/json',
  })));
});

test('zero work and the warning endpoint minimal summary are successful', async t => {
  const { env } = await fixture(t, (_request, response) => json(response, { sent: 0 }));
  const result = await runJob('expiration-warning-7d', { env });
  assert.equal(result.ok, true);
  assert.deepEqual(result.counters, { sent: 0 });
});

test('invalid job, token, origin and timeout are rejected before any network request', async t => {
  const request = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  const env = { CRON_SECRET: secret, OPENMEMBERS_JOB_ORIGIN: 'http://127.0.0.1:3000' };
  for (const job of [undefined, '', '../expire-enrollments', 'EXPIRE-ENROLLMENTS', privateText]) {
    const result = await runJob(job, { env });
    assertFailure(result, 'invalid_job');
    assert.equal(result.job, 'invalid');
  }
  for (const token of [undefined, '', ' ', `${secret}\n`, `Bearer ${secret}`, 123]) {
    assertFailure(await runJob('expire-enrollments', { env: { ...env, CRON_SECRET: token } }), 'invalid_secret');
  }
  for (const origin of [
    'not-a-url', 'ftp://127.0.0.1', 'http://192.0.2.1', 'http://members.example.test',
    'http://localhost.example.test', 'http://127.0.0.1@members.example.test',
    `https://user:${secret}@members.example.test`, 'http://127.0.0.1:3000/api',
    `http://127.0.0.1:3000/?token=${secret}`, `http://127.0.0.1:3000/#${privateText}`,
  ]) {
    assertFailure(await runJob('expire-enrollments', { env: { ...env, OPENMEMBERS_JOB_ORIGIN: origin } }), 'invalid_origin');
  }
  for (const timeoutMs of [0, -1, 0.5, Infinity, NaN, '1000']) {
    assertFailure(await runJob('expire-enrollments', { env, timeoutMs }), 'invalid_timeout');
  }
  assert.equal(request.mock.callCount(), 0);
});

test('HTTPS and documented loopback origins preserve the authenticated destination without external I/O', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response('{"expired":0}', { headers: { 'content-type': 'application/json' } });
  });
  for (const origin of [undefined, 'https://members.example.test', 'http://localhost:3100/', 'http://[::1]:3100']) {
    const result = await runJob('expire-enrollments', { env: { CRON_SECRET: secret, OPENMEMBERS_JOB_ORIGIN: origin } });
    assert.equal(result.ok, true);
  }
  assert.deepEqual(requests.map(request => request.url), [
    'http://127.0.0.1:3000/api/cron/expire-enrollments',
    'https://members.example.test/api/cron/expire-enrollments',
    'http://localhost:3100/api/cron/expire-enrollments',
    'http://[::1]:3100/api/cron/expire-enrollments',
  ]);
  for (const { options } of requests) {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.authorization, `Bearer ${secret}`);
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('401 and 503 fail without disclosing the response or retrying', async t => {
  let status = 401;
  let requests = 0;
  const { env } = await fixture(t, (_request, response) => {
    requests++;
    json(response, { error: privateText, token: secret }, status);
  });
  for (status of [401, 503]) assertFailure(await runJob('expire-enrollments', { env }), 'http_error', status);
  assert.equal(requests, 2);
});

test('redirects fail without following their target or disclosing Location', async t => {
  const paths = [];
  const { env } = await fixture(t, (request, response) => {
    paths.push(request.url);
    response.writeHead(302, { location: `/private-target?token=${secret}&detail=${privateText}` });
    response.end(privateText);
  });
  assertFailure(await runJob('expire-enrollments', { env }), 'http_error', 302);
  assert.deepEqual(paths, ['/api/cron/expire-enrollments']);
});

test('wrong or missing MIME types and malformed JSON are failures', async t => {
  let sample;
  const { env } = await fixture(t, (_request, response) => {
    if (sample.mime) response.setHeader('content-type', sample.mime);
    response.end(sample.body);
  });
  for (sample of [
    { mime: 'text/html', body: privateText },
    { body: '{"expired":0}' },
    { mime: 'application/problem+json', body: '{"expired":0}' },
    { mime: 'application/json', body: privateText },
    { mime: 'application/json', body: '' },
  ]) assertFailure(await runJob('expire-enrollments', { env }), 'invalid_response', 200);
});

test('JSON scalars, arrays, errors and missing or invalid counters cannot report success', async t => {
  let body;
  const { env } = await fixture(t, (_request, response) => json(response, body));
  for (body of [
    null, [], 5, true, privateText, {}, { expired: 0, error: privateText },
    ...[-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1].map(expired => ({ expired })),
  ]) assertFailure(await runJob('expire-enrollments', { env }), 'invalid_response', 200);
});

test('invalid optional warning counters and reported partial failure cannot report success', async t => {
  let body;
  const { env } = await fixture(t, (_request, response) => json(response, body));
  for (body of [{ sent: 1, skipped: -1 }, { sent: 1, failed: '0' }, { sent: 1, total: 1.5 }]) {
    assertFailure(await runJob('expiration-warning-7d', { env }), 'invalid_response', 200);
  }
  body = { sent: 1, skipped: 0, failed: 2, total: 3, detail: privateText };
  const result = await runJob('expiration-warning-7d', { env });
  assertFailure(result, 'job_failed', 200);
  assert.deepEqual(result.counters, { sent: 1, skipped: 0, failed: 2, total: 3 });
});

test('the timeout aborts waiting for response headers', async t => {
  let requests = 0;
  const { env } = await fixture(t, () => { requests++; });
  assertFailure(await runJob('expire-enrollments', { env, timeoutMs: 100 }), 'timeout');
  assert.equal(requests, 1);
});

test('the timeout also aborts a body that never finishes', async t => {
  const { env } = await fixture(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"expired":');
  });
  assertFailure(await runJob('expire-enrollments', { env, timeoutMs: 100 }), 'timeout', 200);
});

test('an oversized JSON body is rejected instead of logged or accumulated without a bound', async t => {
  const { env } = await fixture(t, (_request, response) => {
    json(response, { expired: 0, detail: privateText, padding: 'x'.repeat(17_000) });
  });
  assertFailure(await runJob('expire-enrollments', { env }), 'invalid_response', 200);
});

test('network exceptions expose only a stable failure code', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error(`${privateText}: ${secret}`); });
  assertFailure(await runJob('expire-enrollments', { env: { CRON_SECRET: secret } }), 'request_failed');
});

test('CLI prints one sanitized JSON record and exits zero only on success', async t => {
  let status = 200;
  let requests = 0;
  const { env } = await fixture(t, (_request, response) => {
    requests++;
    json(response, status === 200 ? { expired: 3, detail: privateText } : { error: privateText, token: secret }, status);
  });
  for (status of [200, 401, 503]) {
    const output = await cli(['expire-enrollments'], env);
    assert.equal(output.code, status === 200 ? 0 : 1);
    assert.equal(output.stderr, '');
    assert.equal(output.stdout.trim().split('\n').length, 1);
    const result = JSON.parse(output.stdout);
    assertSafeRecord(result);
    assert.equal(result.ok, status === 200);
    assert.equal(result.status, status);
  }
  for (const args of [[], [privateText], ['expire-enrollments', secret]]) {
    const output = await cli(args, env);
    assert.equal(output.code, 1);
    assert.equal(output.stderr, '');
    assertFailure(JSON.parse(output.stdout), 'invalid_job');
  }
  assert.equal(requests, 3);
});
