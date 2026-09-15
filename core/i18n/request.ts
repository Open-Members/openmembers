import { getRequestConfig } from 'next-intl/server';
import { isLocale } from './config';
import { getPreferredLocale } from './preference.server';

export default getRequestConfig(async ({ requestLocale, locale: override }) => {
  // Explicit internal overrides (e.g. recipient messages) win; otherwise the
  // authenticated account preference wins over cookie/browser negotiation.
  const locale = isLocale(override) ? override : await getPreferredLocale(await requestLocale);

  return {
    locale,
    // Shared initial clock for server markup and client hydration; timers advance it after mount.
    now: new Date(),
    messages: (await import(`./locales/${locale}/index.ts`)).default,
  };
});
