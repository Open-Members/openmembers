import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/core/i18n/locales/en/adminOperations.json';
import pt from '@/core/i18n/locales/pt/adminOperations.json';
import es from '@/core/i18n/locales/es/adminOperations.json';
import { WEBHOOK_PROVIDERS } from '@/lib/webhooks/providers';
import type { AdminWebhookConfig } from '../actions';
import { IntegrationSetupDialog } from './IntegrationSetupDialog';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  toggle: vi.fn(),
  rotate: vi.fn(),
  sendTest: vi.fn(),
  danger: vi.fn(),
  success: vi.fn(),
}));

vi.mock('../actions', () => ({
  createWebhookConfig: mocks.create,
  updateWebhookConfig: mocks.update,
  deleteWebhookConfig: mocks.remove,
  toggleWebhookActive: mocks.toggle,
  rotateWebhookToken: mocks.rotate,
  sendTestWebhookEvent: mocks.sendTest,
}));

vi.mock('@/shared/lib/toast', () => ({
  appToast: { danger: mocks.danger, success: mocks.success },
}));

vi.mock('./WebhookProductMappings', () => ({
  WebhookProductMappings: () => null,
}));

const catalogs = { en, pt, es };
const guru = WEBHOOK_PROVIDERS.find((provider) => provider.id === 'guru')!;
const generic = WEBHOOK_PROVIDERS.find(
  (provider) => provider.id === 'generic',
)!;

function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={{ adminOperations: catalogs[locale] }}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

function renderDialog(
  locale: keyof typeof catalogs,
  provider = guru,
  existing: AdminWebhookConfig | null = null,
) {
  return render(
    <IntegrationSetupDialog
      provider={provider}
      existing={existing}
      accessLevels={[]}
      courses={[]}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />,
    { wrapper: wrapper(locale) },
  );
}

function setBrowserLanguage(language: string) {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: language,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  setBrowserLanguage('en-US');
});

describe.each([
  ['en', 'pt-BR', pt],
  ['pt', 'en-US', en],
  ['es', 'en-US', en],
] as const)(
  'integration form validation with an %s profile',
  (locale, browserLanguage, browserCatalog) => {
    it('uses profile copy for required and expiration errors despite the browser locale', async () => {
      setBrowserLanguage(browserLanguage);
      const messages = catalogs[locale];
      renderDialog(locale);

      const submit = screen.getByRole('button', {
        name: messages.integrations.dialog.actions.connect,
      });
      const form = submit.closest('form');
      expect(form).not.toBeNull();
      expect((form as HTMLFormElement).noValidate).toBe(true);
      expect(window.navigator.language).toBe(browserLanguage);

      const name = screen.getByRole('textbox', {
        name: messages.integrations.dialog.displayName,
      });
      fireEvent.change(name, { target: { value: '   ' } });
      fireEvent.click(submit);

      await waitFor(() =>
        expect(mocks.danger).toHaveBeenLastCalledWith(messages.errors.nameRequired),
      );
      expect(mocks.danger).not.toHaveBeenCalledWith(
        browserCatalog.errors.nameRequired,
      );
      expect(mocks.create).not.toHaveBeenCalled();

      mocks.danger.mockClear();
      fireEvent.change(name, { target: { value: 'Fixture integration' } });
      fireEvent.click(
        screen.getByText(messages.integrations.dialog.advanced.title).closest('button')!,
      );
      const expiration = screen.getByRole('spinbutton');

      for (const invalidValue of ['-1', '1.5']) {
        fireEvent.change(expiration, { target: { value: invalidValue } });
        fireEvent.click(submit);
        await waitFor(() =>
          expect(mocks.danger).toHaveBeenLastCalledWith(
            messages.errors.invalidExpiration,
          ),
        );
      }

      expect(mocks.danger).not.toHaveBeenCalledWith(
        browserCatalog.errors.invalidExpiration,
      );
      expect(mocks.create).not.toHaveBeenCalled();
    });
  },
);

describe('valid integration expiration values', () => {
  it('preserves blank as lifetime and accepts zero days', async () => {
    const first = renderDialog('en');
    const submit = screen.getByRole('button', {
      name: en.integrations.dialog.actions.connect,
    });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mocks.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ expirationDays: undefined }),
      ),
    );

    first.unmount();
    mocks.create.mockClear();
    renderDialog('en');
    fireEvent.click(
      screen.getByText(en.integrations.dialog.advanced.title).closest('button')!,
    );
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '0' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: en.integrations.dialog.actions.connect,
      }),
    );

    await waitFor(() =>
      expect(mocks.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ expirationDays: 0 }),
      ),
    );
  });
});

describe.each([
  ['en', en.integrations.providers.generic.name],
  ['pt', pt.integrations.providers.generic.name],
  ['es', es.integrations.providers.generic.name],
] as const)('generic integration naming in %s', (locale, providerName) => {
  it('shows the localized provider name without replacing the saved display name', () => {
    const savedName = 'Acme custom gateway';
    renderDialog(
      locale,
      { ...generic, name: providerName },
      {
        id: 'generic-config',
        provider: 'generic',
        name: savedName,
        accessLevelName: '',
        accessLevelId: '',
        expirationDays: null,
        isActive: true,
        createdAt: '2026-09-13T12:00:00.000Z',
        urlToken: null,
        expectedProducerId: null,
      },
    );

    expect(
      screen.getByRole('heading', { level: 2, name: providerName }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('textbox', {
          name: catalogs[locale].integrations.dialog.displayName,
        }) as HTMLInputElement
      ).value,
    ).toBe(savedName);
  });
});
