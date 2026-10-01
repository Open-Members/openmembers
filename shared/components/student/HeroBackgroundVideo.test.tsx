import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes } from 'react';
import { HeroBanner } from './HeroBanner';
import en from '@/core/i18n/locales/en/learningOverview.json';

vi.mock('@/core/i18n/routing', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const origin = 'https://www.youtube-nocookie.com';
const videoId = 'M7lc1UVf-VE';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function banner(id: string | null = videoId, locale = 'en') {
  return (
    <NextIntlClientProvider locale={locale} messages={{ learningOverview: en }}>
      <HeroBanner trailerYoutubeId={id} title="Welcome" primaryCta={{ label: 'Explore', href: '/courses' }} />
    </NextIntlClientProvider>
  );
}

function setup() {
  const view = render(banner());
  const iframe = document.querySelector('iframe')!;
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation(() => {});
  fireEvent.load(iframe);
  post.mockClear();
  return { ...view, iframe, post };
}

function deliver(iframe: HTMLIFrameElement, data: unknown, messageOrigin = origin, source: MessageEventSource | null = iframe.contentWindow) {
  fireEvent(window, new MessageEvent('message', { origin: messageOrigin, source, data }));
}

function commands(post: { mock: { calls: unknown[][] } }) {
  return post.mock.calls.map(([data, target]) => {
    const message = JSON.parse(data as string) as { event: string; func: string; args: unknown[] };
    return { ...message, target };
  })
    .filter(command => command.event === 'command' && command.func !== 'addEventListener');
}

describe('decorative YouTube banner', () => {
  it.each(['en', 'pt', 'es'])('starts silently inline and enables control only from the current %s document', locale => {
    render(banner(videoId, locale));
    const iframe = document.querySelector('iframe')!;
    const params = new URL(iframe.src).searchParams;
    expect(params.get('autoplay')).toBe('1');
    expect(params.get('mute')).toBe('1');
    expect(params.get('loop')).toBe('1');
    expect(params.get('playlist')).toBe(videoId);
    expect(params.get('playsinline')).toBe('1');
    expect(params.get('controls')).toBe('0');
    expect(params.get('disablekb')).toBe('1');
    expect(params.get('enablejsapi')).toBe('1');
    expect(params.get('origin')).toBe(window.location.origin);
    expect(params.get('hl')).toBe(locale);
    expect(iframe).toHaveAttribute('tabindex', '-1');
  });

  it.each(['onReady', 'onApiChange'])('silences the ready player and unloads native captions on %s', event => {
    const { iframe, post } = setup();
    deliver(iframe, JSON.stringify({ event }));
    expect(commands(post)).toEqual(expect.arrayContaining([
      expect.objectContaining({ func: 'mute', args: [], target: origin }),
      expect.objectContaining({ func: 'setVolume', args: [0], target: origin }),
      expect.objectContaining({ func: 'unloadModule', args: ['captions'], target: origin }),
    ]));
    expect(commands(post).some(command => command.func === 'unMute')).toBe(false);
  });

  it.each([0, 1, 2, 3])('keeps sound and captions off when the player changes state to %i', info => {
    const { iframe, post } = setup();
    deliver(iframe, { event: 'onStateChange', info });
    expect(commands(post)).toEqual(expect.arrayContaining([
      expect.objectContaining({ func: 'mute', args: [] }),
      expect.objectContaining({ func: 'unloadModule', args: ['captions'] }),
    ]));
  });

  it('ignores another window, a lookalike origin and invalid messages', () => {
    const { iframe, post } = setup();
    deliver(iframe, { event: 'onReady' }, 'https://www.youtube-nocookie.com.evil.example');
    deliver(iframe, { event: 'onReady' }, origin, window);
    deliver(iframe, '{broken-json');
    deliver(iframe, [{ event: 'onReady' }]);
    deliver(iframe, null);
    deliver(iframe, { event: 'onStateChange', info: 'playing' });
    expect(post).not.toHaveBeenCalled();
  });

  it('removes subscriptions when the video is removed', () => {
    const { iframe, post, rerender } = setup();
    rerender(banner(null));
    deliver(iframe, { event: 'onReady' });
    fireEvent.load(iframe);
    expect(post).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Explore' })).toHaveLength(2);
  });

  it('rejects events from the previous video after replacing it', () => {
    const { iframe, post, rerender } = setup();
    rerender(banner('demo-video2'));
    const replacement = document.querySelector('iframe')!;
    const replacementPost = vi.spyOn(replacement.contentWindow!, 'postMessage').mockImplementation(() => {});
    replacementPost.mockClear();
    deliver(iframe, { event: 'onReady' });
    expect(post).not.toHaveBeenCalled();
    expect(replacementPost).not.toHaveBeenCalled();
    deliver(replacement, { event: 'onReady' });
    expect(commands(replacementPost)).toEqual(expect.arrayContaining([
      expect.objectContaining({ func: 'unloadModule', args: ['captions'] }),
    ]));
  });

  it.each(['onError', 'onAutoplayBlocked'])('keeps navigation available without unmuting or retrying on %s', event => {
    const { iframe, post } = setup();
    deliver(iframe, { event, info: 150 });
    expect(commands(post)).toEqual([]);
    expect(screen.getAllByRole('link', { name: 'Explore' }).every(link => link.getAttribute('href') === '/courses')).toBe(true);
  });
});
