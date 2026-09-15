/** Bounded, complete reads for administrative arrays; callers provide a unique order. */
export const READ_PAGE_SIZE = 500;
export const MAX_COMPLETE_READ_ROWS = 100_000;

export class IncompleteReadError extends Error {
  constructor() {
    super('INCOMPLETE_DATABASE_READ');
    this.name = 'IncompleteReadError';
  }
}

interface RowPage<T> {
  data: T[] | null;
  error: unknown;
  count?: number | null;
}

/**
 * fetchPage must request count: 'exact' with a stable, unique order and range.
 * Offset pagination is not a transaction snapshot. Reject detectable changes
 * instead of presenting partial aggregates as complete.
 */
export async function readAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<RowPage<T>>,
  key: (row: T) => string,
): Promise<T[]> {
  const rows: T[] = [];
  const keys = new Set<string>();
  let expected: number | undefined;
  do {
    const page = await fetchPage(rows.length, rows.length + READ_PAGE_SIZE - 1);
    const { data, count } = page;
    if (page.error || !Array.isArray(data) || !Number.isSafeInteger(count) || count == null ||
        count < 0 || count > MAX_COMPLETE_READ_ROWS || data.length > READ_PAGE_SIZE) {
      throw new IncompleteReadError();
    }
    expected ??= count;
    if (count !== expected || rows.length + data.length > expected ||
        (data.length === 0 && rows.length < expected)) {
      throw new IncompleteReadError();
    }
    for (const row of data) {
      const id = key(row);
      if (!id || keys.has(id)) throw new IncompleteReadError();
      keys.add(id);
      rows.push(row);
    }
  } while (rows.length < expected);
  return rows;
}
