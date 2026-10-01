import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import pt from '@/core/i18n/locales/pt/adminOperations.json';
import { AdminBranding } from './AdminBranding';
import type { AdminBrandingSettings } from '../actions';
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  toast: { success: vi.fn(), danger: vi.fn(), warning: vi.fn() },
}));
vi.mock('../actions', () => ({ saveAdminBranding: mocks.save }));
vi.mock('@/core/storage/actions', () => ({ createSignedUploadUrlAction: vi.fn() }));
vi.mock('@/shared/lib/toast', () => ({ appToast: mocks.toast }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
const savedSettings: AdminBrandingSettings = {
  id: 'settings',
  siteName: 'Academy',
  logoUrl: null,
  logoLightUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  ogImageUrl: null,
  primaryColor: '#0235a8',
  accentColor: '#f20505',
  secondaryColor: '#f20505',
  fontFamily: 'system',
  homeHeroBannerUrl: null,
  homeHeroTrailerYoutubeId: null,
  homeHeroTitle: null,
  homeHeroSubtitle: null,
  homeHeroOverlayOpacity: 70,
  homeHeroShowText: true,
  loadingBarStyle: 'gradient',
  loadingBarColors: ['#0235a8', '#f20505'],
};
function mount(initialSettings: AdminBrandingSettings | null = null) {
  render(
    <NextIntlClientProvider locale="pt" messages={{ adminOperations: pt }}>
      <AdminBranding initialSettings={initialSettings} />
    </NextIntlClientProvider>,
  );
}
it('copies draft backgrounds independently and discards without publishing', () => {
  mount();
  const home = screen.getByRole('group', { name: 'Home pública' });
  const login = screen.getByRole('group', { name: 'Login' });
  fireEvent.change(within(home).getByLabelText('Tipo de fundo'), { target: { value: 'color' } });
  fireEvent.change(within(login).getByLabelText('Copiar fundo de'), { target: { value: 'home' } });
  fireEvent.click(within(login).getByRole('button', { name: 'Copiar configuração' }));
  fireEvent.change(within(home).getByLabelText('Tipo de fundo'), { target: { value: 'current' } });
  expect(within(login).getByLabelText('Tipo de fundo')).toHaveValue('color');
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
  expect(within(login).getByLabelText('Tipo de fundo')).toHaveValue('current');
  expect(mocks.save).not.toHaveBeenCalled();
});
it('keeps a failed save editable and publishes all independent values on retry', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  mocks.save
    .mockResolvedValueOnce({ error: 'saveFailed' })
    .mockResolvedValueOnce({ success: true });
  mount();
  fireEvent.change(screen.getByLabelText('Título da home pública'), {
    target: { value: 'Minha comunidade' },
  });
  const login = screen.getByRole('group', { name: 'Login' });
  fireEvent.change(within(login).getByLabelText('Tipo de fundo'), { target: { value: 'color' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })));
  expect(screen.getByLabelText('Título da home pública')).toHaveValue('Minha comunidade');
  expect(screen.getByRole('button', { name: 'Descartar' })).toBeEnabled();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })));
  expect(mocks.save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      publicHomeTitle: 'Minha comunidade',
      loginBackground: { mode: 'color', color: '#101820' },
    }),
  );
});

it('copies and discards onto an existing solid background without reviving stale hex text', () => {
  render(
    <NextIntlClientProvider locale="pt" messages={{ adminOperations: pt }}>
      <AdminBranding
        initialSettings={{
          ...savedSettings,
          publicHomeBackground: { mode: 'color', color: '#123456' },
          loginBackground: { mode: 'color', color: '#abcdef' },
        }}
      />
    </NextIntlClientProvider>,
  );
  const login = screen.getByRole('group', { name: 'Login' });
  const hex = within(login).getByLabelText('Cor hexadecimal de Cor do fundo');
  fireEvent.change(within(login).getByLabelText('Copiar fundo de'), { target: { value: 'home' } });
  fireEvent.click(within(login).getByRole('button', { name: 'Copiar configuração' }));
  expect(hex).toHaveValue('#123456');
  fireEvent.blur(hex);
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
  expect(hex).toHaveValue('#abcdef');
  fireEvent.blur(hex);
  expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});

it('preserves unchanged file-backed backgrounds when saving unrelated identity edits', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  mocks.save.mockResolvedValue({ success: true });
  mount({
    ...savedSettings,
    loginBackground: {
      mode: 'image',
      imageUrl: '/background.webp',
      position: 'center',
      overlayOpacity: 70,
    },
  });
  fireEvent.change(screen.getByLabelText('Nome do site'), { target: { value: 'Renamed academy' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][0]).toHaveProperty('siteName', 'Renamed academy');
  expect(mocks.save.mock.calls[0][0]).not.toHaveProperty('loginBackground');
});
