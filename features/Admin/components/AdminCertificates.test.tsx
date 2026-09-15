import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/core/i18n/locales/en/certificates.json';
import es from '@/core/i18n/locales/es/certificates.json';
import pt from '@/core/i18n/locales/pt/certificates.json';
import type { AdminCertificateSettings } from '@/features/Admin/certificates';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  preview: vi.fn(),
  success: vi.fn(),
  danger: vi.fn(),
}));

vi.mock('@/features/Admin/certificates', () => ({
  saveCertificateSettings: mocks.save,
  renderCertificatePreview: mocks.preview,
}));
vi.mock('@/shared/lib/toast', () => ({
  appToast: { success: mocks.success, danger: mocks.danger },
}));
vi.mock('@/shared/components/ui/ImageUpload', () => ({
  ImageUpload: ({
    label,
    value,
    onChange,
    helpText,
  }: {
    label: string;
    value: string | null;
    onChange: (value: string | null) => void;
    helpText: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      />
      <span>{helpText}</span>
    </label>
  ),
}));
vi.mock('@/shared/components/ui/ColorPicker', () => ({
  ColorPicker: ({
    label,
    value,
    onChange,
    helpText,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    helpText: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span>{helpText}</span>
    </label>
  ),
}));
vi.mock('./AdminPageHeader', () => ({
  AdminPageHeader: ({
    eyebrow,
    title,
    description,
  }: {
    eyebrow: string;
    title: string;
    description: string;
  }) => (
    <header>
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}));

import { AdminCertificates } from './AdminCertificates';

const catalogs = { en, pt, es };
const initialSettings: AdminCertificateSettings = {
  enabled: false,
  title: null,
  body: null,
  signatureUrl: null,
  signatureName: null,
  signatureRole: null,
  footer: null,
  accentColor: null,
  logoUrl: null,
};

function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={{ certificates: catalogs[locale] }}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preview.mockResolvedValue({
    dataUrl: 'data:application/pdf;base64,JVBERg==',
  });
  mocks.save.mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe.each(['en', 'pt', 'es'] as const)(
  'certificate administration in %s',
  (locale) => {
    const copy = catalogs[locale].admin;

    it('localizes every visible frame while keeping authored placeholders literal', async () => {
      render(
        <AdminCertificates
          initialSettings={initialSettings}
          tenantPrimaryColor="#0235A8"
        />,
        { wrapper: wrapper(locale) },
      );

      expect(screen.getByRole('heading', { name: copy.title })).toBeInTheDocument();
      expect(screen.getByText(copy.enabled)).toBeInTheDocument();
      expect(screen.getByText(copy.bodyHint.replaceAll("'", ''))).toBeInTheDocument();
      expect(screen.getByLabelText(copy.titleLabel)).toBeInTheDocument();
      expect(screen.getByLabelText(copy.bodyLabel)).toBeInTheDocument();
      expect(screen.getByLabelText(copy.footerLabel)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(copy.bodyPlaceholder.replaceAll("'", '')),
      ).toBeInTheDocument();
      expect(screen.getByText(copy.livePreview)).toBeInTheDocument();
      expect(screen.getByText(copy.previewStudent)).toBeInTheDocument();
      await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
    });

    it('saves authored text unchanged and reports success in the active locale', async () => {
      render(
        <AdminCertificates
          initialSettings={initialSettings}
          tenantPrimaryColor="#0235A8"
        />,
        { wrapper: wrapper(locale) },
      );
      fireEvent.change(screen.getByLabelText(copy.titleLabel), {
        target: { value: '  Título autoral  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: copy.saveTemplate }));

      await waitFor(() =>
        expect(mocks.save).toHaveBeenCalledWith(
          expect.objectContaining({ title: '  Título autoral  ' }),
        ),
      );
      expect(mocks.success).toHaveBeenCalledWith(copy.saveSuccess);
    });
  },
);

it('maps a stable preview code to localized copy instead of displaying the code', async () => {
  mocks.preview.mockResolvedValue({ error: 'preview_failed' });
  render(
    <AdminCertificates
      initialSettings={initialSettings}
      tenantPrimaryColor="#0235A8"
    />,
    { wrapper: wrapper('pt') },
  );
  await waitFor(() =>
    expect(mocks.danger).toHaveBeenCalledWith(
      pt.admin.errorTitle,
      pt.admin.errors.preview_failed,
    ),
  );
});

it('keeps authored empty strings in preview overrides instead of selecting defaults', async () => {
  render(
    <AdminCertificates
      initialSettings={{ ...initialSettings, title: '', body: '' }}
      tenantPrimaryColor="#0235A8"
    />,
    { wrapper: wrapper('en') },
  );
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({ title: '', body: '' }),
    ),
  );
});

it('refreshes the preview from the saved snapshot when changes are discarded', async () => {
  render(
    <AdminCertificates
      initialSettings={{ ...initialSettings, title: 'Saved authored title' }}
      tenantPrimaryColor="#0235A8"
    />,
    { wrapper: wrapper('en') },
  );
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText(en.admin.titleLabel), {
    target: { value: 'Discarded draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: en.admin.discard }));

  expect(screen.getByLabelText(en.admin.titleLabel)).toHaveValue(
    'Saved authored title',
  );
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Saved authored title' }),
    ),
  );
});

it('localizes exceptional preview and save action rejections', async () => {
  mocks.preview.mockRejectedValue(new Error('PRIVATE transport failure'));
  mocks.save.mockRejectedValue(new Error('PRIVATE action failure'));
  render(
    <AdminCertificates
      initialSettings={initialSettings}
      tenantPrimaryColor="#0235A8"
    />,
    { wrapper: wrapper('pt') },
  );
  await waitFor(() =>
    expect(mocks.danger).toHaveBeenCalledWith(
      pt.admin.errorTitle,
      pt.admin.errors.preview_failed,
    ),
  );

  fireEvent.change(screen.getByLabelText(pt.admin.titleLabel), {
    target: { value: 'Título' },
  });
  fireEvent.click(screen.getByRole('button', { name: pt.admin.saveTemplate }));
  await waitFor(() =>
    expect(mocks.danger).toHaveBeenCalledWith(
      pt.admin.errorTitle,
      pt.admin.errors.save_failed,
    ),
  );
});
