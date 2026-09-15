import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getTenantSettings: vi.fn(),
  resolveRecipientLocale: vi.fn(),
  loadLocalizedTemplateContent: vi.fn(),
  renderPurchaseConfirmed: vi.fn(),
  sendTransactional: vi.fn(),
  notifyEnrollment: vi.fn(),
}));
vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/core/theme/settings', () => ({
  getTenantSettings: mocks.getTenantSettings,
}));
vi.mock('@/core/i18n/recipient-locale.server', () => ({
  resolveRecipientLocale: mocks.resolveRecipientLocale,
}));
vi.mock('@/lib/services/email/resend', () => ({
  sendTransactional: mocks.sendTransactional,
}));
vi.mock('@/lib/services/email/templates', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/services/email/templates')
  >();
  return {
    ...actual,
    loadLocalizedTemplateContent: mocks.loadLocalizedTemplateContent,
    renderPurchaseConfirmed: mocks.renderPurchaseConfirmed,
  };
});
vi.mock('@/features/Enrollment/notifications', () => ({
  notifyEnrollment: mocks.notifyEnrollment,
}));

import { processEnrollment } from './processor';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const request = {
  email: 'member@example.org',
  name: 'Demo Member',
  provider: 'generic' as const,
  transactionId: 'demo-transaction',
  accessLevelId: '22222222-2222-4222-8222-222222222222',
};

function clientFor(existingUser: boolean, lookupError: string | null = null) {
  const profileUpdate = vi.fn();
  const profileBuilder = {
    update: (payload: unknown) => { profileUpdate(payload); return profileBuilder; },
    eq: () => profileBuilder,
    select: () => profileBuilder,
    single: async () => ({ data: { id: USER_ID }, error: null }),
  };
  // Stop before notifications or email: this suite checks the account boundary,
  // while integration tests cover enrollment persistence against the local DB.
  const enrollmentBuilder = {
    upsert: () => enrollmentBuilder,
    select: () => enrollmentBuilder,
    single: async () => ({ data: null, error: { message: 'test enrollment boundary' } }),
  };
  const client = {
    rpc: vi.fn(async (name: string) => name === 'apply_payment_enrollment'
      ? { data: null, error: { message: 'test enrollment boundary' } }
      : { data: existingUser ? USER_ID : null, error: lookupError ? { message: lookupError } : null }),
    auth: { admin: { createUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) } },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileBuilder;
      if (table === 'enrollments') return enrollmentBuilder;
      throw new Error(`Unexpected table access: ${table}`);
    }),
  };
  mocks.createAdminClient.mockReturnValue(client);
  return { client, profileUpdate };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTenantSettings.mockResolvedValue({});
  mocks.resolveRecipientLocale.mockResolvedValue({
    locale: 'en',
    source: 'profile',
  });
  mocks.loadLocalizedTemplateContent.mockResolvedValue({
    subject: 'Purchase confirmed',
  });
  mocks.renderPurchaseConfirmed.mockResolvedValue({
    subject: 'Purchase confirmed',
    html: '<p>Purchase confirmed</p>',
    text: 'Purchase confirmed',
  });
  mocks.sendTransactional.mockResolvedValue({ success: true });
  mocks.notifyEnrollment.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this unit test'); }));
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('enrollment processing preserves account authority', () => {
  it('does not modify the profile of an existing buyer, including role or suspension', async () => {
    const { client, profileUpdate } = clientFor(true);

    await expect(processEnrollment(request)).rejects.toThrow('test enrollment boundary');

    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalledWith('profiles');
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('initializes only display name and password rotation for the new Auth-created profile', async () => {
    const { client, profileUpdate } = clientFor(false);

    await expect(processEnrollment(request)).rejects.toThrow('test enrollment boundary');

    expect(client.auth.admin.createUser).toHaveBeenCalledOnce();
    expect(profileUpdate).toHaveBeenCalledExactlyOnceWith({
      display_name: 'Demo Member',
      must_change_password: true,
    });
  });

  it('does not create another account when the existing-user lookup fails', async () => {
    const { client } = clientFor(false, 'lookup unavailable');

    await expect(processEnrollment(request)).rejects.toThrow('Failed to find user');

    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('reports a resolved delivery failure while preserving the committed enrollment', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = {
      rpc: vi.fn(async (name: string) => {
        if (name === 'get_user_id_by_email') {
          return { data: USER_ID, error: null };
        }
        if (name === 'apply_payment_enrollment') {
          return {
            data: {
              enrollment_id: '33333333-3333-4333-8333-333333333333',
              duplicate: false,
            },
            error: null,
          };
        }
        throw new Error(`Unexpected RPC: ${name}`);
      }),
      auth: { admin: { createUser: vi.fn() } },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => table === 'access_levels'
            ? {
                maybeSingle: async () => ({
                  data: { name: 'Demo access' },
                  error: null,
                }),
              }
            : Promise.resolve({
                data: [{ course: { title: 'Demo course', slug: 'demo-course' } }],
                error: null,
              }),
        }),
      })),
    };
    mocks.createAdminClient.mockReturnValue(client);
    mocks.sendTransactional.mockResolvedValue({
      success: false,
      error: 'Fictitious delivery failure',
    });

    await expect(processEnrollment(request)).resolves.toEqual({
      userId: USER_ID,
      enrollmentId: '33333333-3333-4333-8333-333333333333',
      isNewUser: false,
      accessLevelId: request.accessLevelId,
    });
    expect(consoleError).toHaveBeenCalledWith('[enrollment] Email delivery failed');
    expect(mocks.notifyEnrollment).toHaveBeenCalledOnce();
  });
});
