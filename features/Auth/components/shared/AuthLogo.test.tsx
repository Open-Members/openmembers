import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { DEFAULT_TENANT_SETTINGS } from '@/core/theme/branding';
import { AuthLogo } from './AuthLogo';

const mocks = vi.hoisted(() => ({ settings: vi.fn() }));
vi.mock('@/core/theme/settings', () => ({ getTenantSettings: mocks.settings }));
vi.mock('@/core/i18n/routing', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const { default: messages } = await import('@/core/i18n/locales/en');
  return { getTranslations: async () => createTranslator({ locale: 'en', messages, namespace: 'landing' }) };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS });
});

describe('authentication identity', () => {
  it('gives the default product a named home link with both artwork variants', async () => {
    render(await AuthLogo());
    expect(screen.getByRole('link', { name: 'Open Members home' })).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('img', { name: 'Open Members' }).map(image => image.getAttribute('src'))).toEqual([
      '/brand/wordmark-dark.svg', '/brand/wordmark-light.svg',
    ]);
  });

  it('shows the installation name when it has been renamed without uploading a logo', async () => {
    mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS, site_name: 'Second Academy' });
    render(await AuthLogo());
    expect(screen.getByRole('link', { name: 'Second Academy home' })).toHaveTextContent('Second Academy');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each(['logo_light_url', 'logo_dark_url', 'logo_url'] as const)(
    'preserves an authored %s even when the installation keeps the default name',
    async (field) => {
      mocks.settings.mockResolvedValue({ ...DEFAULT_TENANT_SETTINGS, [field]: '/authored-logo.svg' });
      render(await AuthLogo());
      const images = screen.getAllByRole('img', { name: 'Open Members' });
      expect(images.every(image => image.getAttribute('src') === '/authored-logo.svg')).toBe(true);
    },
  );
});
