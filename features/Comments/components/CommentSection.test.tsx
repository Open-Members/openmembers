import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/comments.json';
import pt from '@/core/i18n/locales/pt/comments.json';
import es from '@/core/i18n/locales/es/comments.json';
import type { LessonComment } from '@/shared/types/interfaces';
import { CommentSection } from './CommentSection';

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), pin: vi.fn(), fetch: vi.fn(), timezone: vi.fn((): string | null => 'UTC') }));
vi.mock('@/shared/hooks/useBrowserTimezone', () => ({ useBrowserTimezone: mocks.timezone }));
vi.mock('../actions', () => ({ addComment: mocks.add, deleteComment: mocks.remove, pinComment: mocks.pin, fetchComments: mocks.fetch }));
const catalogs = { en, pt, es };
const now = new Date('2026-09-12T12:00:00Z');
function comment(values: Partial<LessonComment> = {}): LessonComment {
  return { id: 'comment', lessonId: 'lesson', userId: 'user', userDisplayName: 'Anonymous',
    content: 'An authored English comment.', isPinned: false, createdAt: '2026-09-12T11:58:00Z', ...values };
}
function provider(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={{ comments: catalogs[locale] }} now={now} timeZone="UTC">{children}</NextIntlClientProvider>;
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.timezone.mockReturnValue('UTC');
  mocks.fetch.mockResolvedValue({ data: [] });
  mocks.add.mockResolvedValue({ success: true, data: { id: 'saved' } });
  mocks.remove.mockResolvedValue({ success: true });
  mocks.pin.mockResolvedValue({ success: true, data: { isPinned: true } });
});
afterEach(() => cleanup());

describe.each(['en', 'pt', 'es'] as const)('Comments in %s', locale => {
  const copy = catalogs[locale];
  const t = createTranslator({ locale, messages: copy });
  const options = { wrapper: provider(locale) };

  it('renders loading, empty state, accessible form, and saves authored content unchanged', async () => {
    render(<CommentSection lessonId="lesson" currentUserId="user" />, options);
    expect(screen.getByRole('status', { name: copy.loading })).toBeInTheDocument();
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
    const input = screen.getByRole('textbox', { name: copy.commentLabel });
    expect(input).toHaveAttribute('placeholder', copy.lessonPlaceholder);
    fireEvent.change(input, { target: { value: 'My authored English text.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.submit })); });
    const form = mocks.add.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(form)).toEqual({ lessonId: 'lesson', content: 'My authored English text.' });
    expect(input).toHaveValue('');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['accessDenied', 'PRIVATE diagnostic', 'transport'])('shows a localized load failure (%s), not an empty discussion, and supports retry', async code => {
    if (code === 'transport') mocks.fetch.mockRejectedValueOnce(new Error('PRIVATE transport'));
    else mocks.fetch.mockResolvedValueOnce({ error: code });
    render(<CommentSection lessonId="lesson" currentUserId="user" />, options);
    expect(await screen.findByRole('alert')).toHaveTextContent(code === 'accessDenied' ? copy.errors.accessDenied : copy.errors.loadFailed);
    expect(screen.queryByText(copy.emptyTitle)).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.retry })); });
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it.each(['contentTooLong', 'notAuthenticated', 'PRIVATE diagnostic', 'transport'])('keeps the draft after save failure (%s) and allows a successful retry', async code => {
    if (code === 'transport') mocks.add.mockRejectedValueOnce(new Error('PRIVATE transport'));
    else mocks.add.mockResolvedValueOnce({ error: code });
    render(<CommentSection lessonId="lesson" currentUserId="user" />, options);
    const input = await screen.findByRole('textbox', { name: copy.commentLabel });
    fireEvent.change(input, { target: { value: 'Keep my authored draft.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.submit })); });
    const key = code === 'contentTooLong' || code === 'notAuthenticated' ? code : 'saveFailed';
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors[key]);
    expect(input).toHaveValue('Keep my authored draft.');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveTextContent('PRIVATE');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.submit })); });
    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('localizes dates, counts, controls and null authors while preserving explicit author names and content', async () => {
    mocks.fetch.mockResolvedValue({ data: [
      comment(),
      comment({ id: 'other', userId: 'other', userDisplayName: null, isPinned: true, createdAt: '2026-08-01T12:00:00Z', content: 'Authored pinned text.' }),
    ] });
    render(<CommentSection lessonId="lesson" currentUserId="user" isAdmin />, options);
    expect(await screen.findByRole('heading', { name: t('titleWithCount', { count: 2 }) })).toBeInTheDocument();
    expect(screen.getByText('An authored English comment.')).toBeInTheDocument();
    expect(screen.getByText('Authored pinned text.')).toBeInTheDocument();
    expect(screen.getAllByText('Anonymous').length).toBe(locale === 'en' ? 2 : 1);
    expect(screen.getAllByText(copy.anonymous).length).toBe(locale === 'en' ? 2 : 1);
    expect(screen.getByText(new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-2, 'minute'))).toBeInTheDocument();
    expect(screen.getByText(new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date('2026-08-01T12:00:00Z')))).toBeInTheDocument();
    expect(screen.getByText(copy.pinned)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.pin })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.unpin })).toBeInTheDocument();
  });

  it('keeps old comment dates in the browser zone across the UTC day boundary', async () => {
    mocks.fetch.mockResolvedValue({ data: [comment({ createdAt: '2026-08-01T00:30:00Z' })] });
    mocks.timezone.mockReturnValue(null);
    const view = render(<CommentSection lessonId="lesson" currentUserId="user" />, options);
    const utcDate = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date('2026-08-01T00:30:00Z'));
    expect(await screen.findByText(utcDate)).toBeInTheDocument();
    mocks.timezone.mockReturnValue('America/Sao_Paulo');
    view.rerender(<CommentSection lessonId="lesson" currentUserId="user" />);
    const browserDate = new Intl.DateTimeFormat(locale, { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date('2026-08-01T00:30:00Z'));
    expect(browserDate).not.toBe(utcDate);
    expect(screen.getByText(browserDate)).toBeInTheDocument();
    expect(screen.queryByText(utcDate)).not.toBeInTheDocument();
  });

  it('shows only allowed controls and submits a reply with the exact parent and authored text', async () => {
    mocks.fetch.mockResolvedValue({ data: [comment({ userId: 'other' })] });
    render(<CommentSection lessonId="lesson" currentUserId="user" />, options);
    const reply = await screen.findByRole('button', { name: copy.reply });
    expect(screen.queryByRole('button', { name: copy.delete })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.pin })).not.toBeInTheDocument();
    fireEvent.click(reply);
    expect(screen.getByRole('textbox', { name: copy.replyLabel })).toHaveAttribute('placeholder', copy.replyPlaceholder);
    fireEvent.click(screen.getByRole('button', { name: copy.cancel }));
    expect(screen.queryByRole('textbox', { name: copy.replyLabel })).not.toBeInTheDocument();
    fireEvent.click(reply);
    fireEvent.change(screen.getByRole('textbox', { name: copy.replyLabel }), { target: { value: 'Authored reply in English.' } });
    await act(async () => { fireEvent.keyDown(screen.getByRole('textbox', { name: copy.replyLabel }), { key: 'Enter', ctrlKey: true }); });
    expect(Object.fromEntries(mocks.add.mock.calls[0][0] as FormData)).toEqual({ lessonId: 'lesson', parentId: 'comment', content: 'Authored reply in English.' });
    expect(screen.queryByRole('textbox', { name: copy.replyLabel })).not.toBeInTheDocument();
  });

  it.each(['delete', 'pin'] as const)('keeps the comment after failed %s and refreshes only after success', async operation => {
    const action = operation === 'delete' ? mocks.remove : mocks.pin;
    action.mockResolvedValueOnce({ error: 'PRIVATE diagnostic' }).mockRejectedValueOnce(new Error('PRIVATE transport'));
    mocks.fetch.mockResolvedValue({ data: [comment()] });
    render(<CommentSection lessonId="lesson" currentUserId="user" isAdmin />, options);
    await screen.findByText('An authored English comment.');
    for (let i = 0; i < 2; i++) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy[operation] })); });
      expect(screen.getByRole('alert')).toHaveTextContent(copy.errors[operation === 'delete' ? 'deleteFailed' : 'pinFailed']);
      expect(screen.getByText('An authored English comment.')).toBeInTheDocument();
      expect(mocks.fetch).toHaveBeenCalledOnce();
    }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy[operation] })); });
    expect(action).toHaveBeenLastCalledWith('comment');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('does not replace a new lesson with a previous lesson’s late response', async () => {
    let completeOld!: (value: { data: LessonComment[] }) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { completeOld = resolve; }));
    const view = render(<CommentSection lessonId="old" currentUserId="user" />, options);
    view.rerender(<CommentSection lessonId="new" currentUserId="user" />);
    await screen.findByText(copy.emptyTitle);
    await act(async () => { completeOld({ data: [comment({ content: 'Stale response.' })] }); });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('new'));
    expect(screen.queryByText('Stale response.')).not.toBeInTheDocument();
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
  });
});
