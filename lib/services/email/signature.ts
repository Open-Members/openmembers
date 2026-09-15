import { createHmac, timingSafeEqual } from 'node:crypto';

function decodeBase64(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length && bytes.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '') ? bytes : null;
}

/** Standard Webhooks and Svix both sign id.timestamp.rawBody using HMAC-SHA256. */
export function verifyEmailSignature(body: string | Uint8Array, headers: Headers, secret: string, prefix: 'webhook' | 'svix'): boolean {
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signatures = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = decodeBase64(secret.replace(/^v1,/, '').replace(/^whsec_/, ''));
  if (!key) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest();
  return signatures.split(' ').some(signature => {
    const [version, encoded, extra] = signature.split(',');
    if (version !== 'v1' || !encoded || extra) return false;
    const actual = decodeBase64(encoded);
    return actual?.length === expected.length && timingSafeEqual(actual, expected);
  });
}
