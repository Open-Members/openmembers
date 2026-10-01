'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const subscribeToOrigin = () => () => {};
const getDocumentOrigin = () => window.location.origin;
const getServerOrigin = () => '';

/** Decorative media only. Lesson players keep their own audio and captions. */
export function HeroBackgroundVideo({ videoId, title, locale }: {
  videoId: string;
  title: string;
  locale: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Wait for hydration so the embed receives the actual installation origin,
  // including localhost/custom domains, without server/client markup mismatch.
  const documentOrigin = useSyncExternalStore(subscribeToOrigin, getDocumentOrigin, getServerOrigin);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

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
      for (const event of ['onReady', 'onApiChange', 'onStateChange']) {
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
      if (message.event === 'onReady' || message.event === 'onApiChange' ||
        (message.event === 'onStateChange' && typeof message.info === 'number' && [-1, 0, 1, 2, 3, 5].includes(message.info))) {
        keepDecorative();
      }
    }

    window.addEventListener('message', handleMessage);
    iframe.addEventListener('load', subscribe);
    subscribe();
    return () => {
      window.removeEventListener('message', handleMessage);
      iframe.removeEventListener('load', subscribe);
    };
  }, [documentOrigin, videoId, locale]);

  const params = new URLSearchParams({
    autoplay: '1', mute: '1', controls: '0', loop: '1', playlist: videoId,
    modestbranding: '1', showinfo: '0', rel: '0', iv_load_policy: '3',
    playsinline: '1', hl: locale, disablekb: '1', enablejsapi: '1',
    origin: documentOrigin, cc_load_policy: '0',
  });

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none" style={{ containerType: 'size' }}>
      {documentOrigin && <iframe
        ref={iframeRef}
        key={videoId}
        // Match the video's native 16:9 ratio while covering both banner axes.
        // Container units follow the real height, including the desktop cap.
        style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 'max(100cqw, 177.777778cqh)',
          height: 'max(100cqh, 56.25cqw)',
          transform: 'translate(-50%, -50%)', border: 0,
        }}
        src={`${YOUTUBE_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params}`}
        title={title}
        allow="autoplay; encrypted-media"
        loading="eager"
        tabIndex={-1}
      />}
    </div>
  );
}
