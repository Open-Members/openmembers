// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  settings: vi.fn(), admin: vi.fn(), rpc: vi.fn(), profile: vi.fn(), insert: vi.fn(),
  recipientLocale: vi.fn(), loadTemplate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/core/theme/settings', () => ({ getTenantSettings: mocks.settings }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/i18n/recipient-locale.server', () => ({ resolveRecipientLocale: mocks.recipientLocale }));
vi.mock('@/lib/services/email/templates/load', () => ({
  loadLocalizedTemplateContent: mocks.loadTemplate,
  saveTemplateContent: vi.fn(),
  resetTemplateContent: vi.fn(),
}));
import { notifyAdminOfNewTicket } from './notify';
const params = { ticketId: 'fixture-ticket', userId: 'fixture-user', subject: 'Fixture <ticket>', message: 'Fictitious question', userDisplayName: 'Fixture Student' };
beforeEach(() => {
  vi.stubEnv('EMAIL_TRANSPORT', 'mailpit'); vi.stubEnv('MAILPIT_URL', 'http://127.0.0.1:55434'); vi.stubEnv('BREVO_API_KEY', 'fixture-unused'); vi.stubEnv('RESEND_API_KEY', 'fixture-unused');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55431'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-admin');
  mocks.settings.mockResolvedValue({ site_name: 'Fixture School', support_inbox_email: 'support@example.test' });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.profile.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.recipientLocale.mockResolvedValue({ locale: 'en', source: 'profile' });
  mocks.loadTemplate.mockImplementation(async (templateKey: string, locale: 'en' | 'pt' | 'es') => {
    const { EMAIL_TEMPLATE_DEFAULTS } = await import('@/lib/services/email/templates/localization');
    return EMAIL_TEMPLATE_DEFAULTS[templateKey as keyof typeof EMAIL_TEMPLATE_DEFAULTS][locale];
  });
  mocks.admin.mockReturnValue({
    rpc: mocks.rpc,
    from: (table: string) => table === 'profiles'
      ? { select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }
      : { insert: mocks.insert },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ID: 'fixture-capture' })));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('support uses local capture even with inherited external provider credentials', async () => {
  await notifyAdminOfNewTicket(params); expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = vi.mocked(fetch).mock.calls[0]; expect(url).toBe('http://127.0.0.1:55434/api/v1/send');
  expect(options?.headers).not.toHaveProperty('Authorization'); expect(options?.body).toContain('Fixture &lt;ticket&gt;');
});
it('transport failure does not reject the ticket notification caller', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'));
  await expect(notifyAdminOfNewTicket(params)).resolves.toBeUndefined(); expect(console.warn).toHaveBeenCalled();
});
it('missing support inbox skips all delivery', async () => {
  mocks.settings.mockResolvedValue({ site_name: 'Fixture School' }); vi.stubEnv('SUPPORT_INBOX_EMAIL', '');
  await notifyAdminOfNewTicket(params); expect(fetch).not.toHaveBeenCalled();
});
it('uses the locale of the active administrator matching the support inbox', async () => {
  mocks.rpc.mockResolvedValue({ data: 'fixture-admin-user', error: null });
  mocks.profile.mockResolvedValue({ data: { role: 'admin', status: 'active' }, error: null });
  mocks.recipientLocale.mockResolvedValue({ locale: 'es', source: 'profile' });

  await notifyAdminOfNewTicket(params);

  const payload = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
  expect(payload.Subject).toBe('[Soporte] Fixture <ticket>');
  expect(payload.Text).toContain('abrió un ticket');
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({ locale: 'es', localeSource: 'profile' }),
  }));
});
it('skips delivery if inbox ownership cannot be checked', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private database detail' } });
  await expect(notifyAdminOfNewTicket(params)).resolves.toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});
