import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/core/i18n/locales/en/support.json';
import pt from '@/core/i18n/locales/pt/support.json';
import es from '@/core/i18n/locales/es/support.json';
import { NewTicketForm } from './NewTicketForm';

const mocks = vi.hoisted(() => ({
  createTicket: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  successToast: vi.fn(),
}));

vi.mock('../actions', () => ({ createSupportTicket: mocks.createTicket }));
vi.mock('@/core/i18n/routing', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('@/shared/lib/toast', () => ({
  appToast: { success: mocks.successToast },
}));

const catalogs = { en, pt, es } as const;

function wrapper(locale: keyof typeof catalogs) {
  return function SupportProvider({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={{ support: catalogs[locale] }}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

async function submitForm() {
  const form = document.querySelector('form');
  if (!form) throw new Error('Expected support form');
  expect(form).toHaveAttribute('novalidate');
  await act(async () => {
    fireEvent.submit(form);
  });
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe.each(['en', 'pt', 'es'] as const)(
  'support ticket form in %s',
  (locale) => {
    const copy = catalogs[locale].form;

    it('uses localized application validation and preserves authored fields', async () => {
      mocks.createTicket.mockResolvedValue({ error: 'invalidInput' });
      render(<NewTicketForm />, { wrapper: wrapper(locale) });

      const authoredSubject = 'Acesso — 東京';
      const authoredMessage = 'Mensagem autoral <sem alteração> / texto propio';
      fireEvent.change(screen.getByLabelText(copy.subject), {
        target: { value: authoredSubject },
      });
      fireEvent.change(screen.getByLabelText(copy.message), {
        target: { value: authoredMessage },
      });

      expect(screen.getByPlaceholderText(copy.subjectPlaceholder)).toBeVisible();
      expect(screen.getByPlaceholderText(copy.messagePlaceholder)).toBeVisible();
      expect(screen.getByRole('button', { name: copy.cancel })).toBeVisible();
      await submitForm();

      expect(mocks.createTicket).toHaveBeenCalledOnce();
      const submitted = mocks.createTicket.mock.calls[0][0] as FormData;
      expect(submitted.get('subject')).toBe(authoredSubject);
      expect(submitted.get('message')).toBe(authoredMessage);
      expect(screen.getByRole('alert')).toHaveTextContent(
        copy.errors.invalidInput,
      );
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it('maps an unknown action code to localized fallback copy', async () => {
      mocks.createTicket.mockResolvedValue({ error: 'privateProviderDiagnostic' });
      render(<NewTicketForm />, { wrapper: wrapper(locale) });

      await submitForm();

      expect(screen.getByRole('alert')).toHaveTextContent(copy.errorFallback);
      expect(document.body).not.toHaveTextContent('privateProviderDiagnostic');
    });
  },
);
