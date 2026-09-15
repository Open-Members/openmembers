import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/adminOperations.json';
import { AdminBranding } from './AdminBranding';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  upload: vi.fn(),
  toast: { success: vi.fn(), danger: vi.fn(), warning: vi.fn() },
}));

vi.mock('../actions', () => ({ saveAdminBranding: mocks.save }));
vi.mock('@/core/storage/actions', () => ({ createSignedUploadUrlAction: mocks.upload }));
vi.mock('@/shared/lib/toast', () => ({ appToast: mocks.toast }));

const tree = (
  <NextIntlClientProvider
    locale="en"
    messages={{ adminOperations: en }}
    now={new Date('2026-09-15T00:00:00Z')}
    timeZone="UTC"
  >
    <AdminBranding initialSettings={null} />
  </NextIntlClientProvider>
);

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  mocks.save.mockResolvedValue({ success: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  container.innerHTML = renderToString(tree);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('branding form hydration', () => {
  it('prevents edits to the server preview before change handlers are attached', () => {
    const controls = container.querySelectorAll('input, select, textarea, button');
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control).toBeDisabled();
    expect(within(container).getByLabelText('Site name', { exact: true })).toHaveValue('Open Members');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('enables hydrated controls and preserves the first edit through another edit and save', async () => {
    const onRecoverableError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError });
    });

    const view = within(container);
    const siteName = view.getByLabelText('Site name', { exact: true });
    const bodyFont = view.getByLabelText('Body font', { exact: true });
    expect(siteName).toBeEnabled();
    expect(bodyFont).toBeEnabled();

    fireEvent.change(siteName, { target: { value: 'Garden Academy' } });
    fireEvent.change(bodyFont, { target: { value: 'serif' } });
    expect(siteName).toHaveValue('Garden Academy');
    expect(view.getByRole('button', { name: /^Discard$/ })).toBeEnabled();

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: /^Save changes$/ }));
    });

    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      siteName: 'Garden Academy',
      fontFamily: 'serif',
    }));
    expect(siteName).toHaveValue('Garden Academy');
    expect(view.queryByRole('button', { name: /^Discard$/ })).not.toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.toast.danger).not.toHaveBeenCalled();
    expect(onRecoverableError).not.toHaveBeenCalled();
  });
});
