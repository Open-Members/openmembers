export const locales = ['en', 'es', 'pt'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.some(locale => locale === value);
}

export function resolveLocale(preferred: unknown, negotiated: unknown): Locale {
  return isLocale(preferred) ? preferred : isLocale(negotiated) ? negotiated : defaultLocale;
}
