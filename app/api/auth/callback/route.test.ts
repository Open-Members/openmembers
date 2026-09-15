// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import en from '@/core/i18n/locales/en/authPages.json';
import es from '@/core/i18n/locales/es/authPages.json';
import pt from '@/core/i18n/locales/pt/authPages.json';
const mocks = vi.hoisted(() => ({ client: vi.fn(), verify: vi.fn(), exchange: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
import { GET } from './route';
const base = 'https://members.example.test';
function request(query: string, headers?: HeadersInit) {
  const requestHeaders = new Headers({
    'x-forwarded-host': 'attacker.example.test',
    'x-forwarded-proto': 'https',
  });
  new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));
  return new NextRequest(`${base}/api/auth/callback?${query}`, {
    headers: requestHeaders,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', base);
  vi.stubEnv('AUTH_ALLOWED_ORIGINS', '');
  mocks.verify.mockResolvedValue({ error: null });
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ auth: { verifyOtp: mocks.verify, exchangeCodeForSession: mocks.exchange } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External request forbidden'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'])('verifies %s token before redirecting to the trusted internal destination', async type => {
  const response = await GET(request(`token_hash=fictitious-hash&type=${type}&next=%2Freset-password`));
  expect(mocks.verify).toHaveBeenCalledWith({ token_hash: 'fictitious-hash', type });
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(response.headers.get('location')).toBe(`${base}/reset-password`);
});
it('exchanges a PKCE code before opening the destination', async () => {
  const response = await GET(request('code=fictitious-code&next=%2Fcourses%2Fdemo'));
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('fictitious-code');
  expect(response.headers.get('location')).toBe(`${base}/courses/demo`);
});
it.each(['https://attacker.example.test', '//attacker.example.test', '/%2f%2fattacker.example.test', '/\\attacker.example.test'])('does not redirect outside the installation for %s', async next => {
  const response = await GET(request(`code=valid-code&next=${encodeURIComponent(next)}`));
  expect(response.headers.get('location')).toBe(`${base}/dashboard`);
});
it.each(['', 'token_hash=hash&type=unsupported'])('does not establish a session from missing or unsupported credentials', async query => {
  const response = await GET(request(query));
  expect(response.headers.get('location')).toBe(`${base}/login?error=auth_failed`);
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it('keeps failed OTP and PKCE credentials on the failure route', async () => {
  mocks.verify.mockResolvedValue({ error: { message: 'Expired token' } });
  mocks.exchange.mockResolvedValue({ error: { message: 'Missing verifier' } });
  const response = await GET(request('token_hash=hash&type=recovery&code=code&next=/reset-password'));
  expect(response.headers.get('location')).toBe(`${base}/login?error=auth_failed`);
});
it.each([
  ['pt', 'NEXT_LOCALE=pt', 'es-MX,es;q=0.9', pt.login.originUnavailable.title],
  ['es', 'NEXT_LOCALE=unsupported', 'fr-FR,es-MX;q=0.8', es.login.originUnavailable.title],
  ['en', 'NEXT_LOCALE=%E0%A4%A', 'de-DE,*;q=0.5', en.login.originUnavailable.title],
] as const)('renders a safe %s recovery page before Auth when the origin is invalid', async (
  locale,
  cookie,
  acceptLanguage,
  expectedTitle,
) => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  const response = await GET(request('code=PRIVATE-code', {
    cookie,
    'accept-language': acceptLanguage,
    host: 'attacker.example.test',
  }));

  expect(response.status).toBe(503);
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('vary')).toBe('Cookie, Accept-Language');
  expect(response.headers.get('content-type')).toContain('text/html');
  const html = await response.text();
  expect(html).toContain(`<html lang="${locale}">`);
  expect(html).toContain(expectedTitle);
  expect(html).toContain('auth_origin_unavailable');
  expect(html).not.toContain('attacker.example.test');
  expect(html).not.toContain('PRIVATE-code');
  expect(mocks.client).not.toHaveBeenCalled();
});
