// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

type DbResponse = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  getUserById: vi.fn(),
  generateCertificate: vi.fn(),
}));

vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/core/pdf/certificate', async () => {
  const actual = await vi.importActual<typeof import('@/core/pdf/certificate')>(
    '@/core/pdf/certificate',
  );
  return { ...actual, generateCertificate: mocks.generateCertificate };
});

import {
  buildCertificatePdf,
  buildCertificatePreviewPdf,
  checkCertificateEligibility,
  issueCertificate,
  loadCertificateTemplate,
} from './service';

let queues: Record<string, DbResponse[]>;

function take(table: string): DbResponse {
  const response = queues[table]?.shift();
  if (!response) throw new Error(`Missing mocked response for ${table}`);
  return response;
}

function response(data: unknown, error: DbResponse['error'] = null): DbResponse {
  return { data, error };
}

beforeEach(() => {
  vi.resetAllMocks();
  queues = {
    courses: [
      response({
        id: 'course-1',
        title: 'Gestão Avançada',
        certificate_enabled: true,
        is_published: true,
      }),
    ],
    tenant_settings: [response({ certificate_enabled: true })],
    modules: [response([{ id: 'module-1' }])],
    lessons: [response([{ id: 'lesson-1' }, { id: 'lesson-2' }])],
    lesson_progress: [
      response([
        { lesson_id: 'lesson-1', completed_at: '2026-09-10T12:00:00Z' },
        { lesson_id: 'lesson-2', completed_at: '2026-09-12T12:00:00Z' },
      ]),
    ],
  };

  mocks.from.mockImplementation((table: string) => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn((payload: unknown) => {
        mocks.insert(table, payload);
        return builder;
      }),
      maybeSingle: vi.fn(async () => take(table)),
      single: vi.fn(async () => take(table)),
      then: (
        resolve: (value: DbResponse) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(take(table)).then(resolve, reject),
    };
    return builder;
  });
  mocks.getUserById.mockResolvedValue({
    data: { user: { email: 'student@example.test' } },
    error: null,
  });
  mocks.generateCertificate.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  mocks.createAdminClient.mockReturnValue({
    from: mocks.from,
    auth: { admin: { getUserById: mocks.getUserById } },
  });
});

describe('certificate eligibility reads', () => {
  it('uses the latest completed lesson timestamp', async () => {
    await expect(
      checkCertificateEligibility(
        'user-1',
        'course-1',
        new Date('2030-01-01T00:00:00Z'),
      ),
    ).resolves.toEqual({
      eligible: true,
      courseTitle: 'Gestão Avançada',
      completionDate: '2026-09-12T12:00:00Z',
    });
  });

  it.each([
    ['courses', 'certificateEligibilityReadFailed'],
    ['tenant_settings', 'certificateEligibilityReadFailed'],
    ['modules', 'certificateModulesReadFailed'],
    ['lessons', 'certificateLessonsReadFailed'],
    ['lesson_progress', 'certificateProgressReadFailed'],
  ] as const)('does not treat a %s read failure as empty data', async (table, error) => {
    queues[table][0] = response(null, { message: 'PRIVATE database details' });
    await expect(
      checkCertificateEligibility('user-1', 'course-1'),
    ).rejects.toThrow(error);
  });
});

describe('certificate template provenance', () => {
  it.each([
    ['en', 'Certificate of Completion'],
    ['pt', 'Certificado de Conclusão'],
    ['es', 'Certificado de Finalización'],
  ] as const)('fills a null title with the %s product default', async (locale, title) => {
    queues.tenant_settings = [response({ certificate_title: null })];
    await expect(loadCertificateTemplate(locale)).resolves.toMatchObject({
      title,
      body: '',
      footer: null,
    });
  });

  it('preserves every non-null authored field exactly, including whitespace and empty strings', async () => {
    queues.tenant_settings = [
      response({
        primary_color: '#111111',
        logo_url: 'brand-logo',
        certificate_title: '',
        certificate_body: '  Corpo autoral  ',
        certificate_signature_url: '',
        certificate_signature_name: '  Nome autoral  ',
        certificate_signature_role: '',
        certificate_footer: '  Rodapé autoral  ',
        certificate_accent_color: '',
        certificate_logo_url: '',
      }),
    ];
    await expect(loadCertificateTemplate('pt')).resolves.toEqual({
      title: '',
      body: '  Corpo autoral  ',
      signatureUrl: '',
      signatureName: '  Nome autoral  ',
      signatureRole: '',
      footer: '  Rodapé autoral  ',
      accentColor: '',
      logoUrl: '',
      logoFallbackUrl: null,
    });
  });

  it('keeps a global logo separate as an optional fallback', async () => {
    queues.tenant_settings = [
      response({
        certificate_logo_url: null,
        logo_light_url: 'https://example.test/brand.svg',
      }),
    ];
    await expect(loadCertificateTemplate('en')).resolves.toMatchObject({
      logoUrl: null,
      logoFallbackUrl: 'https://example.test/brand.svg',
    });
  });

  it('fails when the template read fails', async () => {
    queues.tenant_settings = [
      response(null, { message: 'PRIVATE template failure' }),
    ];
    await expect(loadCertificateTemplate('en')).rejects.toThrow(
      'certificateTemplateReadFailed',
    );
  });
});

describe('concurrent certificate issuance', () => {
  const existing = {
    id: 'certificate-1',
    verification_code: 'EXISTING',
    issued_at: '2026-09-12T12:00:00Z',
  };

  it('returns an existing certificate only after a confirmed read', async () => {
    queues.certificates = [response(existing)];
    await expect(
      issueCertificate('user-1', 'course-1', existing.issued_at),
    ).resolves.toEqual({
      id: 'certificate-1',
      verificationCode: 'EXISTING',
      issuedAt: existing.issued_at,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not treat an initial certificate read failure as a missing row', async () => {
    queues.certificates = [
      response(null, { message: 'PRIVATE initial read failure' }),
    ];
    await expect(
      issueCertificate('user-1', 'course-1', existing.issued_at),
    ).rejects.toThrow('certificateIssueReadFailed');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not expose a non-conflict insert failure', async () => {
    queues.certificates = [
      response(null),
      response(null, { message: 'PRIVATE insert failure', code: '42501' }),
    ];
    await expect(
      issueCertificate('user-1', 'course-1', existing.issued_at),
    ).rejects.toThrow('certificateIssueFailed');
  });

  it('re-reads the user/course winner after a 23505 insert race', async () => {
    queues.certificates = [
      response(null),
      response(null, { message: 'PRIVATE conflict', code: '23505' }),
      response(existing),
    ];
    await expect(
      issueCertificate('user-1', 'course-1', existing.issued_at),
    ).resolves.toEqual({
      id: 'certificate-1',
      verificationCode: 'EXISTING',
      issuedAt: existing.issued_at,
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it('rejects a 23505 when the user/course winner cannot be confirmed', async () => {
    queues.certificates = [
      response(null),
      response(null, { message: 'PRIVATE conflict', code: '23505' }),
      response(null),
    ];
    await expect(
      issueCertificate('user-1', 'course-1', existing.issued_at),
    ).rejects.toThrow('certificateIssueConflictReadFailed');
  });
});

describe('certificate build orchestration', () => {
  function buildQueues(profile: unknown) {
    queues.profiles = [response(profile)];
    queues.tenant_settings.push(
      response({ certificate_title: null, primary_color: '#123456' }),
    );
    queues.certificates = [
      response({
        id: 'certificate-1',
        verification_code: 'VERIFY123',
        issued_at: '2026-09-12T12:00:00Z',
      }),
    ];
  }

  it('uses the profile locale, localized defaults and authored identity', async () => {
    buildQueues({ display_name: '  João Muñoz  ', preferred_locale: 'pt' });
    const result = await buildCertificatePdf(
      'user-1',
      'course-1',
      { now: new Date('2026-09-12T12:00:00Z') },
    );

    expect(result).toEqual({
      bytes: new Uint8Array([37, 80, 68, 70]),
      fileName: 'certificado-gestao-avancada.pdf',
    });
    expect(mocks.generateCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Certificado de Conclusão' }),
      expect.objectContaining({
        recipientName: 'João Muñoz',
        courseTitle: 'Gestão Avançada',
        verificationCode: 'VERIFY123',
      }),
      expect.objectContaining({ locale: 'pt' }),
    );
    expect(mocks.getUserById).not.toHaveBeenCalled();
  });

  it('uses the localized student fallback only after a confirmed auth lookup', async () => {
    buildQueues({ display_name: ' ', preferred_locale: 'es' });
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: null } },
      error: null,
    });
    await buildCertificatePdf('user-1', 'course-1');
    expect(mocks.generateCertificate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientName: 'Estudiante' }),
      expect.objectContaining({ locale: 'es' }),
    );
  });

  it('uses the request hint when an existing profile has no saved locale', async () => {
    buildQueues({ display_name: 'María', preferred_locale: null });
    const result = await buildCertificatePdf('user-1', 'course-1', {
      localeHint: 'es',
    });
    expect(result).toEqual({
      bytes: new Uint8Array([37, 80, 68, 70]),
      fileName: 'certificado-gestao-avancada.pdf',
    });
    expect(mocks.generateCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Certificado de Finalización' }),
      expect.anything(),
      expect.objectContaining({ locale: 'es' }),
    );
  });

  it('does not invent identity after an auth provider failure', async () => {
    buildQueues({ display_name: ' ', preferred_locale: 'pt' });
    mocks.getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'PRIVATE auth provider failure' },
    });
    await expect(
      buildCertificatePdf('user-1', 'course-1'),
    ).resolves.toEqual({ error: 'certificate_unavailable' });
    expect(mocks.generateCertificate).not.toHaveBeenCalled();
  });

  it('returns a stable unavailable code for profile and provider read failures', async () => {
    queues.profiles = [
      response(null, { message: 'PRIVATE profile failure' }),
    ];
    await expect(
      buildCertificatePdf('user-1', 'course-1'),
    ).resolves.toEqual({ error: 'certificate_unavailable' });
    expect(mocks.generateCertificate).not.toHaveBeenCalled();
  });

  it('maps a configured asset failure to the stable generation code', async () => {
    buildQueues({ display_name: 'João', preferred_locale: 'pt' });
    mocks.generateCertificate.mockRejectedValue(
      new Error('certificateImageFetchFailed: PRIVATE upstream diagnostic'),
    );
    await expect(
      buildCertificatePdf('user-1', 'course-1'),
    ).resolves.toEqual({ error: 'certificate_generation_failed' });
  });
});

describe('certificate preview branding', () => {
  it('retains the global fallback when the certificate logo uses its null default', async () => {
    queues.tenant_settings = [
      response({
        certificate_logo_url: null,
        logo_light_url: 'https://example.test/global.svg',
      }),
    ];
    await buildCertificatePreviewPdf('en', { logoUrl: null });
    expect(mocks.generateCertificate).toHaveBeenCalledWith(
      expect.objectContaining({
        logoUrl: null,
        logoFallbackUrl: 'https://example.test/global.svg',
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('disables the global fallback for an explicit preview logo', async () => {
    queues.tenant_settings = [
      response({
        certificate_logo_url: null,
        logo_light_url: 'https://example.test/global.svg',
      }),
    ];
    await buildCertificatePreviewPdf('en', {
      logoUrl: 'https://example.test/certificate.png',
    });
    expect(mocks.generateCertificate).toHaveBeenCalledWith(
      expect.objectContaining({
        logoUrl: 'https://example.test/certificate.png',
        logoFallbackUrl: null,
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});
