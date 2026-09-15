// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(), delivery: vi.fn(), send: vi.fn(), cooldown: vi.fn(), settings: vi.fn(),
  recipientLocale: vi.fn(), templateOverride: vi.fn(),
}));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/webhooks/delivery', () => ({ executeWebhookDelivery: mocks.delivery }));
vi.mock('@/lib/services/email/resend', () => ({ sendTransactional: mocks.send, wasRecentlySent: mocks.cooldown }));
vi.mock('@/core/theme/settings', () => ({ getTenantSettings: mocks.settings }));
vi.mock('@/core/i18n/recipient-locale.server', () => ({ resolveRecipientLocale: mocks.recipientLocale }));
vi.mock('@/lib/services/email/templates/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/email/templates/load')>()),
  loadTemplateOverride: mocks.templateOverride,
}));
import { GET as drip } from '@/app/api/cron/drip-check/route';
import { GET as warning } from '@/app/api/cron/expiration-warning-7d/route';
import { GET as expire } from '@/app/api/cron/expire-enrollments/route';
import { GET as cleanup } from '@/app/api/cron/webhook-cleanup/route';
import { GET as retry } from '@/app/api/cron/webhook-retry/route';
import { NextRequest } from 'next/server';
import { canonicalDripRules, type DripRule, dripRecipients, runDripCheck } from './drip';

const handlers = { drip, warning, expire, cleanup, retry };
const request = (token = 'fixture-cron') => new NextRequest('http://localhost/api/cron/fixture', { headers: { authorization: `Bearer ${token}` } });
function query(result: unknown) {
  const value: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ['select','update','delete','insert','upsert','eq','lt','lte','gte','gt','or','in','limit','order','range','maybeSingle','single']) value[key] = vi.fn().mockReturnValue(value);
  value.then = vi.fn((resolve: (result: unknown) => unknown) => Promise.resolve(resolve(result)));
  return value;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'fixture-cron'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55431'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-admin');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://academy.example.test'); vi.stubEnv('EMAIL_TRANSPORT', 'resend'); vi.stubEnv('RESEND_API_KEY', 'fixture-key');
  mocks.settings.mockResolvedValue({ site_name: 'Fixture School' }); mocks.delivery.mockResolvedValue({ status: 200 }); mocks.send.mockResolvedValue({ success: true }); mocks.cooldown.mockResolvedValue(false);
  mocks.recipientLocale.mockResolvedValue({ locale: 'en', source: 'profile' });
  mocks.templateOverride.mockResolvedValue(null);
  mocks.admin.mockReturnValue({ from: () => query({ data: [], error: null }) });
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe.each(Object.entries(handlers))('%s authorization and failure contract', (_name, handler) => {
  it('requires configured cron auth and never touches data with a bad bearer', async () => {
    expect((await handler(request('wrong'))).status).toBe(401); expect(mocks.admin).not.toHaveBeenCalled();
    vi.stubEnv('CRON_SECRET', ''); expect((await handler(request())).status).toBe(503); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('rejects missing database and reports data errors instead of success', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', ''); expect((await handler(request())).status).toBe(503); expect(mocks.admin).not.toHaveBeenCalled();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-admin'); mocks.admin.mockReturnValue({ from: () => query({ data: null, error: { message: 'fixture failure' } }) });
    expect((await handler(request())).status).toBe(500);
  });
});
it('expiration only updates still-active expired enrollments, making reruns harmless', async () => {
  const builder = query({ data: [{ id: 'fixture' }], error: null }); mocks.admin.mockReturnValue({ from: () => builder });
  expect(await (await expire(request())).json()).toMatchObject({ expired: 1 });
  expect(builder.update).toHaveBeenCalledWith({ is_active: false }); expect(builder.eq).toHaveBeenCalledWith('is_active', true); expect(builder.lt).toHaveBeenCalledWith('expires_at', expect.any(String));
});
it('cleanup only purges expired hits and expired rotation secrets', async () => {
  const builders: Record<string, ReturnType<typeof query>> = {};
  mocks.admin.mockReturnValue({ from: (name: string) => builders[name] = query({ data: [], error: null }) });
  expect((await cleanup(request())).status).toBe(200);
  expect(Object.keys(builders).sort()).toEqual(['webhook_configs', 'webhook_rate_limit_hits']);
  expect(builders.webhook_rate_limit_hits.lt).toHaveBeenCalledWith('hit_at', expect.any(String));
  expect(builders.webhook_configs.update).toHaveBeenCalledWith({ previous_secret_key: null, previous_secret_expires_at: null });
});
const work = { version: 1, provider: 'generic', eventId: 'fixture-refund', eventType: 'refund', action: { kind: 'revoke', transactionId: 'fixture-txn', reason: 'refund' } };
const row = { id: 'fixture-row', payload: work, provider: 'generic', webhook_config_id: 'fixture-config', next_attempt_at: '2026-09-11T00:00:00Z', attempt_count: 0 };
function retryFixture(value = row, outcome = { status: 200 }, updateError = false) {
  const builders: ReturnType<typeof query>[] = [];
  let writes = 0;
  const from = (table: string) => {
    let result;
    if (table === 'webhook_configs') result = { data: { id: 'fixture-config', provider: 'generic', is_active: true }, error: null };
    else result = writes++ === 0 ? { data: [value], error: null } : { data: { id: 'fixture-row' }, error: updateError && writes > 2 ? { message: 'fixture write failure' } : null };
    const builder = query(result); builders.push(builder); return builder;
  };
  mocks.admin.mockReturnValue({ from }); mocks.delivery.mockResolvedValue(outcome); return builders;
}
it('retries authenticated normalized revocations, claims deadline atomically and records completion', async () => {
  const builders = retryFixture(); expect(await (await retry(request())).json()).toMatchObject({ processed: 1 });
  expect(mocks.delivery).toHaveBeenCalledWith(work, expect.objectContaining({ is_active: true }), { enqueueOnFailure: false });
  expect(builders[1].eq).toHaveBeenCalledWith('next_attempt_at', row.next_attempt_at);
  expect(builders.at(-1)?.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'processed', attempt_count: 1 }));
});
it('invalid legacy retry work is abandoned without inferring payment actions', async () => {
  const builders = retryFixture({ ...row, payload: { email: 'student@example.test' } as unknown as typeof work });
  expect(await (await retry(request())).json()).toMatchObject({ abandoned: 1 }); expect(mocks.delivery).not.toHaveBeenCalled();
  expect(builders.at(-1)?.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'abandoned' }));
});
it('temporary delivery failure reschedules and failure to persist state returns 500', async () => {
  const builders = retryFixture(row, { status: 503 }); expect(await (await retry(request())).json()).toMatchObject({ rescheduled: 1 });
  expect(builders.at(-1)?.update).toHaveBeenCalledWith(expect.objectContaining({ attempt_count: 1, next_attempt_at: expect.any(String) }));
  retryFixture(row, { status: 200 }, true); expect((await retry(request())).status).toBe(500);
});
it('expiration email partial failure returns 503 with a stable enrollment identity', async () => {
  const enrollment = { id: 'fixture-enrollment', user_id: 'fixture-user', access_level_id: 'fixture-level', expires_at: '2026-09-18T12:00:00Z' };
  mocks.admin.mockReturnValue({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'student@example.test' } } }) } },
    from: (table: string) => query({ data: table === 'enrollments' ? [enrollment] : table === 'profiles' ? { display_name: 'Fixture Student', status: 'active' } : { course: { title: 'Fixture course', slug: 'fixture-course', checkout_url: null } }, error: null }),
  });
  mocks.send.mockResolvedValue({ success: false });
  mocks.recipientLocale.mockResolvedValue({ locale: 'pt', source: 'profile' });
  expect((await warning(request())).status).toBe(503);
  expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(`expiration/${enrollment.id}/${enrollment.expires_at}`);
  expect(mocks.send.mock.calls[0][0].subject).toContain('Seu acesso');
  expect(mocks.send.mock.calls[0][0].metadata).toMatchObject({ locale: 'pt', localeSource: 'profile' });
  expect(mocks.cooldown.mock.calls[0][3]).toBeInstanceOf(Date);
});
it('expiration warning does not send defaults when the global override read fails', async () => {
  mocks.admin.mockReturnValue({ from: () => query({ data: [{ id: 'fixture' }], error: null }) });
  mocks.templateOverride.mockRejectedValue(new Error('loadFailed'));
  expect((await warning(request())).status).toBe(500);
  expect(mocks.send).not.toHaveBeenCalled();
});
it('drip respects actual time, catches up for seven days and uses earliest qualifying enrollment', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  const enrollments = [{ user_id: 'fixture', enrolled_at: '2026-09-05T13:00:00Z' }, { user_id: 'fixture', enrolled_at: '2026-09-01T12:00:00Z' }];
  expect(dripRecipients({ rule_type: 'fixed_date', fixed_date: '2026-09-11T13:00:00Z', days_after: null }, enrollments, now)).toEqual([]);
  expect(dripRecipients({ rule_type: 'days_after_enrollment', fixed_date: null, days_after: 7 }, enrollments, now)).toEqual([{ userId: 'fixture', unlockAt: '2026-09-08T12:00:00.000Z' }]);
  expect(dripRecipients({ rule_type: 'fixed_date', fixed_date: '2026-09-01T13:00:00Z', days_after: null }, enrollments, now)).toEqual([]);
});
it('drip ignores duplicate writes and only queries active unexpired access', async () => {
  let inserted = false; const builders: Record<string, ReturnType<typeof query>[]> = {};
  mocks.admin.mockReturnValue({ from: (table: string) => {
    const rows: Record<string, unknown> = {
      drip_rules: [{ id: 'fixture-rule', course_id: 'fixture-course', rule_type: 'fixed_date', fixed_date: '2026-09-11T10:00:00Z' }],
      courses: { title: 'Fixture course', slug: 'fixture-course', is_published: true }, access_level_courses: [{ access_level_id: 'fixture-level' }],
      enrollments: [{ user_id: 'fixture-user', enrolled_at: '2026-09-01T00:00:00Z' }], notifications: inserted ? [] : [{ id: 'fixture-notification' }],
    };
    if (table === 'notifications') inserted = true;
    const builder = query({ data: rows[table], error: null }); (builders[table] ??= []).push(builder); return builder;
  } });
  const now = new Date('2026-09-11T12:00:00Z'); expect((await runDripCheck(now)).notified).toBe(1); expect((await runDripCheck(now)).notified).toBe(0);
  expect(builders.enrollments[0].eq).toHaveBeenCalledWith('profile.status', 'active'); expect(builders.enrollments[0].or).toHaveBeenCalledWith('expires_at.is.null,expires_at.gt.2026-09-11T12:00:00.000Z');
  expect(builders.notifications[0].upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
  expect(builders.notifications[0].upsert.mock.calls[0][0][0]).toMatchObject({
    message_key: 'content.dripCourse',
    message_params: { courseTitle: 'Fixture course' },
    title: 'New content in Fixture course',
    message: 'Fresh content is waiting for you in Fixture course.',
  });
});

it('canonical rules skip later competing rules for the same lesson/module/course', () => {
  const common = { course_id: 'fixture-course', module_id: null, lesson_id: null, rule_type: 'fixed_date', fixed_date: '2026-09-15T00:00:00Z', days_after: null };
  const first: DripRule = { ...common, id: 'first' };
  const later: DripRule = { ...common, id: 'later', fixed_date: '2026-09-11T00:00:00Z' };
  const lesson: DripRule = { ...common, id: 'lesson', lesson_id: 'fixture-lesson' };
  expect(canonicalDripRules([first, later, lesson])).toEqual([first, lesson]);
});
it('coming-soon courses produce no drip notifications even if their date passed', async () => {
  const queried: string[] = [];
  mocks.admin.mockReturnValue({ from: (table: string) => {
    queried.push(table);
    return query({ data: table === 'drip_rules' ? [{ id: 'fixture-rule', course_id: 'fixture-course', rule_type: 'fixed_date', fixed_date: '2026-09-11T10:00:00Z' }] : { title: 'Fixture course', slug: 'fixture', is_published: true, is_coming_soon: true }, error: null });
  } });
  expect((await runDripCheck(new Date('2026-09-11T12:00:00Z'))).notified).toBe(0);
  expect(queried).toEqual(['drip_rules', 'courses']);
});

it('expiration warnings read beyond the PostgREST maximum instead of repeatedly skipping the first page', async () => {
  const builders: ReturnType<typeof query>[] = [];
  let page = 0;
  mocks.admin.mockReturnValue({ from: () => {
    const count = page++ < 2 ? 500 : 1;
    const builder = query({ data: Array.from({ length: count }, (_, index) => ({ id: `fixture-${page}-${index}`, user_id: `fixture-user-${page}-${index}` })), error: null });
    builders.push(builder); return builder;
  } });
  mocks.cooldown.mockResolvedValue(true);
  const response = await warning(request()); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ total: 1001, skipped: 1001 });
  expect(builders.map(builder => builder.range.mock.calls[0])).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  expect(mocks.send).not.toHaveBeenCalled();
});
