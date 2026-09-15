import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/core/i18n/locales/en/courseChat.json';
import pt from '@/core/i18n/locales/pt/courseChat.json';
import es from '@/core/i18n/locales/es/courseChat.json';
import CourseChatDrawer from './CourseChatDrawer';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('./SiriOrb', () => ({ default: () => <span aria-hidden="true" /> }));
const catalogs = { en, pt, es };
const CONVERSATION = 'own-conversation';
const AUTHORED = 'Authored answer in English';
const summary = { id: CONVERSATION, title: 'Authored title', preview: null, is_archived: true,
  created_at: '2026-09-01T12:00:00Z', last_message_at: '2026-09-11T12:00:00Z' };
const resumed = { conversation: { id: CONVERSATION }, messages: [{ id: 'assistant', role: 'assistant', content: AUTHORED }] };
const empty = { conversation: null, messages: [] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stream = (events: unknown[]) => new Response(events.map(event => JSON.stringify(event)).join('\n') + '\n');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={{ courseChat: catalogs[locale] }} timeZone="UTC">{children}</NextIntlClientProvider>;
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-12T12:00:00Z').getTime());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(['en', 'pt', 'es'] as const)('Course chat in %s without any provider', locale => {
  const copy = catalogs[locale];
  const t = createTranslator({ locale, messages: copy });
  const options = { wrapper: wrapper(locale) };
  async function open(suggestions?: string[]) {
    render(<CourseChatDrawer courseId="own-course" courseTitle="Authored course" suggestions={suggestions} />, options);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.title })); });
    expect(screen.getByRole('dialog', { name: copy.title })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: copy.input.label })).toBeEnabled());
  }
  async function submit(text = 'Authored question?') {
    fireEvent.change(screen.getByRole('textbox', { name: copy.input.label }), { target: { value: text } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.input.send })); });
  }
  async function history() {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.history.title })); });
  }

  it('localizes defaults and preserves explicitly supplied suggestions', async () => {
    vi.mocked(fetch).mockResolvedValue(json(empty));
    await open(['What are the main topics in this course?']);
    expect(screen.getByText('Authored course')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What are the main topics in this course?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.empty.title })).toBeInTheDocument();
    expect(screen.getByText(copy.empty.description)).toBeInTheDocument();
    if (locale !== 'en') expect(screen.queryByRole('button', { name: copy.suggestions.topics })).toBeNull();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/course-chat?courseId=own-course&action=resume');
  });

  it.each([
    [503, 'not_configured', 'notConfigured'], [409, 'context_unavailable', 'contextUnavailable'],
    [400, 'secret_detected', 'secretDetected'], [400, 'validation_failed', 'invalidQuestion'],
    [429, 'rate_limited', 'rateLimited'], [401, 'PRIVATE diagnostic', 'notAuthenticated'],
    [403, 'PRIVATE diagnostic', 'accessDenied'], [500, 'PRIVATE diagnostic', 'sendFailed'],
    [0, 'transport', 'sendFailed'],
  ] as const)('localizes send failure %s/%s without exposing response prose', async (status, code, key) => {
    vi.mocked(fetch).mockResolvedValueOnce(json(empty));
    if (status) vi.mocked(fetch).mockResolvedValueOnce(json({ error: code, message: 'PRIVATE diagnostic' }, status));
    else vi.mocked(fetch).mockRejectedValueOnce(new Error('PRIVATE network diagnostic'));
    await open();
    expect(screen.getByRole('button', { name: copy.suggestions.topics })).toBeInTheDocument();
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors[key]);
    expect(screen.getByText('Authored question?')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: copy.input.label })).toBeEnabled();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('preserves replies/citations and localizes the remaining budget', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(empty)).mockResolvedValueOnce(stream([
      { type: 'citations', citations: [{ lesson_id: 'lesson', lesson_title: 'Authored lesson', lesson_slug: 'lesson', course_slug: 'course', start_seconds: 30, end_seconds: 50, similarity: 0.8 }] },
      { type: 'delta', content: `${AUTHORED}. [Lesson: "Authored lesson" @ 0:30]` },
      { type: 'done', conversation_id: CONVERSATION, rate_limit: { remaining: 1 } },
    ]));
    await open();
    await submit();
    expect(screen.getByText(`${AUTHORED}.`)).toBeInTheDocument();
    expect(screen.getByText(t('input.remaining', { count: 1 }))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByTitle(copy.citations.jump));
    expect(mocks.push).toHaveBeenCalledWith('/courses/course/lesson?t=30');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['event', 'truncated', 'empty'] as const)('localizes an interrupted or empty %s stream', async failure => {
    const events = failure === 'event' ? [{ type: 'error', error: 'PRIVATE stream diagnostic' }]
      : failure === 'truncated' ? [{ type: 'delta', content: AUTHORED }] : [{ type: 'done' }];
    vi.mocked(fetch).mockResolvedValueOnce(json(empty)).mockResolvedValueOnce(stream(events));
    await open(); await submit();
    expect(screen.getByRole('alert')).toHaveTextContent(failure === 'empty' ? copy.errors.noResponse : copy.errors.interrupted);
    expect(document.body).not.toHaveTextContent('PRIVATE');
    if (failure === 'truncated') expect(screen.getByText(AUTHORED)).toBeInTheDocument();
  });

  it('surfaces resume/history failures and permits retry without showing an empty history as success', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('PRIVATE resume'))
      .mockResolvedValueOnce(json({ error: 'PRIVATE history' }, 500))
      .mockResolvedValueOnce(json({ conversations: [] }));
    await open();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.resumeFailed);
    await history();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.historyFailed);
    expect(screen.queryByText(copy.history.empty, { exact: false })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.history.back }));
    await history();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(copy.history.empty, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(t('history.count', { count: 0 }))).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it.each(['success', 'http', 'transport', 'late-json'] as const)('ignores outdated history %s after reopening', async oldOutcome => {
    const old = deferred<Response>();
    const oldBody = deferred<unknown>();
    const oldResponse = json({}, 500);
    if (oldOutcome === 'late-json') vi.spyOn(oldResponse, 'json').mockReturnValue(oldBody.promise);
    vi.mocked(fetch).mockResolvedValueOnce(json(resumed))
      .mockImplementationOnce(() => oldOutcome === 'late-json' ? Promise.resolve(oldResponse) : old.promise)
      .mockResolvedValueOnce(json({ conversations: [summary] }));
    await open();
    fireEvent.change(screen.getByRole('textbox', { name: copy.input.label }), { target: { value: 'Preserved draft' } });
    await history();
    fireEvent.click(screen.getByRole('button', { name: copy.history.back }));
    await history();
    expect(screen.getByText('Authored title')).toBeInTheDocument();
    await act(async () => {
      if (oldOutcome === 'transport') old.reject(new Error('PRIVATE outdated history'));
      else if (oldOutcome === 'late-json') oldBody.resolve({ error: 'PRIVATE outdated JSON' });
      else old.resolve(oldOutcome === 'http' ? json({ error: 'PRIVATE outdated history' }, 500) : json({ conversations: [] }));
    });
    expect(screen.getByText('Authored title')).toBeInTheDocument();
    expect(screen.getByText(t('history.count', { count: 1 }))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.history.back }));
    expect(screen.getByRole('textbox', { name: copy.input.label })).toHaveValue('Preserved draft');
    expect(screen.getByText(AUTHORED)).toBeInTheDocument();
  });

  it('keeps the newer history request loading when an older request settles', async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    vi.mocked(fetch).mockResolvedValueOnce(json(empty)).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await open(); await history();
    fireEvent.click(screen.getByRole('button', { name: copy.history.back }));
    await history();
    await act(async () => { old.resolve(json({ conversations: [] })); });
    expect(screen.getByText(copy.history.loading)).toBeInTheDocument();
    expect(screen.queryByText(copy.history.empty, { exact: false })).toBeNull();
    await act(async () => { current.resolve(json({ conversations: [summary] })); });
    expect(screen.getByText('Authored title')).toBeInTheDocument();
    expect(screen.queryByText(copy.history.loading)).toBeNull();
  });

  it('invalidates pending history on close while preserving messages and draft', async () => {
    const old = deferred<Response>();
    vi.mocked(fetch).mockResolvedValueOnce(json(resumed)).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(json({ conversations: [summary] }));
    await open();
    fireEvent.change(screen.getByRole('textbox', { name: copy.input.label }), { target: { value: 'Preserved draft' } });
    await history();
    fireEvent.click(screen.getByRole('button', { name: copy.close }));
    await act(async () => { old.resolve(json({ error: 'PRIVATE closed history' }, 500)); });
    fireEvent.click(screen.getByRole('button', { name: copy.title }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: copy.input.label })).toHaveValue('Preserved draft');
    expect(screen.getByText(AUTHORED)).toBeInTheDocument();
    expect(screen.queryByText(copy.history.empty, { exact: false })).toBeNull();
    await history();
    expect(screen.getByText('Authored title')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('preserves history after an HTTP load failure and restores authored messages on retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(empty))
      .mockResolvedValueOnce(json({ conversations: [{ ...summary, title: null, preview: 'Authored preview' }] }))
      .mockResolvedValueOnce(json({ error: 'PRIVATE load' }, 404))
      .mockResolvedValueOnce(json(resumed));
    await open(); await history();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Authored preview/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.notFound);
    expect(screen.getByText('Authored preview')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Authored preview/ })); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(AUTHORED)).toBeInTheDocument();
    expect(screen.queryByText('Authored preview')).toBeNull();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('keeps the active conversation until archive succeeds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(resumed))
      .mockResolvedValueOnce(json({ error: 'PRIVATE archive' }, 500))
      .mockRejectedValueOnce(new Error('PRIVATE archive transport'))
      .mockResolvedValueOnce(json({ ok: true }));
    await open();
    for (let i = 0; i < 2; i++) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.history.new })); });
      expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.archiveFailed);
      expect(screen.getByText(AUTHORED)).toBeInTheDocument();
    }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.history.new })); });
    expect(screen.queryByText(AUTHORED)).toBeNull();
    expect(screen.getByRole('heading', { name: copy.empty.title })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('keeps history and authored state through failed load/delete, then removes only after success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(resumed)).mockResolvedValueOnce(json({ conversations: [summary] }))
      .mockRejectedValueOnce(new Error('PRIVATE load'))
      .mockResolvedValueOnce(json({ error: 'PRIVATE delete' }, 500))
      .mockRejectedValueOnce(new Error('PRIVATE delete transport'))
      .mockResolvedValueOnce(json({ ok: true }));
    await open(); await history();
    expect(screen.getByText(t('history.count', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day'))).toBeInTheDocument();
    expect(screen.getByText(copy.history.archived)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Authored title/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.loadFailed);
    expect(screen.getByText('Authored title')).toBeInTheDocument();
    for (let i = 0; i < 2; i++) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.history.delete })); });
      expect(window.confirm).toHaveBeenLastCalledWith(copy.history.deleteConfirm);
      expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.deleteFailed);
      expect(screen.getByText('Authored title')).toBeInTheDocument();
    }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.history.delete })); });
    expect(screen.queryByText('Authored title')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.history.back }));
    expect(screen.queryByText(AUTHORED)).toBeNull();
    expect(screen.getByRole('heading', { name: copy.empty.title })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });
});
