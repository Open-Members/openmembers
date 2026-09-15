import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ query: vi.fn(), embedOne: vi.fn(), Pool: vi.fn() }));
vi.mock('pg', () => ({
  Pool: class {
    constructor() { mocks.Pool(); }
    query = mocks.query;
  },
}));
vi.mock('./gateway', () => ({ embedOne: mocks.embedOne }));

import { retrieveContext } from './course-chat';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const OPEN_LESSON = '22222222-2222-4222-8222-222222222222';
const LOCKED_LESSON = '33333333-3333-4333-8333-333333333333';

function sessionWith(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { session: { from } as unknown as SupabaseClient, from, select, eq };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DATABASE_URL', 'postgres://demo:demo@127.0.0.1:54322/demo');
  vi.stubEnv('DATABASE_POOL_URL', '');
  mocks.embedOne.mockResolvedValue([0.1, 0.2]);
  mocks.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }).mockResolvedValue({ rows: [] });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this unit test'); }));
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('course context follows session-visible lesson access', () => {
  it('binds the session-visible lesson IDs as a mandatory SQL filter before ranking', async () => {
    const { session, from, select, eq } = sessionWith({ data: [{ id: OPEN_LESSON }], error: null });
    const chunk = { lesson_id: OPEN_LESSON, text: 'Fictitious lesson excerpt' };
    mocks.query.mockReset().mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }).mockResolvedValueOnce({ rows: [chunk] });

    expect(await retrieveContext(COURSE_ID, 'Continue the example', session, {
      priorUserMessage: 'Explain the example', topK: 3,
    })).toEqual([chunk]);

    expect(from).toHaveBeenCalledExactlyOnceWith('lessons');
    expect(select).toHaveBeenCalledExactlyOnceWith('id, modules!inner(course_id)');
    expect(eq).toHaveBeenCalledExactlyOnceWith('modules.course_id', COURSE_ID);
    expect(mocks.embedOne).toHaveBeenCalledExactlyOnceWith('Explain the example\n\nContinue the example');
    const [readinessSql, readinessParameters] = mocks.query.mock.calls[0];
    expect(readinessSql).toContain('lesson_id = ANY($1::uuid[])');
    expect(readinessSql).toContain('embedding IS NOT NULL');
    expect(readinessParameters).toEqual([[OPEN_LESSON]]);
    const [sql, parameters] = mocks.query.mock.calls[1];
    expect(sql).toMatch(/WHERE m\.course_id = \$2 AND l\.id = ANY\(\$4::uuid\[\]\)/);
    expect(parameters).toEqual(['[0.1,0.2]', COURSE_ID, 3, [OPEN_LESSON]]);
    expect(parameters[3]).not.toContain(LOCKED_LESSON);
    expect(sql).not.toContain(OPEN_LESSON);
  });

  it('does not call the embedding provider when authorized lessons have no prepared corpus', async () => {
    const { session } = sessionWith({ data: [{ id: OPEN_LESSON }], error: null });
    mocks.query.mockReset().mockResolvedValue({ rows: [] });
    expect(await retrieveContext(COURSE_ID, 'An unanswered question', session)).toEqual([]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.embedOne).not.toHaveBeenCalled();
  });

  it('does not call the embedding provider when the corpus readiness query fails', async () => {
    const { session } = sessionWith({ data: [{ id: OPEN_LESSON }], error: null });
    mocks.query.mockReset().mockRejectedValue(new Error('Database unavailable'));
    await expect(retrieveContext(COURSE_ID, 'An unanswered question', session)).rejects.toThrow('Database unavailable');
    expect(mocks.embedOne).not.toHaveBeenCalled();
  });

  it('does not generate embeddings or query privileged SQL when no lesson is visible', async () => {
    const { session } = sessionWith({ data: [], error: null });

    expect(await retrieveContext(COURSE_ID, 'Show future lessons', session)).toEqual([]);

    expect(mocks.embedOne).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.Pool).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: 'permission unavailable' } },
    { data: [{ id: OPEN_LESSON }], error: { message: 'partial response' } },
  ])('fails closed when authorization cannot be read', async (result) => {
    const { session } = sessionWith(result);

    await expect(retrieveContext(COURSE_ID, 'Show lessons', session)).rejects.toThrow('Could not authorize course context');

    expect(mocks.embedOne).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.Pool).not.toHaveBeenCalled();
  });
});
