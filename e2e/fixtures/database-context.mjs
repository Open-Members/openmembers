import { createHash } from 'node:crypto';
import { assertBrowserTestEnvironment } from './test-target.mjs';

/**
 * Test-only request identity. The guarded browser runner opts in explicitly;
 * ordinary previews, remote targets and other local ports cannot use it.
 * @param {Record<string, string | undefined>} env
 * @param {{ testId: string, projectName: string, retry: number, repeatEachIndex: number }} testInfo
 * @param {string | undefined} baseURL
 */
export function localBrowserContext(env, testInfo, baseURL) {
  const target = assertBrowserTestEnvironment(env, baseURL);
  if (typeof testInfo.testId !== 'string' || !testInfo.testId
    || typeof testInfo.projectName !== 'string' || !testInfo.projectName
    || !Number.isSafeInteger(testInfo.retry) || testInfo.retry < 0
    || !Number.isSafeInteger(testInfo.repeatEachIndex) || testInfo.repeatEachIndex < 0) {
    throw new Error('Browser request identity requires a complete test identity.');
  }

  const hash = createHash('sha256').update(JSON.stringify([
    'openmembers-local-browser-v1', testInfo.testId, testInfo.projectName,
    testInfo.retry, testInfo.repeatEachIndex,
  ])).digest('hex').slice(0, 24);
  // RFC 3849 documentation prefix plus a 96-bit test identity. No real client
  // IP or production rate-limit override is involved.
  const ip = `2001:db8:${hash.match(/.{4}/g).join(':')}`;
  return {
    headers: { 'x-forwarded-for': ip, 'x-real-ip': ip },
    /** @param {URL} url */
    matchesUrl: (url) => url.origin === target.appOrigin,
  };
}
