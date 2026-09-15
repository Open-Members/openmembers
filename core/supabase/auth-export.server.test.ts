// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { readProfileAuthUsers } from './auth-export.server';
import { IncompleteReadError, MAX_COMPLETE_READ_ROWS } from './read-all';

it('resolves a profile on page 11 through the installed Auth SDK despite truncated page links', async () => {
  const users = Array.from({ length: 5001 }, (_, i) => ({ id: `user-${i}`, email: `user-${i}@example.test` }));
  const pages: number[] = [];
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const page = Number(url.searchParams.get('page'));
    const size = Number(url.searchParams.get('per_page'));
    pages.push(page);
    expect(size).toBe(500);
    return Response.json({ users: users.slice((page - 1) * size, page * size) }, {
      headers: { 'x-total-count': '5001', link: '<https://database.example.test/auth/v1/admin/users?page=11>; rel="last"' },
    });
  });
  const client = createClient('https://database.example.test', 'fictitious-export-sdk-key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport },
  });
  expect((await readProfileAuthUsers(client.auth.admin, ['user-5000'])).get('user-5000')?.email)
    .toBe('user-5000@example.test');
  expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

it('continues past short pages with missing totals until every required profile is matched', async () => {
  const listUsers = vi.fn()
    .mockResolvedValueOnce({ data: { users: [{ id: 'unrelated' }] }, error: null })
    .mockResolvedValueOnce({ data: { users: [{ id: 'profile', email: 'profile@example.test' }] }, error: null });
  const result = await readProfileAuthUsers({ listUsers }, ['profile', 'profile']);
  expect([...result.keys()]).toEqual(['profile']);
  expect(listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 500 });
});

it.each([
  { data: { users: [{ id: 'unrelated' }], total: 2 }, error: null },
  { data: { users: [{ id: 'profile' }], total: 3 }, error: null },
  { data: { users: [] }, error: null },
  { data: null, error: { message: 'fictitious late Auth failure' } },
])('refuses duplicate, changed, empty or failed later Auth pages', async next => {
  const listUsers = vi.fn()
    .mockResolvedValueOnce({ data: { users: [{ id: 'unrelated' }], total: 2 }, error: null })
    .mockResolvedValueOnce(next);
  await expect(readProfileAuthUsers({ listUsers }, ['profile'])).rejects.toBeInstanceOf(IncompleteReadError);
  expect(listUsers).toHaveBeenCalledTimes(2);
});

it('does not read Auth for an empty export and rejects a profile set above the bound', async () => {
  const listUsers = vi.fn();
  expect((await readProfileAuthUsers({ listUsers }, [])).size).toBe(0);
  await expect(readProfileAuthUsers({ listUsers }, Array.from({ length: MAX_COMPLETE_READ_ROWS + 1 }, (_, i) => `profile-${i}`)))
    .rejects.toBeInstanceOf(IncompleteReadError);
  expect(listUsers).not.toHaveBeenCalled();
});

it('stops scanning Auth at the bound if required profiles never appear', async () => {
  const listUsers = vi.fn().mockImplementation(async ({ page, perPage }: { page: number; perPage: number }) => ({
    data: { users: Array.from({ length: perPage }, (_, i) => ({ id: `unrelated-${page}-${i}` })) }, error: null,
  }));
  await expect(readProfileAuthUsers({ listUsers }, ['missing-profile']))
    .rejects.toBeInstanceOf(IncompleteReadError);
  expect(listUsers).toHaveBeenCalledTimes(MAX_COMPLETE_READ_ROWS / 500 + 1);
});
