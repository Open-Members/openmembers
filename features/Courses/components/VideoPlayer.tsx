'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { buildVimeoEmbedSrc } from '@/shared/lib/vimeo';
import { R2VideoPlayer } from './R2VideoPlayer';

type Provider = 'youtube' | 'vimeo' | 'r2';

const IFRAME_ORIGINS = {
  youtube: 'https://www.youtube.com',
  vimeo: 'https://player.vimeo.com',
} as const;

function isValidPlaybackTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

interface VideoPlayerProps {
  /**
   * Explicit provider. If omitted, falls back to 'youtube' when a
   * `youtubeVideoId` is supplied (backwards compat).
   */
  provider?: Provider;
  /** Provider-specific external ID (YouTube ID, Vimeo ID, or R2 object key). */
  externalId?: string;
  /** Private-link hash (Vimeo only). */
  hash?: string;
  /** Legacy YouTube-only prop. Still accepted. */
  youtubeVideoId?: string;
  /**
   * Required when `provider === 'r2'` — used to request a signed playback
   * URL from /api/r2/playback-url. Ignored for YouTube / Vimeo.
   */
  lessonId?: string;
  /** Fires when the video reaches the end. */
  onEnded?: () => void;
  /**
   * Fires periodically while the video is playing. `durationSeconds` may be 0
   * until the provider reports metadata. YouTube emits ~every 200–250ms,
   * Vimeo ~every 250ms, R2 follows the browser's native timeupdate cadence.
   */
  onProgress?: (currentSeconds: number, durationSeconds: number) => void;
  /**
   * Start playback at this offset (seconds). Only honored on initial mount
   * for a given lesson — changing it afterwards has no effect until the
   * player remounts (usually on lesson change).
   */
  initialPositionSeconds?: number;
  /**
   * If true, the player autoplays muted on mount. Muted is required by
   * browsers for cross-origin autoplay to be allowed without a user gesture.
   */
  autoPlay?: boolean;
  /** Optional lesson title — rendered as a subtle top-left overlay on hover. */
  title?: string;
  /** Duration in seconds — used by the R2 player's poster to show a badge. */
  durationSeconds?: number;
  /** Optional custom poster image URL for the R2 player. */
  posterUrl?: string;
  /**
   * Saved playback position in seconds. When provided (and the gating rules
   * in LessonPlayerPage.tsx pass), the R2 poster shows Resume / Start over.
   * YouTube and Vimeo still rely on `initialPositionSeconds` only.
   */
  resumePositionSeconds?: number;
  /**
   * Optional watermark logo URL — only honored by the R2 self-hosted
   * player. Sandboxed iframes (YouTube / Vimeo) ignore this; we can't
   * paint reliably over their chrome.
   */
  watermarkUrl?: string | null;
}

/**
 * Renders the right player for the selected provider. YouTube / Vimeo use
 * an iframe with postMessage to catch `ended`. R2 uses a native <video>
 * element with a short-lived signed URL fetched from our API.
 */
export function VideoPlayer({
  provider,
  externalId,
  hash,
  youtubeVideoId,
  lessonId,
  onEnded,
  onProgress,
  initialPositionSeconds = 0,
  autoPlay = false,
  title,
  durationSeconds,
  posterUrl,
  resumePositionSeconds,
  watermarkUrl,
}: VideoPlayerProps) {
  const t = useTranslations('learningMedia.video');
  const locale = useLocale();
  // Freeze the seek target at mount time — subsequent prop changes don't
  // re-seek, preventing the player from jumping around during playback.
  const [startAt] = useState(() => Math.max(0, Math.floor(initialPositionSeconds)));
  const effective: Provider =
    provider ?? (youtubeVideoId ? 'youtube' : 'youtube');
  const effectiveId = externalId ?? youtubeVideoId ?? '';

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const isR2 = effective === 'r2';

  // postMessage handshake + listener for iframe providers.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (effective !== 'youtube' && effective !== 'vimeo') return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const origin = IFRAME_ORIGINS[effective];

    function subscribe() {
      const win = iframe?.contentWindow;
      if (!win) return;
      if (effective === 'youtube') {
        // `listening` tells the YT iframe to start emitting infoDelivery
        // events (currentTime, duration, …) alongside state changes.
        win.postMessage(
          JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
          origin,
        );
        win.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'addEventListener',
            args: ['onStateChange'],
          }),
          origin,
        );
      } else if (effective === 'vimeo') {
        win.postMessage(
          JSON.stringify({ method: 'addEventListener', value: 'ended' }),
          origin,
        );
        win.postMessage(
          JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }),
          origin,
        );
      }
    }

    iframe.addEventListener('load', subscribe);
    subscribe();

    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== origin ||
        !iframe?.contentWindow ||
        event.source !== iframe.contentWindow
      ) {
        return;
      }

      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;

      if (effective === 'youtube') {
        const d = data as {
          event?: string;
          info?: number | { currentTime?: number; duration?: number };
        };
        if (d.event === 'onStateChange' && d.info === 0) {
          onEndedRef.current?.();
        } else if (d.event === 'infoDelivery' && d.info && typeof d.info === 'object') {
          const current = d.info.currentTime;
          const duration = d.info.duration;
          if (isValidPlaybackTime(current)) {
            onProgressRef.current?.(current, isValidPlaybackTime(duration) ? duration : 0);
          }
        }
      } else if (effective === 'vimeo') {
        const d = data as {
          event?: string;
          method?: string;
          data?: { seconds?: number; duration?: number };
        };
        if (d.event === 'ended' || d.method === 'ended') {
          onEndedRef.current?.();
        } else if (d.event === 'timeupdate' && d.data) {
          const seconds = d.data.seconds;
          const duration = d.data.duration;
          if (isValidPlaybackTime(seconds)) {
            onProgressRef.current?.(seconds, isValidPlaybackTime(duration) ? duration : 0);
          }
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => {
      iframe?.removeEventListener('load', subscribe);
      window.removeEventListener('message', handleMessage);
    };
  }, [effective, effectiveId]);

  // Build the iframe src based on provider (YouTube/Vimeo only).
  let src = '';
  if (effective === 'youtube' && effectiveId) {
    // Premium chrome: hide related overlay, annotations, kb-hint — keep FS + JS API.
    // `color=white` is the only non-red accent YouTube exposes.
    const yt = new URLSearchParams({
      enablejsapi: '1',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      iv_load_policy: '3',
      color: 'white',
      fs: '1',
      hl: locale,
    });
    if (autoPlay) {
      yt.set('autoplay', '1');
      yt.set('mute', '1');
    }
    if (startAt > 0) yt.set('start', String(startAt));
    src = `https://www.youtube.com/embed/${effectiveId}?${yt.toString()}`;
  } else if (effective === 'vimeo' && effectiveId) {
    src = buildVimeoEmbedSrc(hash ? { id: effectiveId, hash } : effectiveId, {
      autoplay: autoPlay,
      muted: autoPlay,
      color: 'ffffff',
    });
    if (startAt > 0) src += `#t=${startAt}s`;
  }

  if (!effectiveId) {
    return (
      <div className="relative w-full aspect-video bg-black flex items-center justify-center text-sm text-white/70">
        {t('noSource')}
      </div>
    );
  }

  // R2 self-hosted path — delegates to the fully-custom R2VideoPlayer. All
  // playback state (signed URL, controls, scrubber, poster, fullscreen) is
  // owned by that component; the only shared concerns are the progress/ended
  // callbacks and the resume/autoplay props.
  if (isR2 && lessonId) {
    return (
      <R2VideoPlayer
        lessonId={lessonId}
        title={title}
        durationSeconds={durationSeconds}
        posterUrl={posterUrl}
        resumePositionSeconds={resumePositionSeconds}
        onEnded={onEnded}
        onProgress={onProgress}
        initialPositionSeconds={initialPositionSeconds}
        autoPlay={autoPlay}
        watermarkUrl={watermarkUrl}
      />
    );
  }

  return (
    <PremiumFrame title={title}>
      <iframe
        ref={iframeRef}
        src={src}
        title={t('title')}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 w-full h-full"
      />
    </PremiumFrame>
  );
}

/**
 * Cinematic frame around the player: deep-black matte, subtle primary-tinted
 * ring, rounded corners, elevated shadow, and an optional title overlay that
 * fades in on hover (pointer-events disabled so it never blocks clicks).
 */
function PremiumFrame({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div
      className="group relative w-full aspect-video bg-black overflow-hidden rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] ring-1 ring-white/5"
    >
      {/* Ambient gradient glow behind the content, visible only at the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-[var(--color-primary)]/15 via-transparent to-[var(--color-primary)]/10 opacity-60"
      />
      <div className="absolute inset-0">{children}</div>
      {title && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 inset-x-0 p-4 md:p-5 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        >
          <p className="text-white text-sm md:text-base font-semibold drop-shadow-md line-clamp-2">
            {title}
          </p>
        </div>
      )}
    </div>
  );
}
