import { defaultLocale, isLocale, type Locale } from './config';

function normalizeLocale(value: string | undefined): Locale | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const normalized = decoded.trim().toLowerCase().replace('_', '-');
  if (isLocale(normalized)) return normalized;
  const base = normalized.split('-')[0];
  return isLocale(base) ? base : null;
}

/** Resolve the last-resort UI without requiring the i18n provider or database. */
export function resolveGlobalErrorLocale(
  cookieHeader: string,
  browserLanguages: readonly string[],
): Locale {
  const cookieLocale = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('NEXT_LOCALE='))
    ?.slice('NEXT_LOCALE='.length);
  const fromCookie = normalizeLocale(cookieLocale);
  if (fromCookie) return fromCookie;

  for (const language of browserLanguages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return defaultLocale;
}
