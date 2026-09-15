import { describe, expect, it } from 'vitest';
import en from '@/core/i18n/locales/en/certificates.json';
import es from '@/core/i18n/locales/es/certificates.json';
import pt from '@/core/i18n/locales/pt/certificates.json';
import {
  buildCertificateFileName,
  fillCertificateCopy,
  formatCertificateDate,
  getCertificatePdfCopy,
  isSafeCertificateFileName,
  resolveCertificateLocale,
} from './localization';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('certificate localization contract', () => {
  it('keeps exact key parity in EN, PT and ES', () => {
    const expected = leafKeys(en).sort();
    expect(leafKeys(pt).sort()).toEqual(expected);
    expect(leafKeys(es).sort()).toEqual(expected);
  });

  it.each([
    ['en', 'September 12, 2026'],
    ['pt', '12 de setembro de 2026'],
    ['es', '12 de septiembre de 2026'],
  ] as const)('formats %s dates in UTC', (locale, expected) => {
    expect(
      formatCertificateDate('2026-09-12T00:30:00.000-03:00', locale),
    ).toBe(expected);
  });

  it('resolves invalid preferences to EN and interpolates only known values', () => {
    expect(resolveCertificateLocale('pt')).toBe('pt');
    expect(resolveCertificateLocale(null, 'es')).toBe('es');
    expect(resolveCertificateLocale('invalid')).toBe('en');
    expect(getCertificatePdfCopy('es').defaultTitle).toBe(
      'Certificado de Finalización',
    );
    expect(
      fillCertificateCopy('Code {code}; {unknown}', { code: 'ABC123' }),
    ).toBe('Code ABC123; {unknown}');
  });

  it.each([
    ['en', 'Gestão Avançada', 'certificate-gestao-avancada.pdf'],
    ['pt', 'Gestão Avançada', 'certificado-gestao-avancada.pdf'],
    ['es', 'Programación práctica', 'certificado-programacion-practica.pdf'],
  ] as const)('builds a localized ASCII filename in %s', (locale, title, expected) => {
    expect(buildCertificateFileName(title, locale)).toBe(expected);
  });

  it('uses the localized fallback for an empty or path-only title', () => {
    expect(buildCertificateFileName('../../\\\r\n"', 'en')).toBe('certificate.pdf');
    expect(buildCertificateFileName('../../\\\r\n"', 'pt')).toBe('certificado.pdf');
    expect(buildCertificateFileName('../../\\\r\n"', 'es')).toBe('certificado.pdf');
  });

  it('limits long names and strips traversal, controls and header punctuation', () => {
    const fileName = buildCertificateFileName(
      `../../Gestão\r\nContent-Disposition: attachment; filename="private.pdf" ${'x'.repeat(300)}`,
      'pt',
    );
    expect(fileName.length).toBeLessThanOrEqual(120);
    expect(fileName).toMatch(/^certificado-[a-z0-9-]+\.pdf$/);
    expect(fileName).not.toMatch(/[\\/\r\n";]|\.\./);
    expect(isSafeCertificateFileName(fileName)).toBe(true);
  });

  it.each([
    '../private.pdf',
    '..\\private.pdf',
    'certificate..pdf',
    'certificate\r\n.pdf',
    'certificate".pdf',
    'certificate;.pdf',
    `${'a'.repeat(117)}.pdf`,
  ])('rejects an unsafe response filename: %s', (fileName) => {
    expect(isSafeCertificateFileName(fileName)).toBe(false);
  });
});
