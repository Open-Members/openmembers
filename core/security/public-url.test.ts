import { describe, expect, it } from 'vitest';
import { normalizePublicUrl } from './public-url';

describe('installation destinations', () => {
  it.each(['/support', '/pt/terms?version=2#policy', 'https://example.test/help', 'http://127.0.0.1:55431/storage/v1/object/public/platform-assets/logo.png'])(
    'accepts a safe destination %s', value => expect(normalizePublicUrl(value)).toBe(value),
  );
  it.each(['javascript:alert(1)', 'data:text/html,test', '//evil.test', '/\\evil.test', '/%2Fevil.test', '/%252Fevil.test', '/.//evil.test', 'https://name:password@example.test', 'http://example.test', 'https://example.test/%0afoo', '/%5cevil', '/%255cevil', '/bad%xx', 'java\nscript:alert(1)', '/foo\tbar', '/foo bar', 'ftp://example.test', 'mailto:help@example.test', undefined, 7])(
    'rejects unsafe or unsupported destination %s', value => expect(normalizePublicUrl(value)).toBeNull(),
  );
  it('permits only simple contact links when explicitly requested', () => {
    expect(normalizePublicUrl('mailto:help@example.test', { allowContact: true })).toBe('mailto:help@example.test');
    expect(normalizePublicUrl('tel:+5511999999999', { allowContact: true })).toBe('tel:+5511999999999');
    expect(normalizePublicUrl('mailto:help@example.test?bcc=other@example.test', { allowContact: true })).toBeNull();
    expect(normalizePublicUrl('whatsapp://send', { allowContact: true })).toBeNull();
  });
});
