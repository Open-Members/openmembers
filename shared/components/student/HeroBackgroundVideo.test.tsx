import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function banner(id: string | null = videoId, locale = 'en', imageUrl?: string) {
  return (
    <NextIntlClientProvider locale={locale} messages={{ learningOverview: en }}>
      <HeroBanner trailerYoutubeId={id} imageUrl={imageUrl} title="Welcome" primaryCta={{ label: 'Explore', href: '/courses' }} />
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
  it('keeps the initial player interface hidden even after playback starts', () => {
    vi.useFakeTimers();
    const { iframe } = setup();
    expect(iframe).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onReady' });
    act(() => vi.advanceTimersByTime(20_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(9_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    // The mobile provider can show controls while already PLAYING. Reveal
    // only after the verified startup window, rather than on that event.
    act(() => vi.advanceTimersByTime(1_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
  });

  it('waits for readiness if PLAYING arrives first, without postponing on duplicate events', () => {
    vi.useFakeTimers();
    const { iframe } = setup();
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(20_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onReady' });
    act(() => vi.advanceTimersByTime(6_000));
    deliver(iframe, { event: 'onStateChange', info: 1 });
    deliver(iframe, { event: 'onApiChange' });
    act(() => vi.advanceTimersByTime(4_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
  });

  it('preserves readiness when the iframe load event follows the provider ready event', () => {
    vi.useFakeTimers();
    const { iframe } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.load(iframe);
    act(() => vi.advanceTimersByTime(7_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
  });

  it.each(['initialDelivery', 'infoDelivery'])('uses the trusted %s state when the initial state-change event was missed', event => {
    vi.useFakeTimers();
    const { iframe } = setup();
    deliver(iframe, { event, info: { playerState: 1 } });
    act(() => vi.advanceTimersByTime(20_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onReady' });
    act(() => vi.advanceTimersByTime(9_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    act(() => vi.advanceTimersByTime(1_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
    deliver(iframe, { event: 'infoDelivery', info: { playerState: 3 } });
    expect(iframe).toHaveStyle({ opacity: '0' });
  });

  it.each([2, 3, 5])('cancels a pending reveal on state %i and requires uninterrupted playback', info => {
    vi.useFakeTimers();
    const { iframe } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(8_000));
    deliver(iframe, { event: 'onStateChange', info });
    act(() => vi.advanceTimersByTime(20_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(9_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    act(() => vi.advanceTimersByTime(1_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
  });

  it.each([0, -1])('lets short videos finish startup across automatic loops through state %i', endState => {
    vi.useFakeTimers();
    const { iframe } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    for (let loop = 0; loop < 2; loop++) {
      act(() => vi.advanceTimersByTime(4_000));
      deliver(iframe, { event: 'onStateChange', info: endState });
      expect(iframe).toHaveStyle({ opacity: '0' });
      deliver(iframe, { event: 'onStateChange', info: 5 });
      deliver(iframe, { event: 'onStateChange', info: 3 });
      deliver(iframe, { event: 'onStateChange', info: 1 });
    }
    act(() => vi.advanceTimersByTime(1_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    act(() => vi.advanceTimersByTime(1_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
  });

  it('hides the end of a warmed-up loop without restarting the whole startup window', () => {
    vi.useFakeTimers();
    const { iframe } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(10_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
    deliver(iframe, { event: 'onStateChange', info: 0 });
    expect(iframe).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onStateChange', info: 3 });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(0));
    expect(iframe).toHaveStyle({ opacity: '1' });
  });

  it('rejects readiness from the old iframe when the locale changes', () => {
    vi.useFakeTimers();
    const { iframe, rerender } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(10_000));
    rerender(banner(videoId, 'pt'));
    const replacement = document.querySelector('iframe')!;
    expect(replacement).not.toBe(iframe);
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(20_000));
    expect(replacement).toHaveStyle({ opacity: '0' });
  });

  it('requires a fresh startup when returning to a previously revealed locale', () => {
    vi.useFakeTimers();
    const { iframe, rerender } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(10_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
    rerender(banner(videoId, 'pt'));
    const intermediate = document.querySelector('iframe')!;
    expect(intermediate).toHaveStyle({ opacity: '0' });
    rerender(banner(videoId, 'en'));
    const replacement = document.querySelector('iframe')!;
    expect(replacement).not.toBe(iframe);
    expect(replacement).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onReady' });
    deliver(intermediate, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(20_000));
    expect(replacement).toHaveStyle({ opacity: '0' });
    deliver(replacement, { event: 'onReady' });
    deliver(replacement, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(9_000));
    expect(replacement).toHaveStyle({ opacity: '0' });
    act(() => vi.advanceTimersByTime(1_000));
    expect(replacement).toHaveStyle({ opacity: '1' });
  });

  it.each(['onError', 'onAutoplayBlocked'])('hides an already revealed player immediately on %s', event => {
    vi.useFakeTimers();
    const { iframe } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(10_000));
    expect(iframe).toHaveStyle({ opacity: '1' });
    deliver(iframe, { event, info: 150 });
    expect(iframe).toHaveStyle({ opacity: '0' });
    act(() => vi.advanceTimersByTime(20_000));
    expect(iframe).toHaveStyle({ opacity: '0' });
    expect(screen.getAllByRole('link', { name: 'Explore' })).toHaveLength(2);
  });

  it('does not let a stale reveal timer expose a replacement video', () => {
    vi.useFakeTimers();
    const { iframe, rerender } = setup();
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(9_000));
    rerender(banner('demo-video2'));
    const replacement = document.querySelector('iframe')!;
    act(() => vi.advanceTimersByTime(20_000));
    expect(replacement).toHaveStyle({ opacity: '0' });
    deliver(iframe, { event: 'onReady' });
    deliver(iframe, { event: 'onStateChange', info: 1 });
    act(() => vi.advanceTimersByTime(20_000));
    expect(replacement).toHaveStyle({ opacity: '0' });
  });

  it('preserves the configured banner image underneath the initializing player', () => {
    render(banner(videoId, 'en', 'https://example.test/banner.webp'));
    expect(document.querySelector('iframe')).toHaveStyle({ opacity: '0' });
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.test/banner.webp');
    expect(document.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });

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
    deliver(iframe, { event: 'infoDelivery', info: { playerState: 1 } }, origin, window);
    deliver(iframe, { event: 'initialDelivery', info: { playerState: 1 } }, 'https://example.com');
    deliver(iframe, { event: 'infoDelivery', info: { playerState: 'playing' } });
    deliver(iframe, { event: 'initialDelivery', info: [{ playerState: 1 }] });
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
