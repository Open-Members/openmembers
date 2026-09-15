// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@/core/access/admin', () => ({
  requireAdmin: mocks.requireAdmin,
  requireManageableUser: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getAdminWebhookConfigs } from './actions';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.requireAdmin.mockResolvedValue({
    supabase: {
      from: vi.fn(() => ({ select: mocks.select })),
    },
  });
});
it('returns URL tokens only for the provider whose credential belongs in its URL', async () => {
  mocks.order.mockResolvedValue({
    data: ['stripe', 'guru', 'generic'].map((provider) => ({
      id: `${provider}-config`,
      provider,
      name: provider,
      access_level_id: null,
      expiration_days: null,
      is_active: true,
      created_at: '2026-09-12T12:00:00Z',
      secret_key: `PRIVATE-${provider}-credential`,
      expected_producer_id: null,
      access_levels: null,
    })),
    error: null,
  });

  const configs = await getAdminWebhookConfigs();

  expect(configs.find(({ provider }) => provider === 'stripe')?.urlToken).toBeNull();
  expect(configs.find(({ provider }) => provider === 'generic')?.urlToken).toBeNull();
  expect(configs.find(({ provider }) => provider === 'guru')?.urlToken).toBe(
    'PRIVATE-guru-credential',
  );
  expect(configs).not.toContainEqual(
    expect.objectContaining({ urlToken: 'PRIVATE-stripe-credential' }),
  );
  expect(configs).not.toContainEqual(
    expect.objectContaining({ urlToken: 'PRIVATE-generic-credential' }),
  );
});
