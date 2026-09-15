// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), getUser: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), cookies: vi.fn(), setCookie: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
import { updatePreferredLanguage, updateDisplayName, requestEmailChange, changePassword } from './actions';
import type { Locale } from '@/core/i18n/config';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser, updateUser: mocks.updateUser }, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'own-user', email: 'member@example.test' } }, error: null });
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: { id: 'own-user' }, error: null });
  mocks.cookies.mockResolvedValue({ set: mocks.setCookie });
});

describe('saving account language', () => {
  it.each(['en', 'pt', 'es'] as const)('saves %s on only the authenticated profile before setting the cookie', async locale => {
    expect(await updatePreferredLanguage(locale)).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith({ preferred_locale: locale });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'own-user');
    expect(mocks.setCookie).toHaveBeenCalledWith('NEXT_LOCALE', locale, { maxAge: 31536000, path: '/', sameSite: 'lax' });
    expect(mocks.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.setCookie.mock.invocationCallOrder[0]);
  });
  it('rejects runtime values outside the locale allowlist before accessing services', async () => {
    expect(await updatePreferredLanguage('fr' as Locale)).toEqual({ error: 'unsupportedLanguage' });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
  it('requires a verified account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await updatePreferredLanguage('pt')).toEqual({ error: 'notAuthenticated' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
  it('does not change browser preference if RLS rejects the update or no row is returned', async () => {
    for (const result of [{ data: null, error: { message: 'private database detail' } }, { data: null, error: null }]) {
      mocks.single.mockResolvedValue(result);
      expect(await updatePreferredLanguage('pt')).toEqual({ error: 'updateLanguage' });
    }
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
  it('returns a stable code when the network fails', async () => {
    mocks.single.mockRejectedValue(new Error('private connection detail'));
    expect(await updatePreferredLanguage('pt')).toEqual({ error: 'updateLanguage' });
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
});

describe('settings errors are translation codes', () => {
  it('does not return Zod English prose for invalid values', async () => {
    expect(await updateDisplayName('')).toEqual({ error: 'invalidName' });
    expect(await requestEmailChange('invalid')).toEqual({ error: 'invalidEmail' });
    expect(await changePassword('short')).toEqual({ error: 'invalidPassword' });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('does not expose provider error messages', async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: 'private provider detail' } });
    expect(await requestEmailChange('new@example.test')).toEqual({ error: 'updateEmail' });
    expect(await changePassword('long-enough-password')).toEqual({ error: 'updatePassword' });
  });
});
