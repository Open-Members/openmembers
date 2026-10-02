'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const subscribeToOrigin = () => () => {};
const getDocumentOrigin = () => window.location.origin;
const getServerOrigin = () => '';
// The mobile embed can display its startup controls even while PLAYING.
// Keep the backing image visible through the measured provider startup phase.
const STARTUP_HIDE_MS = 10_000;

/** Decorative media only. Lesson players keep their own audio and captions. */
export function HeroBackgroundVideo({ videoId, title, locale }: {
  videoId: string;
  title: string;
  locale: string;
}) {
  // Wait for hydration so the embed receives the actual installation origin,
  // including localhost/custom domains, without server/client markup mismatch.
  const documentOrigin = useSyncExternalStore(subscribeToOrigin, getDocumentOrigin, getServerOrigin);
  const mediaKey = `${documentOrigin}|${locale}|${videoId}`;

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none" style={{ containerType: 'size' }}>
      {documentOrigin && <BackgroundVideoFrame key={mediaKey} videoId={videoId} title={title} locale={locale} documentOrigin={documentOrigin} />}
    </div>
  );
}

// A newly mounted player always owns fresh readiness and reveal state, even
// when navigation returns to a previously presented language/video pair.
function BackgroundVideoFrame({ videoId, title, locale, documentOrigin }: {
  videoId: string;
  title: string;
  locale: string;
  documentOrigin: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let ready = false;
    let playing = false;
    let visible = false;
    let looping = false;
    let startupStartedAt: number | undefined;
    let disposed = false;
    let revealTimer: number | undefined;

    function conceal(restartStartup = true) {
      playing = false;
      visible = false;
      window.clearTimeout(revealTimer);
      revealTimer = undefined;
      if (restartStartup) startupStartedAt = undefined;
      setRevealed(false);
    }

    function revealAfterStartup() {
      if (!ready || !playing || visible || revealTimer !== undefined) return;
      startupStartedAt ??= Date.now();
      revealTimer = window.setTimeout(() => {
        revealTimer = undefined;
        if (!disposed && ready && playing) {
          visible = true;
          setRevealed(true);
        }
      }, Math.max(0, STARTUP_HIDE_MS - (Date.now() - startupStartedAt)));
    }

    function command(func: string, args: (string | number)[] = []) {
      iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YOUTUBE_ORIGIN);
    }

    function keepDecorative() {
      command('mute');
      command('setVolume', [0]);
      // cc_load_policy alone can retain the viewer's caption preference. The
      // provider exposes this module command after readiness/API changes.
      command('unloadModule', ['captions']);
    }

    function subscribe() {
      iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
      for (const event of ['onReady', 'onApiChange', 'onStateChange', 'onError', 'onAutoplayBlocked']) {
        command('addEventListener', [event]);
      }
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== YOUTUBE_ORIGIN || !iframe?.contentWindow || event.source !== iframe.contentWindow) return;
      let data: unknown = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      const message = data as { event?: string; info?: unknown };
      if (message.event === 'onReady') {
        ready = true;
        keepDecorative();
        revealAfterStartup();
      } else if (message.event === 'onApiChange') {
        keepDecorative();
      } else if (['onStateChange', 'initialDelivery', 'infoDelivery'].includes(message.event ?? '')) {
        // Initial delivery can already report PLAYING before a state-change
        // listener is registered. Reconcile the trusted provider snapshot too.
        const state = message.event === 'onStateChange' ? message.info
          : message.info && typeof message.info === 'object' && !Array.isArray(message.info)
            ? (message.info as { playerState?: unknown }).playerState : undefined;
        if (typeof state !== 'number' || ![-1, 0, 1, 2, 3, 5].includes(state)) return;
        keepDecorative();
        if (state === 1) {
          playing = true;
          looping = false;
          revealAfterStartup();
        } else {
          // Playlist loops can transition directly from PLAYING to UNSTARTED,
          // without ENDED. Keep their warmup so short clips can become visible.
          looping = state === 0 || (state === -1 && playing) || (looping && state !== 2);
          conceal(!looping);
        }
      } else if (message.event === 'onError' || message.event === 'onAutoplayBlocked') {
        looping = false;
        conceal();
      }
    }

    function handleLoad() {
      // Player readiness can precede the iframe's load event. Resubscribe
      // without discarding an already received ready/playing signal.
      subscribe();
    }

    window.addEventListener('message', handleMessage);
    iframe.addEventListener('load', handleLoad);
    subscribe();
    return () => {
      disposed = true;
      window.clearTimeout(revealTimer);
      window.removeEventListener('message', handleMessage);
      iframe.removeEventListener('load', handleLoad);
    };
  }, []);

  const params = new URLSearchParams({
    autoplay: '1', mute: '1', controls: '0', loop: '1', playlist: videoId,
    modestbranding: '1', showinfo: '0', rel: '0', iv_load_policy: '3',
    playsinline: '1', hl: locale, disablekb: '1', enablejsapi: '1',
    origin: documentOrigin, cc_load_policy: '0',
  });

  return (
    <iframe
      ref={iframeRef}
      className={`transition-opacity ${revealed ? 'duration-500' : 'duration-0'} motion-reduce:transition-none`}
      // Match the video's native 16:9 ratio while covering both banner axes.
      // Container units follow the real height, including the desktop cap.
      style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 'max(100cqw, 177.777778cqh)',
        height: 'max(100cqh, 56.25cqw)',
        transform: 'translate(-50%, -50%)', border: 0,
        opacity: revealed ? 1 : 0,
      }}
      src={`${YOUTUBE_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params}`}
      title={title}
      allow="autoplay; encrypted-media"
      loading="eager"
      tabIndex={-1}
    />
  );
}
