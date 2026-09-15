// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), admin: vi.fn(), headers: vi.fn(), rateLimit: vi.fn(), redirect: vi.fn(),
  signIn: vi.fn(), signUp: vi.fn(), reset: vi.fn(), user: vi.fn(), updateUser: vi.fn(),
  profileUpdate: vi.fn(), profileEq: vi.fn(), profileRead: vi.fn(), profileReadEq: vi.fn(), sessionFrom: vi.fn(),
  locale: vi.fn(),
}));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/core/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('next-intl/server', () => ({ getLocale: mocks.locale }));
import { changeInitialPassword, requestPasswordReset, signInWithEmail, signUpWithEmail, updatePassword } from './actions';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const credentials = { email: 'learner@example.test', password: 'Fictitious-password-2026!' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://members.example.test');
  vi.stubEnv('AUTH_ALLOWED_ORIGINS', '');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External request forbidden'); }));
  mocks.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '192.0.2.10, 192.0.2.11', 'x-forwarded-host': 'untrusted.example.test', 'x-forwarded-proto': 'https' }));
  mocks.rateLimit.mockReturnValue({ success: true, remaining: 4 });
  mocks.locale.mockResolvedValue('en');
  mocks.signIn.mockResolvedValue({ data: { user: { id: 'signed-in-user' } }, error: null });
  mocks.signUp.mockResolvedValue({ data: { user: { id: 'new-user' }, session: null }, error: null });
  mocks.reset.mockResolvedValue({ error: null });
  mocks.user.mockResolvedValue({ data: { user: { id: 'session-user' } }, error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.profileEq.mockResolvedValue({ error: null });
  mocks.profileUpdate.mockReturnValue({ eq: mocks.profileEq });
  mocks.admin.mockReturnValue({ from: () => ({ update: mocks.profileUpdate }) });
  mocks.profileRead.mockResolvedValue({ data: { status: 'active', must_change_password: false }, error: null });
  mocks.profileReadEq.mockReturnValue({ maybeSingle: mocks.profileRead });
  mocks.sessionFrom.mockReturnValue({ select: () => ({ eq: mocks.profileReadEq }) });
  mocks.client.mockResolvedValue({ from: mocks.sessionFrom, auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp, resetPasswordForEmail: mocks.reset, getUser: mocks.user, updateUser: mocks.updateUser } });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('email authentication', () => {
  it.each([
    [signInWithEmail, { email: 'bad', password: 'valid' }, 'invalidEmail'],
    [signInWithEmail, { email: credentials.email, password: '' }, 'passwordRequired'],
    [signUpWithEmail, { ...credentials, displayName: '' }, 'invalidName'],
    [signUpWithEmail, { ...credentials, displayName: 'x'.repeat(51) }, 'invalidName'],
    [signUpWithEmail, { ...credentials, password: 'short', displayName: 'Demo' }, 'passwordTooShort'],
    [requestPasswordReset, { email: 'bad' }, 'invalidEmail'],
    [updatePassword, { password: 'short' }, 'passwordTooShort'],
    [changeInitialPassword, { password: 'short' }, 'passwordTooShort'],
  ] as const)('returns field-specific message keys without exposing Zod prose', async (action, values, code) => {
    expect(await action(form(values))).toEqual({ error: code });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([
    ['invalid_credentials', 'invalidCredentials'],
    ['email_not_confirmed', 'emailNotConfirmed'],
    ['over_request_rate_limit', 'tooManySignIns'],
    ['future_provider_code', 'signInFailed'],
  ])('maps sign-in provider code %s without returning its prose', async (code, expected) => {
    mocks.signIn.mockResolvedValue({ error: { code, message: 'Private provider details' } });
    expect(await signInWithEmail(form(credentials))).toEqual({ error: expected });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it.each([
    ['email_exists', 'emailAlreadyRegistered'],
    ['user_already_exists', 'emailAlreadyRegistered'],
    ['weak_password', 'weakPassword'],
    ['over_email_send_rate_limit', 'tooManySignUps'],
    ['unknown', 'signUpFailed'],
  ])('maps signup provider code %s without returning its prose', async (code, expected) => {
    mocks.signUp.mockResolvedValue({ error: { code, message: 'Private provider details' } });
    expect(await signUpWithEmail(form({ ...credentials, displayName: 'Demo' }))).toEqual({ error: expected });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    [signInWithEmail, 'signInFailed'], [signUpWithEmail, 'signUpFailed'],
    [updatePassword, 'passwordUpdateFailed'], [changeInitialPassword, 'passwordUpdateFailed'],
  ] as const)('returns a safe localized key on transport failure', async (action, expected) => {
    mocks.client.mockRejectedValue(new Error('Sensitive transport detail'));
    expect(await action(form({ ...credentials, displayName: 'Demo' }))).toEqual({ error: expected });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('keeps recovery non-enumerating even if the provider throws', async () => {
    mocks.reset.mockRejectedValue(new Error('Unknown account or network failure'));
    expect(await requestPasswordReset(form({ email: credentials.email }))).toEqual({ success: true });
  });
  it.each([signInWithEmail, signUpWithEmail, requestPasswordReset, updatePassword, changeInitialPassword])('rejects invalid input before opening any client', async action => {
    expect(await action(form({ email: 'invalid', password: 'x' }))).toHaveProperty('error');
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('redirects only after password sign-in succeeds', async () => {
    await expect(signInWithEmail(form(credentials))).rejects.toThrow('REDIRECT:/dashboard');
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith(credentials);
    expect(mocks.rateLimit).toHaveBeenCalledWith('auth:signin:192.0.2.10', expect.any(Object));
    expect(mocks.profileReadEq).toHaveBeenCalledWith('id', 'signed-in-user');
  });
  it('sends an invited learner directly to the required password form', async () => {
    mocks.profileRead.mockResolvedValue({ data: { status: 'active', must_change_password: true }, error: null });
    await expect(signInWithEmail(form({ ...credentials, userId: 'someone-else', must_change_password: 'false' }))).rejects.toThrow('REDIRECT:/change-password');
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith('/change-password');
    expect(mocks.sessionFrom).toHaveBeenCalledExactlyOnceWith('profiles');
    expect(mocks.profileReadEq).toHaveBeenCalledExactlyOnceWith('id', 'signed-in-user');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('sends suspended learners to suspension before password setup', async () => {
    mocks.profileRead.mockResolvedValue({ data: { status: 'suspended', must_change_password: true }, error: null });
    await expect(signInWithEmail(form(credentials))).rejects.toThrow('REDIRECT:/suspended');
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith('/suspended');
  });
  it('does not navigate after an Auth success without an identity', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: null });
    expect(await signInWithEmail(form(credentials))).toHaveProperty('error');
    expect(mocks.profileRead).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { message: 'Profile unavailable' } },
    { data: { status: 'active', must_change_password: false }, error: { message: 'Profile unavailable' } },
  ])('does not navigate after a missing or failed profile response', async profile => {
    mocks.profileRead.mockResolvedValue(profile);
    expect(await signInWithEmail(form(credentials))).toEqual({ error: 'profileUnavailable' });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('keeps failed sign-in on the form', async () => {
    mocks.signIn.mockResolvedValue({ error: { message: 'Invalid credentials' } });
    expect(await signInWithEmail(form(credentials))).toEqual({ error: 'signInFailed' });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.profileRead).not.toHaveBeenCalled();
  });
  it.each([signInWithEmail, signUpWithEmail])('blocks rate-limited attempts before calling Auth', async action => {
    mocks.rateLimit.mockReturnValue({ success: false });
    expect(await action(form({ ...credentials, displayName: 'Demo Learner' }))).toHaveProperty('error');
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('signs up a regular account using an internal destination on the configured origin', async () => {
    expect(await signUpWithEmail(form({ ...credentials, displayName: 'Demo Learner', role: 'super_admin', status: 'active', next: '//untrusted.example.test', source: 'unrecognized', campaign: 'bad/value' }))).toEqual({ success: true, email: credentials.email });
    expect(mocks.signUp).toHaveBeenCalledExactlyOnceWith({ ...credentials, options: {
      data: { display_name: 'Demo Learner', delivery_locale: 'en' }, emailRedirectTo: 'https://members.example.test/api/auth/callback?next=%2Fdashboard',
    } });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('adds the effective request locale as an Auth delivery hint', async () => {
    mocks.locale.mockResolvedValue('pt');
    await signUpWithEmail(form({ ...credentials, displayName: 'Demo Learner' }));
    expect(mocks.signUp.mock.calls[0][0].options.data).toEqual({
      display_name: 'Demo Learner',
      delivery_locale: 'pt',
    });
  });
  it('persists only allowlisted attribution on the newly returned user', async () => {
    await signUpWithEmail(form({ ...credentials, displayName: 'Demo Learner', source: 'youtube', campaign: 'demo-123', next: '/courses/demo?tab=lessons' }));
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ signup_source: 'youtube', signup_campaign: 'demo-123' });
    expect(mocks.profileEq).toHaveBeenCalledWith('id', 'new-user');
    const sent = mocks.signUp.mock.calls[0][0];
    expect(new URL(sent.options.emailRedirectTo).searchParams.get('next')).toBe('/courses/demo?tab=lessons');
  });
  it('does not persist attribution when signup fails', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: null }, error: { message: 'Signup unavailable' } });
    expect(await signUpWithEmail(form({ ...credentials, displayName: 'Demo', source: 'youtube' }))).toEqual({ error: 'signUpFailed' });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([null, { message: 'Unknown account' }])('gives the same recovery result regardless of Auth account response', async error => {
    mocks.reset.mockResolvedValue({ error });
    expect(await requestPasswordReset(form({ email: credentials.email }))).toEqual({ success: true });
    expect(mocks.reset).toHaveBeenCalledWith(credentials.email, { redirectTo: 'https://members.example.test/api/auth/callback?next=/reset-password' });
  });
  it('uses both normalized email and IP budgets without disclosing a limit', async () => {
    mocks.rateLimit.mockReturnValue({ success: false });
    expect(await requestPasswordReset(form({ email: 'LEARNER@example.test' }))).toEqual({ success: true });
    expect(mocks.rateLimit).toHaveBeenCalledWith('auth:reset:email:learner@example.test', expect.any(Object));
    expect(mocks.rateLimit).toHaveBeenCalledWith('auth:reset:ip:192.0.2.10', expect.any(Object));
    expect(mocks.client).not.toHaveBeenCalled();
  });
});

for (const [name, action] of [['recovery', updatePassword], ['first login', changeInitialPassword]] as const) {
  describe(`${name} password change`, () => {
    it.each([
      ['same_password', 'samePassword'], ['weak_password', 'weakPassword'],
      ['session_expired', 'notAuthenticated'], ['unknown', 'passwordUpdateFailed'],
    ])('maps rejected password code %s and keeps the initial flag', async (code, expected) => {
      mocks.updateUser.mockResolvedValue({ error: { code, message: 'Private provider details' } });
      expect(await action(form({ password: credentials.password }))).toEqual({ error: expected });
      expect(mocks.admin).not.toHaveBeenCalled();
    });
    it('reports partial success if the profile transport fails after password update', async () => {
      mocks.profileEq.mockRejectedValue(new Error('Private database detail'));
      expect(await action(form({ password: credentials.password }))).toEqual({ error: 'passwordSetupIncomplete' });
      expect(mocks.updateUser).toHaveBeenCalledOnce();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });
    it('requires a verified session before password or profile writes', async () => {
      mocks.user.mockResolvedValue({ data: { user: null }, error: null });
      expect(await action(form({ password: credentials.password }))).toEqual({ error: 'notAuthenticated' });
      expect(mocks.updateUser).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    });
    it('rejects an identity response with an error before changing the password', async () => {
      mocks.user.mockResolvedValue({ data: { user: { id: 'session-user' } }, error: { message: 'Session invalid' } });
      expect(await action(form({ password: credentials.password }))).toEqual({ error: 'notAuthenticated' });
      expect(mocks.updateUser).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    });
    it('leaves the initial-password flag intact if Auth rejects the password', async () => {
      mocks.updateUser.mockResolvedValue({ error: { message: 'Password rejected' } });
      expect(await action(form({ password: credentials.password }))).toEqual({ error: 'passwordUpdateFailed' });
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });
    it('clears only the current user flag after Auth confirms the change', async () => {
      await expect(action(form({ password: credentials.password, userId: 'other-user', role: 'super_admin' }))).rejects.toThrow('REDIRECT:/dashboard');
      expect(mocks.updateUser).toHaveBeenCalledWith({ password: credentials.password });
      expect(mocks.profileUpdate).toHaveBeenCalledExactlyOnceWith({ must_change_password: false });
      expect(mocks.profileEq).toHaveBeenCalledWith('id', 'session-user');
      expect(mocks.updateUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.profileUpdate.mock.invocationCallOrder[0]);
    });
    it('reports profile failure instead of redirecting as completed', async () => {
      mocks.profileEq.mockResolvedValue({ error: { message: 'Profile unavailable' } });
      expect(await action(form({ password: credentials.password }))).toHaveProperty('error');
      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  });
}
