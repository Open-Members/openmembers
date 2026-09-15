// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.createClient }));
import { getPreferredLocale } from './preference.server';
import { resolveLocale } from './config';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fictitious-key');
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'own-user' } }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { preferred_locale: 'pt' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('account locale resolution', () => {
  it.each(['en', 'pt', 'es'])('uses saved %s despite another browser language', async locale => {
    mocks.maybeSingle.mockResolvedValue({ data: { preferred_locale: locale }, error: null });
    expect(await getPreferredLocale(locale === 'es' ? 'en' : 'es')).toBe(locale);
    expect(mocks.eq).toHaveBeenCalledWith('id', 'own-user');
  });
  it('keeps negotiation for an account without a saved preference', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { preferred_locale: null }, error: null });
    expect(await getPreferredLocale('es')).toBe('es');
  });
  it('does not query a profile for anonymous or invalid sessions', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getPreferredLocale('pt')).toBe('pt');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'unverified' } }, error: { message: 'invalid' } });
    expect(await getPreferredLocale('es')).toBe('es');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not require Supabase to render an unconfigured installation', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(await getPreferredLocale('pt')).toBe('pt');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it('falls back on missing profiles, invalid values and database errors', async () => {
    for (const result of [{ data: null, error: null }, { data: { preferred_locale: 'de' }, error: null }, { data: null, error: { message: 'unavailable' } }]) {
      mocks.maybeSingle.mockResolvedValue(result);
      expect(await getPreferredLocale('pt')).toBe('pt');
    }
  });
  it('does not reuse a previous identity or locale across requests', async () => {
    expect(await getPreferredLocale('en')).toBe('pt');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { preferred_locale: 'es' }, error: null });
    expect(await getPreferredLocale('en')).toBe('es');
    expect(mocks.eq).toHaveBeenLastCalledWith('id', 'other-user');
  });
  it('treats network failures as unavailable preferences', async () => {
    mocks.getUser.mockRejectedValue(new Error('private upstream failure'));
    expect(await getPreferredLocale('pt')).toBe('pt');
  });
  it('restricts fallback values to supported locales', () => {
    expect(resolveLocale('../../secret', 'de')).toBe('en');
    expect(resolveLocale(undefined, 'pt')).toBe('pt');
    expect(resolveLocale(null, undefined)).toBe('en');
  });
});
