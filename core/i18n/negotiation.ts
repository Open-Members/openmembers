import { defaultLocale, isLocale, type Locale } from './config';

/** Negotiate requests outside the locale proxy, such as the web manifest. */
export function negotiateLocale(cookie: unknown, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;

  const languages = (acceptLanguage ?? '').split(',').flatMap((entry, index) => {
    const match = entry.trim().toLowerCase().match(/^([a-z]{1,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/);
    if (!match) return [];
    const language = match[1].split('-')[0];
    const quality = match[2] === undefined ? 1 : Number(match[2]);
    return isLocale(language) && quality > 0 ? [{ language, quality, index }] : [];
  });
  languages.sort((a, b) => b.quality - a.quality || a.index - b.index);
  // Wildcards and unsupported or malformed entries do not invent a locale.
  return languages[0]?.language ?? defaultLocale;
}
