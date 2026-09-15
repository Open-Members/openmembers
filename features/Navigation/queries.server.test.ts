import { beforeEach, expect, it, vi } from 'vitest';

const { result, createAdmin } = vi.hoisted(() => ({
  result: { data: [] as Record<string, unknown>[], error: null as unknown },
  createAdmin: vi.fn(),
}));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: createAdmin }));
import { getCustomMenuItems } from './queries.server';

beforeEach(() => {
  result.error = null;
  createAdmin.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ order: async () => result }) }) }) });
});

it('does not expose unsafe destinations already stored in the database', async () => {
  const row = { id: 'fixture', label: 'Help', url: '/support', icon_name: 'LifeBuoy', sort_order: 0, is_enabled: true };
  result.data = [row, { ...row, id: 'unsafe', url: 'javascript:alert(1)' }, { ...row, id: 'ambiguous', url: '//example.test' }];
  expect(await getCustomMenuItems()).toEqual([{ id: 'fixture', label: 'Help', url: '/support', iconName: 'LifeBuoy', sortOrder: 0, isEnabled: true }]);
});

it('has an empty fallback when optional custom navigation cannot load', async () => {
  result.error = { message: 'unavailable' };
  expect(await getCustomMenuItems()).toEqual([]);
});
