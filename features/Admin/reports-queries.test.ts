import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/core/access/admin', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  getReportsData,
  ReportReadError,
  resolvePeriod,
  type EmailBounceRow,
} from './reports-queries';

function failedClient(
  onSelect?: (table: string, columns: string | undefined) => void,
) {
  const result = { data: null, count: null, error: { message: 'PRIVATE database error' } };
  const builder: Record<string, unknown> = {};
  let currentTable = '';
  for (const method of ['in', 'gte', 'lt', 'lte', 'eq', 'not', 'order', 'limit', 'range']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.select = vi.fn((columns?: string) => {
    onSelect?.(currentTable, columns);
    return builder;
  });
  builder.then = (resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return {
    from: vi.fn((table: string) => {
      currentTable = table;
      return builder;
    }),
    auth: { admin: { listUsers: vi.fn().mockResolvedValue(result) } },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({});
  mocks.createAdminClient.mockImplementation(failedClient);
});

describe('report query boundary', () => {
  it('requires an administrator before creating a service client', async () => {
    const denied = new Error('FORBIDDEN');
    mocks.requireAdmin.mockRejectedValue(denied);
    await expect(getReportsData()).rejects.toBe(denied);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('does not turn a failed database read into zero metrics', async () => {
    await expect(getReportsData()).rejects.toBeInstanceOf(ReportReadError);
  });

  it('keeps provider diagnostics outside the report query and DTO', async () => {
    const emailSelections: string[] = [];
    mocks.createAdminClient.mockImplementation(() =>
      failedClient((table, columns) => {
        if (table === 'email_events' && columns) {
          emailSelections.push(columns);
        }
      }),
    );

    await expect(getReportsData()).rejects.toBeInstanceOf(ReportReadError);

    expect(emailSelections).toContain(
      'email, event_type, subject, occurred_at',
    );
    expect(
      emailSelections.some((columns) =>
        columns.split(',').some((column) => column.trim() === 'reason'),
      ),
    ).toBe(false);

    type DtoContainsReason = 'reason' extends keyof EmailBounceRow
      ? true
      : false;
    const dtoContainsReason: DtoContainsReason = false;
    expect(dtoContainsReason).toBe(false);
  });

  it('keeps custom query bounds as explicit UTC instants', () => {
    const period = resolvePeriod('custom', {
      from: '2026-09-01',
      to: '2026-09-03',
    });
    expect(period.key).toBe('custom');
    expect(period.from).toBe('2026-09-01T00:00:00.000Z');
    expect(period.to).toBe('2026-09-03T00:00:00.000Z');
  });

  it('resolves calendar months from the explicit UTC clock', () => {
    const now = new Date('2026-03-31T23:30:00.000-03:00');
    const current = resolvePeriod('month', undefined, now);
    const previous = resolvePeriod('last_month', undefined, now);

    expect(current).toEqual({
      key: 'month',
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-01T02:30:00.000Z',
      previousFrom: '2026-03-01T00:00:00.000Z',
      previousTo: '2026-04-01T00:00:00.000Z',
    });
    expect(previous).toEqual({
      key: 'last_month',
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
      previousFrom: '2026-02-01T00:00:00.000Z',
      previousTo: '2026-03-01T00:00:00.000Z',
    });
  });

  it('falls back deterministically when a custom civil date is invalid', () => {
    const now = new Date('2026-09-13T12:00:00.000Z');
    const period = resolvePeriod(
      'custom',
      { from: '2026-02-30', to: '2026-03-02' },
      now,
    );

    expect(period.key).toBe('30d');
    expect(period.to).toBe(now.toISOString());
    expect(period.from).toBe('2026-08-14T12:00:00.000Z');
  });
});
