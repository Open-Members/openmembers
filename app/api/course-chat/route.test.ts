// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdmin: vi.fn(), getUser: vi.fn(), from: vi.fn(),
  access: vi.fn(), rate: vi.fn(), retrieve: vi.fn(), complete: vi.fn(), stream: vi.fn(),
  adminFrom: vi.fn(), maybeSingle: vi.fn(), adminMaybeSingle: vi.fn(),
}));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }));
vi.mock('@/core/access/server', () => ({ isUserCourseAccessible: mocks.access }));
vi.mock('@/lib/services/ai/course-chat', () => ({
  retrieveContext: mocks.retrieve, checkAndBumpRateLimit: mocks.rate, buildMessages: vi.fn(),
}));
vi.mock('@/lib/services/ai/gateway', () => ({ chatCompletion: mocks.complete, chatCompletionStream: mocks.stream }));

import { POST, GET, PATCH } from './route';
import { GET as list } from './conversations/route';
import { GET as detail, DELETE } from './conversations/[id]/route';

const COURSE = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const config = {
  COURSE_CHAT_ENABLED: 'true', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55431',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fictitious-public-key', SUPABASE_SERVICE_ROLE_KEY: 'fictitious-service-key',
  AI_GATEWAY_API_KEY: 'fictitious-ai-key', DATABASE_URL: 'postgresql://localhost/example', DATABASE_POOL_URL: '',
};
function post(extra = {}) {
  return POST(new Request('https://example.test/api/course-chat', {
    method: 'POST', body: JSON.stringify({ courseId: COURSE, message: 'Explain the demonstration.', ...extra }),
  }));
}
const handlers = [
  ['POST', () => post()],
  ['resume', () => GET(new Request(`https://example.test/api/course-chat?action=resume&courseId=${COURSE}`))],
  ['archive', () => PATCH(new Request('https://example.test/api/course-chat', { method: 'PATCH', body: JSON.stringify({ conversationId: CONVERSATION, action: 'archive' }) }))],
  ['list', () => list(new Request(`https://example.test/api/course-chat/conversations?courseId=${COURSE}`))],
  ['detail', () => detail(new Request('https://example.test'), { params: Promise.resolve({ id: CONVERSATION }) })],
  ['delete', () => DELETE(new Request('https://example.test'), { params: Promise.resolve({ id: CONVERSATION }) })],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'student-id' } } });
  mocks.access.mockResolvedValue(true);
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 29 });
  mocks.retrieve.mockResolvedValue([]);
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.maybeSingle };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
  mocks.from.mockReturnValue(builder);
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  const adminBuilder = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.adminMaybeSingle };
  adminBuilder.select.mockReturnValue(adminBuilder); adminBuilder.eq.mockReturnValue(adminBuilder);
  mocks.adminFrom.mockReturnValue(adminBuilder);
  mocks.createAdmin.mockReturnValue({ from: mocks.adminFrom });
  mocks.adminMaybeSingle.mockResolvedValue({ data: { title: 'Fictitious Course' }, error: null });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe('one disabled mode for every course chat operation', () => {
  it.each(handlers)('%s does not initialize clients when opt-in is off', async (_name, call) => {
    vi.stubEnv('COURSE_CHAT_ENABLED', 'false');
    expect((await call()).status).toBe(503);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it.each(handlers)('%s rejects partial configuration before opening a client', async (_name, call) => {
    vi.stubEnv('AI_GATEWAY_API_KEY', ' ');
    expect((await call()).status).toBe(503);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each(handlers)('%s requires an authenticated session when enabled', async (_name, call) => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await call()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});

describe('authorization and corpus before paid generation', () => {
  it('rejects denied course access before rate, corpus and privileged clients', async () => {
    mocks.access.mockResolvedValue(false);
    expect((await post()).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith('student-id', COURSE);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
  it('enforces the generation budget before context and provider calls', async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0 });
    const response = await post();
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: 'rate_limited' });
    expect(response.headers.get('retry-after')).toBe('3600');
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('rejects a conversation unavailable to the caller before privileged retrieval', async () => {
    expect((await post({ conversationId: CONVERSATION })).status).toBe(404);
    const builder = mocks.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'student-id');
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
  it('rejects an owned conversation for another course', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: CONVERSATION, course_id: 'another-course' } });
    expect((await post({ conversationId: CONVERSATION })).status).toBe(404);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it('returns an explicit empty-corpus state without creating conversation or generating text', async () => {
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'context_unavailable' });
    expect(mocks.retrieve).toHaveBeenCalledWith(COURSE, 'Explain the demonstration.', expect.anything(), expect.objectContaining({ topK: 5 }));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('does not expose internal database/provider errors', async () => {
    const internal = 'private provider response with confidential payload';
    mocks.retrieve.mockRejectedValueOnce(new Error(internal));
    const response = await post();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(internal);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(internal);
  });
  it('scans supplied history as well as the current question for credentials', async () => {
    const response = await post({ history: [{ role: 'user', content: ['-----BEGIN ', 'PRIVATE KEY', '-----'].join('') }] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'secret_detected' });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it('uses stable validation errors before clients or providers initialize', async () => {
    const response = await post({ message: '' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'validation_failed' });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('uses a stable error for invalid JSON before clients initialize', async () => {
    const response = await POST(new Request('https://example.test/api/course-chat', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('validates resume course IDs before contacting Supabase', async () => {
    expect((await GET(new Request('https://example.test/api/course-chat?action=resume&courseId=bad'))).status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('streams a controlled reply only after access, ownership and corpus checks, then saves the assistant reply', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: CONVERSATION, course_id: COURSE, title: 'Existing title', is_archived: false } });
    const userInsert = vi.fn().mockResolvedValue({ error: null });
    const sessionBuilder = mocks.from.getMockImplementation()!();
    sessionBuilder.insert = userInsert;
    sessionBuilder.update = vi.fn().mockReturnValue(sessionBuilder);
    const assistantInsert = vi.fn().mockResolvedValue({ error: null });
    const adminBuilder = mocks.adminFrom.getMockImplementation()!();
    adminBuilder.insert = assistantInsert;
    mocks.retrieve.mockResolvedValue([{
      lesson_id: '33333333-3333-4333-8333-333333333333', lesson_title: 'Fictitious lesson',
      lesson_slug: 'demo', course_slug: 'demo-course', start_seconds: 0, end_seconds: 30,
      similarity: 0.8, text: 'Fictitious authorized material',
    }]);
    mocks.stream.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"A controlled reply."}}]}\n\ndata: [DONE]\n\n'));
    const response = await post({ conversationId: CONVERSATION });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    expect(events.map(event => event.type)).toEqual(['citations', 'delta', 'done']);
    expect(events[1].content).toBe('A controlled reply.');
    expect(events[2].conversation_id).toBe(CONVERSATION);
    expect(userInsert).toHaveBeenCalledWith({ conversation_id: CONVERSATION, role: 'user', content: 'Explain the demonstration.' });
    expect(assistantInsert).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: CONVERSATION, role: 'assistant', content: 'A controlled reply.' }));
    expect(mocks.access.mock.invocationCallOrder[0]).toBeLessThan(mocks.retrieve.mock.invocationCallOrder[0]);
    expect(mocks.retrieve.mock.invocationCallOrder[0]).toBeLessThan(mocks.stream.mock.invocationCallOrder[0]);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('does not expose private provider failures in an interrupted stream', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: CONVERSATION, course_id: COURSE, is_archived: false } });
    const builder = mocks.from.getMockImplementation()!();
    builder.insert = vi.fn().mockResolvedValue({ error: null });
    mocks.retrieve.mockResolvedValue([{ lesson_id: 'demo', lesson_title: 'Fictitious material' }]);
    const privateMessage = 'private provider response';
    mocks.stream.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.error(new Error(privateMessage)); } })));
    const response = await post({ conversationId: CONVERSATION });
    const text = await response.text();
    expect(text).toContain('stream_interrupted');
    expect(text).not.toContain(privateMessage);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
