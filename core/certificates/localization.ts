import { resolveLocale, type Locale } from '@/core/i18n/config';
import en from '@/core/i18n/locales/en/certificates.json';
import es from '@/core/i18n/locales/es/certificates.json';
import pt from '@/core/i18n/locales/pt/certificates.json';

export type CertificateCatalog = typeof en;
export type CertificatePdfCopy = CertificateCatalog['pdf'];
export type CertificateWatermarkCopy = CertificateCatalog['watermark'];

const CATALOGS: Record<Locale, CertificateCatalog> = { en, es, pt };

const DATE_LOCALES: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
};

const MAX_CERTIFICATE_FILE_NAME_LENGTH = 120;

function fileNameSegment(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function resolveCertificateLocale(
  preferred: unknown,
  negotiated?: unknown,
): Locale {
  return resolveLocale(preferred, negotiated);
}

export function getCertificateCatalog(locale: Locale): CertificateCatalog {
  return CATALOGS[locale];
}

export function getCertificatePdfCopy(locale: Locale): CertificatePdfCopy {
  return CATALOGS[locale].pdf;
}

export function getCertificateWatermarkCopy(
  locale: Locale,
): CertificateWatermarkCopy {
  return CATALOGS[locale].watermark;
}

/** Accept only the conservative ASCII shape emitted by the certificate builder. */
export function isSafeCertificateFileName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_CERTIFICATE_FILE_NAME_LENGTH
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.pdf$/i.test(value);
}

/** Build the download name from the same locale used to render the PDF. */
export function buildCertificateFileName(
  courseTitle: unknown,
  locale: Locale,
): string {
  const download = CATALOGS[locale].download;
  const fallback = isSafeCertificateFileName(download.fileNameFallback)
    ? download.fileNameFallback
    : 'certificate.pdf';
  const prefix = fileNameSegment(download.fileNamePrefix);
  if (!prefix) return fallback;

  const maxSlugLength = MAX_CERTIFICATE_FILE_NAME_LENGTH
    - prefix.length
    - '-.pdf'.length;
  const courseSlug = fileNameSegment(courseTitle)
    .slice(0, Math.max(0, maxSlugLength))
    .replace(/-+$/g, '');
  if (!courseSlug) return fallback;

  const fileName = `${prefix}-${courseSlug}.pdf`;
  return isSafeCertificateFileName(fileName) ? fileName : fallback;
}

export function formatCertificateDate(
  value: string | Date,
  locale: Locale,
  style: 'long' | 'medium' = 'long',
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('invalidCertificateDate');

  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    year: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function fillCertificateCopy(
  value: string,
  params: Record<string, string>,
): string {
  return value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? params[key] : match,
  );
}
