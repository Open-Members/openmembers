import { describe, expect, it } from 'vitest';
import { parseAuthOrigin, resolveAuthOrigin, sanitizeAuthNext } from './auth-redirect';

const canonical = 'https://members.example';

describe('authentication origins', () => {
  it.each([
    ['https://members.example/', canonical],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['http://[::1]:3000', 'http://[::1]:3000'],
  ])('accepts an explicit app origin: %s', (input, expected) => {
    expect(parseAuthOrigin(input)).toBe(expected);
  });

  it.each(['', 'http://members.example', 'javascript:alert(1)', 'https://user:pass@members.example',
    'https://members.example/auth', 'https://members.example?next=1', 'https://members.example#auth',
    'https:/members.example', 'https://members.example\\other', 'https://mem\tbers.example'])('rejects invalid configuration: %s', (input) => {
    expect(() => parseAuthOrigin(input)).toThrow();
  });

  it('permits a configured local preview only at its exact port and protocol', () => {
    const headers = new Headers({ 'x-forwarded-host': 'localhost:3101', 'x-forwarded-proto': 'http' });
    expect(resolveAuthOrigin(headers, canonical, 'http://localhost:3101')).toBe('http://localhost:3101');
    expect(resolveAuthOrigin(headers, canonical)).toBe(canonical);
    headers.set('x-forwarded-host', 'localhost:3102');
    expect(resolveAuthOrigin(headers, canonical, 'http://localhost:3101')).toBe(canonical);
  });

  it.each(['attacker.example', 'members.example.attacker.example', 'members.example@attacker.example',
    'members.example, attacker.example', 'localhost:3000'])('never trusts an unlisted proxy host: %s', (host) => {
    expect(resolveAuthOrigin(new Headers({ 'x-forwarded-host': host, 'x-forwarded-proto': 'https' }), canonical)).toBe(canonical);
  });

  it('falls back to the canonical origin for missing headers or an invalid proxy protocol', () => {
    expect(resolveAuthOrigin(new Headers(), canonical)).toBe(canonical);
    expect(resolveAuthOrigin(new Headers({ host: 'members.example', 'x-forwarded-proto': 'https,http' }), canonical)).toBe(canonical);
  });

  it('fails closed when the canonical or additional origin is invalid', () => {
    expect(() => resolveAuthOrigin(new Headers({ host: 'members.example' }), '')).toThrow();
    expect(() => resolveAuthOrigin(new Headers(), canonical, 'http://preview.example')).toThrow();
  });
});

describe('authentication destinations', () => {
  it.each(['/dashboard', '/pt/courses/demo?tab=lessons#lesson', '/courses/intro%20course'])('preserves a safe internal path: %s', (path) => {
    expect(sanitizeAuthNext(path)).toBe(path);
  });

  it.each([undefined, null, 1, '', 'dashboard', 'https://attacker.example', '//attacker.example',
    '/\\attacker.example', '/%5cattacker.example', '/%2fattacker.example', '/%2F%2Fattacker.example',
    '/dashboard\n', '/dashboard%0d%0aLocation:evil', '/dashboard%00', '/dashboard%7f', '/invalid%zz'])('rejects unsafe or malformed input: %s', (path) => {
    expect(sanitizeAuthNext(path)).toBe('/dashboard');
  });
});
