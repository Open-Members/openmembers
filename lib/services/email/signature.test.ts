// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyEmailSignature } from './signature';

describe('raw email webhook signatures', () => {
  const key = Buffer.from('fictitious-signature-test-key');
  it.each(['svix', 'webhook'] as const)('preserves bytes and string compatibility for %s', prefix => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payloads = [
      ' { "name": "ação 🎓" }\n',
      new TextEncoder().encode('\uFEFF { "name": "ação 🎓" }\n'),
      new Uint8Array([0xff, 0xc0, 0x00]),
    ];
    for (const body of payloads) {
      const signature = createHmac('sha256', key).update(`fixture.${timestamp}.`).update(body).digest('base64');
      const headers = new Headers({ [`${prefix}-id`]: 'fixture', [`${prefix}-timestamp`]: timestamp, [`${prefix}-signature`]: `v1,${signature}` });
      expect(verifyEmailSignature(body, headers, `whsec_${key.toString('base64')}`, prefix)).toBe(true);
      expect(verifyEmailSignature(`${body}modified`, headers, `whsec_${key.toString('base64')}`, prefix)).toBe(false);
    }
  });
});
