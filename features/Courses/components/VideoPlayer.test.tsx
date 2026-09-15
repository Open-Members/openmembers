import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/learningMedia.json';
import pt from '@/core/i18n/locales/pt/learningMedia.json';
import es from '@/core/i18n/locales/es/learningMedia.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const catalogs = { en, pt, es };
function render(ui: ReactElement, locale: keyof typeof catalogs = 'en') {
  return rtlRender(ui, { wrapper: ({ children }) => (
    <NextIntlClientProvider locale={locale} messages={{ learningMedia: catalogs[locale] }} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  ) });
}

const r2Player = vi.hoisted(() => vi.fn());
vi.mock('./R2VideoPlayer', () => ({
  R2VideoPlayer: (props: unknown) => {
    r2Player(props);
    return <div data-testid="r2-player" />;
  },
}));

const providers = [
  {
    provider: 'youtube' as const,
    externalId: 'demo-video1',
    origin: 'https://www.youtube.com',
    progress: (current: unknown = 42, duration: unknown = 120) => ({
      event: 'infoDelivery', info: { currentTime: current, duration },
    }),
    ended: { event: 'onStateChange', info: 0 },
    subscriptions: [
      { event: 'listening', id: 1, channel: 'widget' },
      { event: 'command', func: 'addEventListener', args: ['onStateChange'] },
    ],
  },
  {
    provider: 'vimeo' as const,
    externalId: '12345678',
    origin: 'https://player.vimeo.com',
    progress: (current: unknown = 42, duration: unknown = 120) => ({
      event: 'timeupdate', data: { seconds: current, duration },
    }),
    ended: { event: 'ended' },
    subscriptions: [
      { method: 'addEventListener', value: 'ended' },
      { method: 'addEventListener', value: 'timeupdate' },
    ],
  },
];

function iframeWindow() {
  return (screen.getByTitle('Video lesson') as HTMLIFrameElement).contentWindow!;
}

function message(origin: string, source: MessageEventSource | null, data: unknown) {
  fireEvent(window, new MessageEvent('message', { origin, source, data }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  r2Player.mockClear();
});

for (const fixture of providers) {
  describe(`${fixture.provider} iframe events`, () => {
    it.each(['object', 'json'] as const)('keeps legitimate progress and ended events (%s)', (format) => {
      const onProgress = vi.fn();
      const onEnded = vi.fn();
      render(<VideoPlayer {...fixture} onProgress={onProgress} onEnded={onEnded} />);
      const source = iframeWindow();
      const encode = (value: unknown) => format === 'json' ? JSON.stringify(value) : value;

      message(fixture.origin, source, encode(fixture.progress()));
      message(fixture.origin, source, encode(fixture.ended));

      expect(onProgress).toHaveBeenCalledExactlyOnceWith(42, 120);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('rejects lookalike domains, unexpected schemes/ports, opaque and other-provider origins', () => {
      const onProgress = vi.fn();
      const onEnded = vi.fn();
      render(<VideoPlayer {...fixture} onProgress={onProgress} onEnded={onEnded} />);
      const source = iframeWindow();
      const host = new URL(fixture.origin).host;
      const rejected = [
        `${fixture.origin}.attacker.test`,
        `https://attacker-${host}`,
        `http://${host}`,
        `${fixture.origin}:8443`,
        'null',
        '',
        providers.find((other) => other.provider !== fixture.provider)!.origin,
      ];
      for (const origin of rejected) {
        message(origin, source, fixture.progress());
        message(origin, source, fixture.ended);
        expect(onProgress, origin).not.toHaveBeenCalled();
        expect(onEnded, origin).not.toHaveBeenCalled();
      }
    });

    it('rejects another frame, the parent window, and a missing source even with a trusted origin', () => {
      const onProgress = vi.fn();
      const onEnded = vi.fn();
      render(<VideoPlayer {...fixture} onProgress={onProgress} onEnded={onEnded} />);
      const otherFrame = document.createElement('iframe');
      document.body.appendChild(otherFrame);
      try {
        for (const source of [otherFrame.contentWindow, window, null]) {
          message(fixture.origin, source, fixture.progress());
          message(fixture.origin, source, fixture.ended);
        }
        expect(onProgress).not.toHaveBeenCalled();
        expect(onEnded).not.toHaveBeenCalled();
      } finally {
        otherFrame.remove();
      }
    });

    it('sends every subscription only to the active provider origin after iframe load', () => {
      render(<VideoPlayer {...fixture} />);
      const postMessage = vi.spyOn(iframeWindow(), 'postMessage');
      fireEvent.load(screen.getByTitle('Video lesson'));
      expect(postMessage.mock.calls).toEqual(
        fixture.subscriptions.map((data) => [JSON.stringify(data), fixture.origin]),
      );
    });

    it('ignores malformed payloads and invalid positions', () => {
      const onProgress = vi.fn();
      const onEnded = vi.fn();
      render(<VideoPlayer {...fixture} onProgress={onProgress} onEnded={onEnded} />);
      const source = iframeWindow();
      for (const data of [null, false, [], '{invalid', 42, 'null', '[]', {}]) {
        message(fixture.origin, source, data);
      }
      for (const current of [-1, NaN, Infinity, -Infinity, '42', null]) {
        message(fixture.origin, source, fixture.progress(current));
      }
      expect(onProgress).not.toHaveBeenCalled();
      expect(onEnded).not.toHaveBeenCalled();
    });

    it('keeps zero positions and reports unknown or invalid duration as zero', () => {
      const onProgress = vi.fn();
      render(<VideoPlayer {...fixture} onProgress={onProgress} />);
      const source = iframeWindow();
      for (const duration of [-1, NaN, Infinity, -Infinity, '120', null]) {
        message(fixture.origin, source, fixture.progress(0, duration));
      }
      expect(onProgress.mock.calls).toEqual(Array.from({ length: 6 }, () => [0, 0]));
      const noDuration = fixture.provider === 'youtube'
        ? { event: 'infoDelivery', info: { currentTime: 5 } }
        : { event: 'timeupdate', data: { seconds: 5 } };
      message(fixture.origin, source, noDuration);
      expect(onProgress).toHaveBeenLastCalledWith(5, 0);
    });

    it('uses current callbacks without adding duplicate listeners', () => {
      const oldProgress = vi.fn();
      const oldEnded = vi.fn();
      const onProgress = vi.fn();
      const onEnded = vi.fn();
      const view = render(<VideoPlayer {...fixture} onProgress={oldProgress} onEnded={oldEnded} />);
      view.rerender(<VideoPlayer {...fixture} onProgress={onProgress} onEnded={onEnded} />);
      message(fixture.origin, iframeWindow(), fixture.progress());
      message(fixture.origin, iframeWindow(), fixture.ended);
      expect(oldProgress).not.toHaveBeenCalled();
      expect(oldEnded).not.toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledExactlyOnceWith(42, 120);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('removes old listeners and rejects the previous lesson frame after remount', () => {
      const oldEnded = vi.fn();
      const view = render(<VideoPlayer {...fixture} onEnded={oldEnded} />);
      const oldSource = iframeWindow();
      view.unmount();
      message(fixture.origin, oldSource, fixture.ended);
      expect(oldEnded).not.toHaveBeenCalled();

      const onEnded = vi.fn();
      render(<VideoPlayer {...fixture} onEnded={onEnded} />);
      message(fixture.origin, oldSource, fixture.ended);
      expect(onEnded).not.toHaveBeenCalled();
      message(fixture.origin, iframeWindow(), fixture.ended);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('keeps the initial resume offset and muted autoplay through progress-driven rerenders', () => {
      const view = render(<VideoPlayer {...fixture} hash="demo-hash" initialPositionSeconds={45.9} autoPlay />);
      const initialSrc = screen.getByTitle('Video lesson').getAttribute('src')!;
      const url = new URL(initialSrc);
      expect(url.origin).toBe(fixture.origin);
      expect(url.searchParams.get('autoplay')).toBe('1');
      if (fixture.provider === 'youtube') {
        expect(url.searchParams.get('start')).toBe('45');
        expect(url.searchParams.get('mute')).toBe('1');
      } else {
        expect(url.hash).toBe('#t=45s');
        expect(url.searchParams.get('muted')).toBe('1');
        expect(url.searchParams.get('h')).toBe('demo-hash');
      }
      view.rerender(<VideoPlayer {...fixture} hash="demo-hash" initialPositionSeconds={90} autoPlay />);
      expect(screen.getByTitle('Video lesson')).toHaveAttribute('src', initialSrc);
    });
  });
}

it('rejects events from the previously active provider after a provider change', () => {
  const onEnded = vi.fn();
  const view = render(<VideoPlayer {...providers[0]} onEnded={onEnded} />);
  view.rerender(<VideoPlayer {...providers[1]} onEnded={onEnded} />);
  message(providers[0].origin, iframeWindow(), providers[0].ended);
  expect(onEnded).not.toHaveBeenCalled();
  message(providers[1].origin, iframeWindow(), providers[1].ended);
  expect(onEnded).toHaveBeenCalledTimes(1);
});

it('does not accept events when no iframe source is configured', () => {
  const onEnded = vi.fn();
  render(<VideoPlayer provider="youtube" onEnded={onEnded} />);
  message(providers[0].origin, null, providers[0].ended);
  expect(onEnded).not.toHaveBeenCalled();
});

it('continues delegating signed playback and resume controls to the R2 player', () => {
  const onProgress = vi.fn();
  const onEnded = vi.fn();
  const props = {
    lessonId: '00000000-0000-4000-8000-000000000001',
    initialPositionSeconds: 40,
    resumePositionSeconds: 45,
    durationSeconds: 120,
    autoPlay: true,
    onProgress,
    onEnded,
  };
  render(<VideoPlayer provider="r2" externalId="videos/demo/video.mp4" {...props} />);
  expect(screen.getByTestId('r2-player')).toBeInTheDocument();
  expect(screen.queryByTitle('Video lesson')).not.toBeInTheDocument();
  expect(r2Player).toHaveBeenLastCalledWith(expect.objectContaining(props));
});

it.each(['en', 'pt', 'es'] as const)('uses %s for product text and YouTube interface without replacing authored titles', (locale) => {
  const copy = catalogs[locale].video;
  const view = render(<VideoPlayer provider="youtube" externalId="demo-video1" title="Authored title" />, locale);
  const url = new URL(screen.getByTitle(copy.title).getAttribute('src')!);
  expect(url.searchParams.get('hl')).toBe(locale);
  expect(screen.getByText('Authored title')).toBeInTheDocument();
  view.rerender(<VideoPlayer provider="youtube" />);
  expect(screen.getByText(copy.noSource)).toBeInTheDocument();
});
