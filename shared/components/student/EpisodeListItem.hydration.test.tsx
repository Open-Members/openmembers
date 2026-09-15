import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes } from 'react';
import en from '@/core/i18n/locales/en/learningOverview.json';
import pt from '@/core/i18n/locales/pt/learningOverview.json';
import es from '@/core/i18n/locales/es/learningOverview.json';
import { EpisodeListItem } from './EpisodeListItem';

vi.mock('@/core/i18n/routing', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const catalogs = { en, pt, es };
const requestNow = new Date('2026-09-01T12:00:00Z');
const unlockAt = '2026-09-01T12:00:30Z';
let root: Root | undefined;
let container: HTMLDivElement;
let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(requestNow);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['en', 'pt', 'es'] as const)(
  'episode release SSR hydration in %s',
  (locale) => {
    const t = createTranslator({ locale, messages: catalogs[locale] });

    it('keeps the request clock through hydration, then updates after the interval', async () => {
      const tree = (
        <NextIntlClientProvider
          locale={locale}
          messages={{ learningOverview: catalogs[locale] }}
          now={requestNow}
          timeZone="UTC"
        >
          <EpisodeListItem
            index={1}
            title="Authored lesson"
            isDripLocked
            dripUnlockDate={unlockAt}
          />
        </NextIntlClientProvider>
      );

      container.innerHTML = renderToString(tree);
      const waiting = t('episode.unlockDays', { count: 1 });
      expect(container).toHaveTextContent(waiting);

      vi.setSystemTime(new Date('2026-09-01T12:00:45Z'));
      const onRecoverableError = vi.fn();
      await act(async () => {
        root = hydrateRoot(container, tree, { onRecoverableError });
      });

      expect(container).toHaveTextContent(waiting);
      expect(onRecoverableError).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(container).toHaveTextContent(t('episode.unlocked'));
      expect(container).not.toHaveTextContent(waiting);
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    });
  },
);
