import { MAX_COMPLETE_READ_ROWS, readAllRows } from '@/core/supabase/read-all';

export class ReportReadError extends Error {
  constructor() {
    super('REPORT_READ_FAILED');
    this.name = 'ReportReadError';
  }
}

type ReportPage<T> = {
  data: T[] | null;
  error: unknown;
  count?: number | null;
};

// Aggregates require complete inputs. Preserve the report's public error boundary
// when a page fails, changes its count or cannot establish completeness.
export async function paged<T>(
  readPage: (from: number, to: number) => PromiseLike<ReportPage<T>>,
  key: (row: T) => string,
): Promise<{ data: T[] }> {
  try {
    return { data: await readAllRows(readPage, key) };
  } catch {
    throw new ReportReadError();
  }
}

// Bound IN filters as well as response pages: UUID lists can exceed URL limits
// long before a full table reaches the configured PostgREST row cap.
export async function pagedForIds<T>(
  ids: string[],
  readPage: (ids: string[], from: number, to: number) => PromiseLike<ReportPage<T>>,
  key: (row: T) => string,
): Promise<{ data: T[] }> {
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];
  const keys = new Set<string>();
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const batch = uniqueIds.slice(start, start + 100);
    const result = await paged((from, to) => readPage(batch, from, to), key);
    if (rows.length + result.data.length > MAX_COMPLETE_READ_ROWS) {
      throw new ReportReadError();
    }
    for (const row of result.data) {
      const id = key(row);
      if (!id || keys.has(id)) throw new ReportReadError();
      keys.add(id);
      rows.push(row);
    }
  }
  return { data: rows };
}
