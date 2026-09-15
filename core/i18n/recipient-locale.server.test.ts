// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { resolveRecipientLocale } from './recipient-locale.server';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.maybeSingle,
    })),
  });
  mocks.maybeSingle.mockResolvedValue({
    data: { preferred_locale: null },
    error: null,
  });
});

describe('resolveRecipientLocale', () => {
  it.each(['en', 'pt', 'es'] as const)('gives a saved %s preference precedence over the hint', async (locale) => {
    mocks.maybeSingle.mockResolvedValue({ data: { preferred_locale: locale }, error: null });
    await expect(resolveRecipientLocale('fixture-user', 'es')).resolves.toEqual({
      locale,
      source: 'profile',
    });
  });

  it.each([null, { preferred_locale: null }, { preferred_locale: 'invalid' }])(
    'uses a valid hint when the profile preference is absent: %j',
    async (data) => {
      mocks.maybeSingle.mockResolvedValue({ data, error: null });
      await expect(resolveRecipientLocale('fixture-user', 'pt')).resolves.toEqual({
        locale: 'pt',
        source: 'hint',
      });
    },
  );

  it.each([undefined, null, 'invalid'])('uses the default for an invalid or missing hint: %j', async (hint) => {
    await expect(resolveRecipientLocale('fixture-user', hint)).resolves.toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it.each(['provider', 'transport'] as const)('does not turn a %s failure into a locale', async (failure) => {
    if (failure === 'provider') {
      mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'PRIVATE' } });
    } else {
      mocks.maybeSingle.mockRejectedValue(new Error('PRIVATE'));
    }
    await expect(resolveRecipientLocale('fixture-user', 'pt')).rejects.toThrow(/^localeReadFailed$/);
  });
});
