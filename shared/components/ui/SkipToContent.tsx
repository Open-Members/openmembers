import { getTranslations } from 'next-intl/server';

/**
 * Skip-to-content link for keyboard users. Always rendered, visually
 * hidden until focused. The href targets `#main-content`, which the
 * authed and public layouts apply to their <main> element.
 *
 * Standard a11y pattern (Apple, GitHub, GOV.UK) so users who tab from
 * the URL bar can jump past the nav with one keystroke.
 */
export async function SkipToContent() {
  const t = await getTranslations('navigation');
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--color-primary)] focus:text-white focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-primary)]"
    >
      {t('skipToContent')}
    </a>
  );
}
