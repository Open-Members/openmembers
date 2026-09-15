import { pathToFileURL } from 'node:url';

const countersByJob = Object.freeze({
  'expire-enrollments': ['expired'],
  'expiration-warning-7d': ['sent'],
  'drip-check': ['processed', 'notified'],
  'webhook-retry': ['processed', 'abandoned', 'rescheduled', 'batchSize'],
  'webhook-cleanup': ['rateLimitHitsPurged', 'graceWindowsCleared'],
});
const optionalCounters = ['skipped', 'failed', 'total'];
export const JOBS = Object.freeze(Object.keys(countersByJob));

function jobOrigin(value) {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) return null;
    return url.origin;
  } catch { return null; }
}

// Return a deliberately small log record. Never propagate a response body,
// URL, token, user argument or exception message to stdout/stderr.
export async function runJob(job, { env = process.env, timeoutMs = 120_000 } = {}) {
  const started = Date.now();
  const record = { job: JOBS.includes(job) ? job : 'invalid', ok: false };
  const finish = (error) => ({ ...record, ...(error ? { error } : {}), durationMs: Date.now() - started });
  if (!JOBS.includes(job)) return finish('invalid_job');
  const secret = env.CRON_SECRET;
  if (typeof secret !== 'string' || !secret || /\s/.test(secret)) return finish('invalid_secret');
  const origin = jobOrigin(env.OPENMEMBERS_JOB_ORIGIN || 'http://127.0.0.1:3000');
  if (!origin) return finish('invalid_origin');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return finish('invalid_timeout');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let responseTooLarge = false;
  try {
    const response = await fetch(`${origin}/api/cron/${job}`, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
    });
    record.status = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return finish('http_error');
    }
    if (!response.headers.get('content-type')?.split(';')[0].trim().match(/^application\/json$/i)) {
      await response.body?.cancel();
      return finish('invalid_response');
    }
    // All five handlers return a small summary. Bound memory even if a proxy
    // accidentally returns a large JSON document or an endless response.
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 16_384) {
        responseTooLarge = true;
        controller.abort();
        return finish('invalid_response');
      }
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return finish('invalid_response'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || 'error' in body) return finish('invalid_response');
    const required = countersByJob[job];
    const allowed = job === 'expiration-warning-7d' ? [...required, ...optionalCounters] : required;
    if (required.some(key => !Number.isSafeInteger(body[key]) || body[key] < 0)
      || allowed.some(key => key in body && (!Number.isSafeInteger(body[key]) || body[key] < 0))) return finish('invalid_response');
    record.counters = Object.fromEntries(allowed.filter(key => key in body).map(key => [key, body[key]]));
    if ((record.counters.failed ?? 0) > 0) return finish('job_failed');
    record.ok = true;
    return finish();
  } catch {
    if (responseTooLarge) return finish('invalid_response');
    return finish(controller.signal.aborted ? 'timeout' : 'request_failed');
  } finally { clearTimeout(timer); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runJob(process.argv.length === 3 ? process.argv[2] : undefined);
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
