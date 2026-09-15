import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/notifications.json';
import pt from '@/core/i18n/locales/pt/notifications.json';
import es from '@/core/i18n/locales/es/notifications.json';
import type { Notification } from '@/shared/types/interfaces';
import { NotificationsPageClient } from './NotificationsPageClient';
import { NotificationBell } from './NotificationBell';
const mocks = vi.hoisted(() => ({ read: vi.fn(), readAll: vi.fn(), remove: vi.fn(), fetch: vi.fn(), count: vi.fn(), push: vi.fn(), refresh: vi.fn(), timezone: vi.fn() }));
vi.mock('../actions', () => ({ markNotificationRead: mocks.read, markAllNotificationsRead: mocks.readAll, deleteNotification: mocks.remove }));
vi.mock('../queries', () => ({ fetchNotifications: mocks.fetch, fetchUnreadCount: mocks.count }));
vi.mock('@/core/supabase/UserProvider', () => ({ useUser: () => ({ userId: 'user' }) }));
vi.mock('@/shared/hooks/useBrowserTimezone', () => ({ useBrowserTimezone: mocks.timezone }));
vi.mock('@/core/i18n/routing', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }), Link: ({ children, href, onClick, className }: { children: ReactNode; href: string; onClick?: () => void; className?: string }) => <a href={href} onClick={onClick} className={className}>{children}</a> }));
const catalogs = { en, pt, es };
const now = new Date('2026-09-12T02:00:00Z');
const notice: Notification = { id: 'notification', userId: 'user', type: 'announcement', title: 'Authored English title', message: 'Authored English message.', actionUrl: '/courses', isRead: false, createdAt: '2026-09-11T23:30:00Z' };
function provider(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) { return <NextIntlClientProvider locale={locale} messages={{ notifications: catalogs[locale] }} now={now} timeZone="UTC">{children}</NextIntlClientProvider>; };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ success: true });
  mocks.readAll.mockResolvedValue({ success: true });
  mocks.remove.mockResolvedValue({ success: true });
  mocks.fetch.mockResolvedValue([notice]);
  mocks.count.mockResolvedValue(2);
  mocks.timezone.mockReturnValue('America/Sao_Paulo');
});
afterEach(() => cleanup());

describe.each(['en', 'pt', 'es'] as const)('Notification UI in %s', locale => {
  const copy = catalogs[locale];
  const t = createTranslator({ locale, messages: copy });
  const options = { wrapper: provider(locale) };
  function page(items = [notice], failed = false) { return render(<NotificationsPageClient initialNotifications={items} initialLoadFailed={failed} initialNow={now.toISOString()} />, options); }

  it('localizes framing, filters and zoned dates while preserving persisted text', () => {
    page();
    expect(screen.getByRole('heading', { name: copy.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.today })).toBeInTheDocument();
    expect(screen.getByText('Authored English title')).toBeInTheDocument();
    expect(screen.getByText('Authored English message.')).toBeInTheDocument();
    expect(screen.getByText(new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(notice.createdAt)))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(copy.filters.all) })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.filters.announcement) }));
    expect(screen.getByRole('button', { name: new RegExp(copy.filters.announcement) })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: copy.delete })).toBeInTheDocument();
  });

  it('renders automatic content in the active account language', () => {
    page([{
      ...notice,
      type: 'new_lesson',
      title: 'New lesson in Curso Ω',
      message: 'Aula ç just dropped. Tap to watch.',
      messageKey: 'content.lessonPublished',
      messageParams: { courseTitle: 'Curso Ω', lessonTitle: 'Aula ç' },
    }]);
    expect(screen.getByText(copy.automatic.content.lessonPublished.title.replace('{courseTitle}', 'Curso Ω'))).toBeInTheDocument();
    expect(screen.getByText(copy.automatic.content.lessonPublished.message.replace('{lessonTitle}', 'Aula ç'))).toBeInTheDocument();
  });

  it('keeps load failures distinct from the empty state and lets server refresh retry', () => {
    page([], true);
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.loadFailed);
    expect(screen.queryByText(copy.emptyTitle)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('renders a successful empty inbox in the account language', () => {
    page([]);
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.emptyDescription)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['read', 'readAll', 'remove'] as const)('does not apply a failed %s or navigate on failure and allows retry', async operation => {
    const action = mocks[operation];
    const code = operation === 'read' ? 'readFailed' : operation === 'readAll' ? 'readAllFailed' : 'deleteFailed';
    action.mockResolvedValueOnce({ error: 'PRIVATE diagnostic' }).mockRejectedValueOnce(new Error('PRIVATE transport'));
    page();
    const button = () => operation === 'read' ? screen.getByRole('button', { name: /Authored English title/ }) : screen.getByRole('button', { name: operation === 'readAll' ? copy.markAll : copy.delete });
    for (let i = 0; i < 2; i++) {
      await act(async () => { fireEvent.click(button()); });
      expect(screen.getByRole('alert')).toHaveTextContent(copy.errors[code]);
      expect(screen.getByText(copy.unread)).toBeInTheDocument();
      expect(screen.getByText('Authored English title')).toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(document.body).not.toHaveTextContent('PRIVATE');
    }
    await act(async () => { fireEvent.click(button()); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    if (operation === 'remove') expect(screen.queryByText('Authored English title')).not.toBeInTheDocument();
    else expect(screen.queryByText(copy.unread)).not.toBeInTheDocument();
    if (operation === 'read') expect(mocks.push).toHaveBeenCalledWith('/courses');
  });

  it('keeps the row until a deletion is confirmed', async () => {
    let resolve!: (result: { success: boolean }) => void;
    mocks.remove.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    page();
    fireEvent.click(screen.getByRole('button', { name: copy.delete }));
    expect(screen.getByText('Authored English title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.delete })).toBeDisabled();
    await act(async () => { resolve({ success: true }); });
    expect(screen.queryByText('Authored English title')).not.toBeInTheDocument();
  });

  it('shows bell loading and keeps unread status/count after auto-mark failure', async () => {
    mocks.readAll.mockResolvedValueOnce({ error: 'readAllFailed' });
    render(<NotificationBell />, options);
    await screen.findByLabelText(t('unreadCount', { count: 2 }));
    const trigger = screen.getByRole('button', { name: copy.title });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: copy.title });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByRole('status', { name: copy.loading })).toBeInTheDocument();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(copy.errors.readAllFailed);
    expect(screen.getByLabelText(t('unreadCount', { count: 2 }))).toBeInTheDocument();
    expect(within(dialog).getByText(copy.unread)).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith('user');
    expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.readAll.mock.invocationCallOrder[0]);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: copy.retry })); });
    expect(screen.queryByLabelText(t('unreadCount', { count: 2 }))).not.toBeInTheDocument();
    expect(within(dialog).queryByText(copy.unread)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: copy.viewAll })).toHaveAttribute('href', '/notifications');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows a failed bell read without pretending it is empty or marking notifications', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('PRIVATE transport'));
    render(<NotificationBell />, options);
    fireEvent.click(screen.getByRole('button', { name: copy.title }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.loadFailed);
    expect(screen.queryByText(copy.bellEmptyTitle)).not.toBeInTheDocument();
    expect(mocks.readAll).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce([]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.retry })); });
    expect(screen.getByText(copy.bellEmptyTitle)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('PRIVATE');
    fireEvent.click(screen.getByRole('button', { name: copy.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows closing during deletion but prevents a stale reload from restoring a deleted item', async () => {
    let resolve!: (result: { success: boolean }) => void;
    mocks.remove.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(<NotificationBell />, options);
    const trigger = screen.getByRole('button', { name: copy.title });
    fireEvent.click(trigger);
    await screen.findByText('Authored English title');
    fireEvent.click(screen.getByRole('button', { name: copy.delete }));
    fireEvent.click(screen.getByRole('button', { name: copy.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    await act(async () => { resolve({ success: true }); });
    expect(trigger).toBeEnabled();
    mocks.fetch.mockResolvedValueOnce([]);
    await act(async () => { fireEvent.click(trigger); });
    expect(screen.queryByText('Authored English title')).not.toBeInTheDocument();
    expect(screen.getByText(copy.bellEmptyTitle)).toBeInTheDocument();
  });

  it('does not navigate from the page when a legacy notification has an unsafe URL', async () => {
    page([{ ...notice, id: 'unsafe-page', actionUrl: 'javascript:alert(1)', isRead: true }]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Authored English title/ }));
    });

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('does not navigate or close the bell when a legacy notification has an unsafe URL', async () => {
    mocks.fetch.mockResolvedValueOnce([
      { ...notice, id: 'unsafe-bell', actionUrl: '//evil.example.test', isRead: true },
    ]);
    render(<NotificationBell />, options);
    fireEvent.click(screen.getByRole('button', { name: copy.title }));
    await screen.findByText('Authored English title');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Authored English title/ }));
    });

    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: copy.title })).toBeInTheDocument();
  });

  it.each(['read', 'remove'] as const)('keeps bell items on failed %s and avoids navigation', async operation => {
    mocks.readAll.mockResolvedValueOnce({ error: 'readAllFailed' });
    mocks[operation].mockResolvedValueOnce({ error: 'notAuthenticated' }).mockRejectedValueOnce(new Error('PRIVATE'));
    render(<NotificationBell />, options);
    fireEvent.click(screen.getByRole('button', { name: copy.title }));
    await screen.findByText('Authored English title');
    const button = () => operation === 'read' ? screen.getByRole('button', { name: /Authored English title/ }) : screen.getByRole('button', { name: copy.delete });
    await act(async () => { fireEvent.click(button()); });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.notAuthenticated);
    expect(screen.getByText('Authored English title')).toBeInTheDocument();
    await act(async () => { fireEvent.click(button()); });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors[operation === 'read' ? 'readFailed' : 'deleteFailed']);
    expect(screen.getByText(copy.unread)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent('PRIVATE');
    await act(async () => { fireEvent.click(button()); });
    if (operation === 'read') expect(mocks.push).toHaveBeenCalledWith('/courses');
    else await waitFor(() => expect(screen.queryByText('Authored English title')).not.toBeInTheDocument());
  });
});
