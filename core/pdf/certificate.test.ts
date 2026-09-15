// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const mocks = vi.hoisted(() => ({ fetchCertificateImage: vi.fn() }));
vi.mock('@/core/pdf/safe-image', () => ({
  fetchCertificateImage: mocks.fetchCertificateImage,
}));
import type { Locale } from '@/core/i18n/config';
import {
  formatCertificateDate,
  getCertificatePdfCopy,
} from '@/core/certificates/localization';
import {
  generateCertificate,
  wrapCertificateText,
  type CertificateData,
  type CertificateTemplate,
} from './certificate';
import { addWatermark, fitRotatedWatermarkPlacement } from './watermark';

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' '),
      );
    }
    return pages.join(' ');
  } finally {
    await task.destroy();
  }
}

function template(locale: Locale): CertificateTemplate {
  return {
    title: getCertificatePdfCopy(locale).defaultTitle,
    body: '',
    signatureUrl: null,
    signatureName: null,
    signatureRole: null,
    footer: null,
    accentColor: '#0235A8',
    logoUrl: null,
  };
}

const data: CertificateData = {
  recipientName: 'João Muñoz',
  courseTitle: 'Gestão e Produção Audiovisual',
  date: '2026-09-12T23:30:00.000-03:00',
  verificationCode: 'ÁBC123',
};

beforeEach(() => {
  mocks.fetchCertificateImage.mockReset();
});

describe('localized certificate PDF', () => {
  it.each(['en', 'pt', 'es'] as const)(
    'renders the %s frame, UTC date and Latin accents on one page',
    async (locale) => {
      const copy = getCertificatePdfCopy(locale);
      const bytes = await generateCertificate(template(locale), data, {
        locale,
        copy,
      });
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(1);
      const text = await extractPdfText(bytes);
      expect(text).toContain(copy.defaultTitle);
      expect(text).toContain(copy.intro);
      expect(text).toContain(copy.completion);
      expect(text).toContain('João Muñoz');
      expect(text).toContain('Gestão e Produção Audiovisual');
      expect(text).toContain(formatCertificateDate(data.date, locale));
    },
  );

  it('keeps authored copy and wraps a long title and body instead of dropping them', async () => {
    const copy = getCertificatePdfCopy('pt');
    const authored = template('pt');
    authored.title =
      'Certificado Internacional de Conclusão em Produção e Gestão Audiovisual';
    authored.body =
      '{name} concluiu {course}. Este texto  autoral   permanece integral no documento e continua em uma segunda linha.';
    authored.footer = 'Organização Açúcar & Educação';
    authored.signatureName = 'Direção Acadêmica';
    authored.signatureRole = 'Coordenação Geral';

    const bytes = await generateCertificate(authored, data, {
      locale: 'pt',
      copy,
    });
    const text = await extractPdfText(bytes);
    expect(text).toContain('Certificado Internacional de Conclusão');
    expect(text).toContain('Este texto autoral');
    expect(text).toContain('segunda linha.');
    expect(text).toContain('Organização Açúcar & Educação');
    expect(text).toContain('Direção Acadêmica');
  });

  it('fails explicitly when authored content cannot fit safely', async () => {
    const copy = getCertificatePdfCopy('en');
    await expect(
      generateCertificate(
        { ...template('en'), body: 'authored '.repeat(400) },
        data,
        { locale: 'en', copy },
      ),
    ).rejects.toThrow();
  });

  it('fails when an explicitly configured certificate asset cannot load', async () => {
    mocks.fetchCertificateImage.mockRejectedValue(
      new Error('certificateImageTypeInvalid'),
    );
    await expect(
      generateCertificate(
        { ...template('en'), logoUrl: 'https://example.test/logo.svg' },
        data,
        { locale: 'en', copy: getCertificatePdfCopy('en') },
      ),
    ).rejects.toThrow('certificateImageTypeInvalid');
  });

  it('omits an incompatible global branding fallback without blocking issuance', async () => {
    mocks.fetchCertificateImage.mockRejectedValue(
      new Error('certificateImageTypeInvalid'),
    );
    const bytes = await generateCertificate(
      {
        ...template('en'),
        logoFallbackUrl: 'https://example.test/global-brand.svg',
      },
      data,
      { locale: 'en', copy: getCertificatePdfCopy('en') },
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

it('localizes an attachment watermark with an explicit UTC instant', async () => {
  const source = await PDFDocument.create();
  source.addPage([600, 800]);
  const bytes = await source.save();
  const watermarked = await addWatermark(bytes, {
    name: 'João Muñoz',
    email: 'joao@example.test',
    locale: 'pt',
    downloadedAt: '2026-09-12T23:30:00.000-03:00',
  });
  const text = await extractPdfText(watermarked);
  expect(text).toContain('João Muñoz · joao@example.test');
  expect(text).toContain('Baixado em 13 de set. de 2026');
});

it('fits the projected rotated watermark inside both page axes', async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const placement = fitRotatedWatermarkPlacement(
    font,
    `${'Long identity '.repeat(4)}· student@example.test`,
    900,
    220,
  );
  expect(placement.bounds.left).toBeGreaterThanOrEqual(40);
  expect(placement.bounds.right).toBeLessThanOrEqual(860);
  expect(placement.bounds.bottom).toBeGreaterThanOrEqual(40);
  expect(placement.bounds.top).toBeLessThanOrEqual(180);
});

it('wraps authored whitespace without trimming or collapsing it', async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const authored = '  Texto  autoral   com espaços preservados  ';
  const lines = wrapCertificateText(font, authored, 120, 12);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join('')).toBe(authored);
});
