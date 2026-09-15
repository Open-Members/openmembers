import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profile: vi.fn(),
  tenantRead: vi.fn(),
  update: vi.fn(),
  updateResult: vi.fn(),
  insert: vi.fn(),
  preview: vi.fn(),
  revalidatePath: vi.fn(),
  getLocale: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.profile }),
      }),
    }),
  }),
}));
vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: mocks.tenantRead,
        update: vi.fn((payload: unknown) => {
          mocks.update(payload);
          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({ maybeSingle: mocks.updateResult })),
            })),
          };
        }),
        insert: mocks.insert,
      };
      return builder;
    },
  }),
}));
vi.mock('@/core/certificates/service', () => ({
  buildCertificatePreviewPdf: mocks.preview,
  loadCertificateTemplate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next-intl/server', () => ({ getLocale: mocks.getLocale }));

import {
  getAdminCertificateSettings,
  renderCertificatePreview,
  saveCertificateSettings,
  type AdminCertificateSettings,
} from './certificates';

const settings: AdminCertificateSettings = {
  enabled: true,
  title: '  Título autoral  ',
  body: '  Corpo {name}  ',
  signatureUrl: 'https://example.test/signature.png',
  signatureName: '  Maria  ',
  signatureRole: '  Direção  ',
  footer: '  Rodapé  ',
  accentColor: '#123456',
  logoUrl: 'https://example.test/logo.png',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'admin-1' } },
    error: null,
  });
  mocks.profile.mockResolvedValue({
    data: { role: 'admin', status: 'active', preferred_locale: 'pt' },
    error: null,
  });
  mocks.tenantRead.mockResolvedValue({ data: { id: 'tenant-1' }, error: null });
  mocks.updateResult.mockResolvedValue({
    data: { id: 'tenant-1' },
    error: null,
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.preview.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  mocks.getLocale.mockResolvedValue('en');
});

describe('certificate admin authorization and reads', () => {
  it.each([
    [{ data: { user: null }, error: null }, 'certificateAdminUnauthenticated'],
    [
      { data: { user: null }, error: { message: 'PRIVATE auth failure' } },
      'certificateAdminUnauthenticated',
    ],
  ] as const)('rejects an invalid identity result', async (identity, error) => {
    mocks.getUser.mockResolvedValue(identity);
    await expect(getAdminCertificateSettings()).rejects.toThrow(error);
    expect(mocks.tenantRead).not.toHaveBeenCalled();
  });

  it('rejects a profile read failure and inactive privilege', async () => {
    mocks.profile.mockResolvedValueOnce({
      data: null,
      error: { message: 'PRIVATE profile failure' },
    });
    await expect(getAdminCertificateSettings()).rejects.toThrow(
      'certificateAdminProfileReadFailed',
    );

    mocks.profile.mockResolvedValueOnce({
      data: { role: 'user', status: 'active', preferred_locale: 'pt' },
      error: null,
    });
    await expect(getAdminCertificateSettings()).rejects.toThrow(
      'certificateAdminForbidden',
    );
  });

  it('does not turn a failed settings read into empty settings', async () => {
    mocks.tenantRead.mockResolvedValue({
      data: null,
      error: { message: 'PRIVATE settings failure' },
    });
    await expect(getAdminCertificateSettings()).rejects.toThrow(
      'certificateSettingsReadFailed',
    );
  });

  it('keeps null defaults distinct from authored empty strings on read', async () => {
    mocks.tenantRead.mockResolvedValue({
      data: {
        certificate_title: null,
        certificate_body: '',
        certificate_signature_name: null,
        certificate_signature_role: '',
        certificate_footer: null,
      },
      error: null,
    });
    await expect(getAdminCertificateSettings()).resolves.toMatchObject({
      title: null,
      body: '',
      signatureName: null,
      signatureRole: '',
      footer: null,
    });
  });
});

describe('certificate admin mutations and preview', () => {
  it('preserves authored whitespace when saving an existing template', async () => {
    await expect(saveCertificateSettings(settings)).resolves.toEqual({
      success: true,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      certificate_enabled: true,
      certificate_title: '  Título autoral  ',
      certificate_body: '  Corpo {name}  ',
      certificate_signature_url: 'https://example.test/signature.png',
      certificate_signature_name: '  Maria  ',
      certificate_signature_role: '  Direção  ',
      certificate_footer: '  Rodapé  ',
      certificate_accent_color: '#123456',
      certificate_logo_url: 'https://example.test/logo.png',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/certificates');
  });

  it('preserves null provenance and authored empty strings independently', async () => {
    await saveCertificateSettings({
      ...settings,
      title: null,
      body: '',
      signatureName: null,
      signatureRole: '',
      footer: null,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        certificate_title: null,
        certificate_body: '',
        certificate_signature_name: null,
        certificate_signature_role: '',
        certificate_footer: null,
      }),
    );
  });

  it('maps settings lookup and write failures to stable codes', async () => {
    mocks.tenantRead.mockResolvedValueOnce({
      data: null,
      error: { message: 'PRIVATE read details' },
    });
    await expect(saveCertificateSettings(settings)).resolves.toEqual({
      error: 'settings_read_failed',
    });

    mocks.tenantRead.mockResolvedValueOnce({
      data: { id: 'tenant-1' },
      error: null,
    });
    mocks.updateResult.mockResolvedValue({
      data: null,
      error: { message: 'PRIVATE write details' },
    });
    await expect(saveCertificateSettings(settings)).resolves.toEqual({
      error: 'save_failed',
    });
  });

  it('does not report success when a concurrent deletion updates no row', async () => {
    mocks.updateResult.mockResolvedValue({ data: null, error: null });
    await expect(saveCertificateSettings(settings)).resolves.toEqual({
      error: 'save_failed',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    { ...settings, enabled: 'true' },
    { ...settings, title: 42 },
    { ...settings, signatureUrl: 'javascript:alert(1)' },
    { ...settings, logoUrl: 'https://user:password@example.test/logo.png' },
    { ...settings, accentColor: '#fff' },
  ])('rejects a malformed runtime payload before writing it', async (input) => {
    await expect(
      saveCertificateSettings(input as unknown as AdminCertificateSettings),
    ).resolves.toEqual({ error: 'invalid_settings' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('renders preview data in the effective administrator locale', async () => {
    const overrides = { title: 'Título autoral' };
    const result = await renderCertificatePreview(overrides);
    expect(mocks.preview).toHaveBeenCalledWith('pt', overrides);
    expect(result).toEqual({
      dataUrl: 'data:application/pdf;base64,JVBERg==',
    });
  });

  it('uses the negotiated request locale when the profile preference is null', async () => {
    mocks.profile.mockResolvedValue({
      data: { role: 'admin', status: 'active', preferred_locale: null },
      error: null,
    });
    mocks.getLocale.mockResolvedValue('es');
    await renderCertificatePreview();
    expect(mocks.preview).toHaveBeenCalledWith('es', undefined);
  });

  it('never returns a raw preview provider message', async () => {
    mocks.preview.mockRejectedValue(new Error('PRIVATE pdf diagnostic'));
    await expect(renderCertificatePreview()).resolves.toEqual({
      error: 'preview_failed',
    });
  });
});
