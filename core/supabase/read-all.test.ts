// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { IncompleteReadError, MAX_COMPLETE_READ_ROWS, readAllRows } from './read-all';

const key = (row: { id: string }) => row.id;

describe('complete administrative reads', () => {
  it('reads all 1,203 records through the installed SDK even when the API returns only 127 per page', async () => {
    const rows = Array.from({ length: 1203 }, (_, i) => ({ id: String(i).padStart(5, '0') }));
    const offsets: number[] = [];
    const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit'));
      expect(url.searchParams.get('order')).toBe('id.asc');
      expect(new Headers(init?.headers).get('prefer')).toContain('count=exact');
      expect(limit).toBe(500);
      offsets.push(offset);
      const data = rows.slice(offset, offset + Math.min(limit, 127));
      return Response.json(data, {
        status: 206,
        headers: { 'content-range': `${offset}-${offset + data.length - 1}/${rows.length}` },
      });
    });
    const client = createClient('https://database.example.test', 'fictitious-sdk-test-key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport },
    });
    const result = await readAllRows((from, to) => client.from('profiles')
      .select('id', { count: 'exact' }).order('id').range(from, to), key);
    expect(result).toEqual(rows);
    expect(offsets).toEqual([0, 127, 254, 381, 508, 635, 762, 889, 1016, 1143]);
  });

  it('accepts an explicitly empty result', async () => {
    const page = vi.fn(async () => ({ data: [], count: 0, error: null }));
    expect(await readAllRows(page, key)).toEqual([]);
    expect(page).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, -1, 1.5, NaN, MAX_COMPLETE_READ_ROWS + 1])('rejects absent or invalid totals: %s', async count => {
    await expect(readAllRows(async () => ({ data: [], count, error: null }), key))
      .rejects.toBeInstanceOf(IncompleteReadError);
  });

  it.each([
    { data: [], count: 2, error: null },
    { data: [{ id: 'a' }], count: 0, error: null },
    { data: null, count: 0, error: null },
    { data: [], count: 0, error: { message: 'fictitious database failure' } },
    { data: [{ id: 'a' }, { id: 'a' }], count: 2, error: null },
    { data: [{ id: '' }], count: 1, error: null },
  ])('rejects incomplete, failed or duplicate pages', async result => {
    await expect(readAllRows(async () => result, key)).rejects.toBeInstanceOf(IncompleteReadError);
  });

  it('refuses duplicates across pages and count changes during a read', async () => {
    for (const second of [
      { data: [{ id: 'a' }], count: 2, error: null },
      { data: [{ id: 'b' }], count: 3, error: null },
      { data: null, count: null, error: { message: 'fictitious late failure' } },
    ]) {
      const page = vi.fn().mockResolvedValueOnce({ data: [{ id: 'a' }], count: 2, error: null })
        .mockResolvedValueOnce(second);
      await expect(readAllRows(page, key)).rejects.toBeInstanceOf(IncompleteReadError);
      expect(page).toHaveBeenCalledTimes(2);
    }
  });

  it('supports composite identities without merging rows that share one column', async () => {
    const rows = [{ level: 'a', course: 'x' }, { level: 'a', course: 'y' }];
    expect(await readAllRows(async () => ({ data: rows, count: 2, error: null }),
      row => JSON.stringify([row.level, row.course]))).toEqual(rows);
  });
});
