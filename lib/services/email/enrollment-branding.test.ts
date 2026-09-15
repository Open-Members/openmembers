import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getTenantSettings: vi.fn(),
  getInstallationConfig: vi.fn(),
  sendTransactional: vi.fn(),
  recipientLocale: vi.fn(),
  loadTemplate: vi.fn(),
}));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/core/theme/settings', () => ({ getTenantSettings: mocks.getTenantSettings }));
vi.mock('@/core/config/installation.server', () => ({ getInstallationConfig: mocks.getInstallationConfig }));
vi.mock('@/lib/services/email/resend', () => ({ sendTransactional: mocks.sendTransactional }));
vi.mock('@/core/i18n/recipient-locale.server', () => ({ resolveRecipientLocale: mocks.recipientLocale }));
vi.mock('@/features/Enrollment/notifications', () => ({ notifyEnrollment: vi.fn() }));
vi.mock('@/lib/services/email/templates/load', () => ({
  loadLocalizedTemplateContent: mocks.loadTemplate,
  saveTemplateContent: vi.fn(),
  resetTemplateContent: vi.fn(),
}));

import { sendEnrollmentEmail } from '@/lib/webhooks/processor';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://academy.example.test');
  vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', 'https://legacy.example.test/community');
  vi.stubEnv('MEMBERSHIP_HELP_URL', 'https://legacy.example.test/help');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Email provider and asset requests are forbidden'); }));
  mocks.sendTransactional.mockReset().mockResolvedValue({ success: true });
  mocks.recipientLocale.mockReset().mockResolvedValue({ locale: 'pt', source: 'profile' });
  mocks.loadTemplate.mockReset().mockImplementation(async (templateKey: string, locale: 'en' | 'pt' | 'es') => {
    const { EMAIL_TEMPLATE_DEFAULTS } = await import('./templates/localization');
    return EMAIL_TEMPLATE_DEFAULTS[templateKey as keyof typeof EMAIL_TEMPLATE_DEFAULTS][locale];
  });
  mocks.getTenantSettings.mockResolvedValue({
    site_name: 'Aurora Academy', primary_color: '#185c37',
    logo_light_url: '/brand/aurora.svg', logo_url: '/legacy.svg', logo_dark_url: null,
  });
  mocks.getInstallationConfig.mockResolvedValue({ links: { community: '/community', help: '/help' } });
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('enrollment email producers pass resolved installation branding', () => {
  it.each([
    { name: 'membership', courses: 2, newUser: true, key: 'membership_welcome' },
    { name: 'new course member', courses: 1, newUser: true, key: 'welcome_with_password' },
    { name: 'existing course member', courses: 1, newUser: false, key: 'purchase_confirmed' },
  ])('$name uses the current brand before the mocked delivery boundary', async ({ courses, newUser, key }) => {
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => table === 'access_levels'
            ? { maybeSingle: async () => ({ data: { name: 'Demo Membership' } }) }
            : Promise.resolve({ data: Array.from({ length: courses }, (_, index) => ({ course: { title: `Course ${index}`, slug: `course-${index}` } })) }),
        }),
      }),
    });
    const request = {
      userId: '11111111-1111-4111-8111-111111111111',
      accessLevelId: '22222222-2222-4222-8222-222222222222',
      email: 'member@example.test', name: 'Demo Member',
      isNewUser: newUser, tempPassword: newUser ? 'Fictitious-email-demo-only' : null,
    };
    expect(await sendEnrollmentEmail(request)).toEqual({ success: true });
    expect(mocks.sendTransactional).toHaveBeenCalledOnce();
    mocks.sendTransactional.mockResolvedValueOnce({ success: false, error: 'Fictitious delivery failure' });
    expect(await sendEnrollmentEmail(request)).toEqual({ success: false, error: 'Fictitious delivery failure' });
    const rendered = mocks.sendTransactional.mock.calls[0][0];
    expect(rendered.templateKey).toBe(key);
    expect(rendered.metadata).toMatchObject({ locale: 'pt', localeSource: 'profile' });
    expect(rendered.subject).not.toMatch(/Welcome|unlocked/);
    expect(rendered.html).toContain('Aurora Academy');
    expect(rendered.html).toContain('src="https://academy.example.test/brand/aurora.svg"');
    expect(rendered.html).toContain('background-color:#185c37');
    if (courses > 1) {
      expect(rendered.html).toContain('href="https://academy.example.test/community"');
      expect(rendered.html).toContain('href="https://academy.example.test/help"');
      expect(rendered.html).not.toContain('legacy.example.test');
    }
  });

  it.each(['access_levels', 'access_level_courses'])(
    'stops before delivery when the %s context read fails',
    async (failedTable) => {
      mocks.createAdminClient.mockReturnValue({
        from: (table: string) => ({
          select: () => ({
            eq: () => {
              if (table === 'access_levels') {
                return {
                  maybeSingle: async () =>
                    failedTable === table
                      ? { data: null, error: { message: 'PRIVATE diagnostic' } }
                      : { data: { name: 'Demo Membership' }, error: null },
                };
              }
              return Promise.resolve(
                failedTable === table
                  ? { data: null, error: { message: 'PRIVATE diagnostic' } }
                  : { data: [], error: null },
              );
            },
          }),
        }),
      });

      await expect(
        sendEnrollmentEmail({
          userId: '11111111-1111-4111-8111-111111111111',
          accessLevelId: '22222222-2222-4222-8222-222222222222',
          email: 'member@example.test',
          name: 'Demo Member',
          isNewUser: false,
          tempPassword: null,
        }),
      ).rejects.toThrow('enrollmentEmailContextUnavailable');
      expect(mocks.sendTransactional).not.toHaveBeenCalled();
    },
  );
});
