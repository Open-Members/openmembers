import { describe, expect, it, vi } from 'vitest';
import { MAX_COMPLETE_READ_ROWS } from '@/core/supabase/read-all';
import { paged, pagedForIds, ReportReadError } from './report-reads';

describe('report read boundary', () => {
  it('conceals provider and transport diagnostics', async () => {
    await expect(paged(async () => {
      throw new Error('PRIVATE transport diagnostic');
    }, () => 'id')).rejects.toEqual(new ReportReadError());
  });

  it('deduplicates filter IDs and preserves all composite keys across bounded filters', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `lesson-${index}`);
    const fetchPage = vi.fn(async (batch: string[]) => ({
      data: batch.map(lesson_id => ({ lesson_id, user_id: 'same-student' })),
      error: null,
      count: batch.length,
    }));
    const result = await pagedForIds([...ids, ids[0]], fetchPage,
      row => JSON.stringify([row.lesson_id, row.user_id]));
    expect(result.data).toHaveLength(101);
    expect(fetchPage.mock.calls.map(([batch]) => batch.length)).toEqual([100, 1]);
  });

  it('rejects a repeated row across different ID filters', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => String(index));
    await expect(pagedForIds(ids, async () => ({
      data: [{ id: 'duplicate' }], error: null, count: 1,
    }), row => row.id)).rejects.toEqual(new ReportReadError());
  });

  it('enforces the 100,000-row ceiling across filters rather than per filter only', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => String(index));
    const rows = Array.from({ length: MAX_COMPLETE_READ_ROWS }, (_, index) => ({ id: `row-${index}` }));
    const fetchPage = vi.fn(async (batch: string[], from: number, to: number) => {
      const data = batch[0] === '0' ? rows : [{ id: 'overflow' }];
      return { data: data.slice(from, to + 1), count: data.length, error: null };
    });
    await expect(pagedForIds(ids, fetchPage, row => row.id)).rejects.toEqual(new ReportReadError());
    expect(fetchPage.mock.calls.at(-1)?.[0]).toEqual(['100']);
  });

  it('returns an empty result without contacting the provider for empty filters', async () => {
    const fetchPage = vi.fn();
    expect(await pagedForIds([], fetchPage, () => 'unused')).toEqual({ data: [] });
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
