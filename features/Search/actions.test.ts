import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), search: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('./queries.server', () => ({ searchGlobal: mocks.search }));
import { searchGlobalAction } from './actions';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'student' } }, error: null });
  mocks.search.mockResolvedValue({ query: 'Ação', courses: [], lessons: [] });
});

describe('search action contracts', () => {
  it('uses the verified session and preserves the query', async () => {
    await searchGlobalAction('Ação');
    expect(mocks.search).toHaveBeenCalledWith('Ação', 'student');
  });
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: 'untrusted' } }, error: { message: 'private diagnostic' } },
  ])('falls back to the public catalog for an unverified session', async session => {
    mocks.getUser.mockResolvedValue(session);
    await searchGlobalAction('Ação');
    expect(mocks.search).toHaveBeenCalledWith('Ação', null);
  });
  it.each(['createClient', 'getUser', 'search'] as const)('returns a safe code when %s throws', async operation => {
    mocks[operation].mockRejectedValue(new Error('private diagnostic'));
    expect(await searchGlobalAction('Ação')).toEqual({ query: 'Ação', courses: [], lessons: [], error: 'searchFailed' });
  });
});
