import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminAnnouncements } from './AdminAnnouncements';

const mocks = vi.hoisted(() => ({ sendBroadcast: vi.fn(), success: vi.fn(), danger: vi.fn() }));

vi.mock('../admin-actions', () => ({ sendBroadcast: mocks.sendBroadcast }));
vi.mock('@/shared/lib/toast', () => ({ appToast: { success: mocks.success, danger: mocks.danger } }));
vi.mock('@/features/Admin/components/AdminPageHeader', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/features/Admin/operations-presentation', () => ({
  useAdminOperationsPresentation: () => ({
    t: (key: string) => key,
    error: (value: unknown) => String(value),
    number: (value: number) => String(value),
  }),
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it.each([
  ['access_level', 'announcements.audience.accessLevel.title'],
  ['course', 'announcements.audience.course.title'],
] as const)(
  'keeps send disabled when the selected %s segment has no ID',
  (kind, audienceTitle) => {
    render(
      <AdminAnnouncements
        options={{ accessLevels: [], courses: [], totalUsers: 12 }}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText('announcements.compose.headline.placeholder'),
      { target: { value: 'Authored headline' } },
    );
    fireEvent.change(
      screen.getByPlaceholderText('announcements.compose.body.placeholder'),
      { target: { value: 'Authored message' } },
    );
    const send = screen.getByRole('button', {
      name: 'announcements.actions.send',
    });
    expect(send).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(audienceTitle) }));

    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  },
);

it('keeps the delivery ID after failure and replaces it after success', async () => {
  mocks.sendBroadcast
    .mockResolvedValueOnce({ error: 'operationFailed' })
    .mockResolvedValueOnce({ sent: 1 })
    .mockResolvedValueOnce({ sent: 1 });
  render(<AdminAnnouncements options={{ accessLevels: [], courses: [], totalUsers: 1 }} />);
  const headline = screen.getByPlaceholderText('announcements.compose.headline.placeholder');
  const body = screen.getByPlaceholderText('announcements.compose.body.placeholder');
  const send = screen.getByRole('button', { name: 'announcements.actions.send' });
  fireEvent.change(headline, { target: { value: 'Authored headline' } });
  fireEvent.change(body, { target: { value: 'Authored message' } });

  fireEvent.click(send);
  await waitFor(() => expect(mocks.sendBroadcast).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(send).toBeEnabled());
  fireEvent.click(send);
  await waitFor(() => expect(mocks.sendBroadcast).toHaveBeenCalledTimes(2));
  const firstId = mocks.sendBroadcast.mock.calls[0][0].requestId;
  expect(firstId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(mocks.sendBroadcast.mock.calls[1][0].requestId).toBe(firstId);

  await waitFor(() => expect(headline).toHaveValue(''));
  fireEvent.change(headline, { target: { value: 'Authored headline' } });
  fireEvent.change(body, { target: { value: 'Authored message' } });
  fireEvent.click(send);
  await waitFor(() => expect(mocks.sendBroadcast).toHaveBeenCalledTimes(3));
  expect(mocks.sendBroadcast.mock.calls[2][0].requestId).not.toBe(firstId);
});
