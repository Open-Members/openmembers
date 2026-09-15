'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { usePlayerHydrated, usePlayerPreference } from './player-preferences';
import type { VideoErrorCode } from '../media-i18n';
import {
  Play,
  Pause,
  Maximize,
  Minimize,
  Loader2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Volume1,
  Gauge,
  PictureInPicture2,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface R2VideoPlayerProps {
  lessonId: string;
  /** Lesson title — shown on the poster and in the hover title overlay. */
  title?: string;
  /** Duration in seconds — shown as a badge on the poster. */
  durationSeconds?: number;
  /** Optional custom poster image URL. If omitted, we render the branded default. */
  posterUrl?: string;
  onEnded?: () => void;
  onProgress?: (currentSeconds: number, durationSeconds: number) => void;
  initialPositionSeconds?: number;
  autoPlay?: boolean;
  /**
   * Saved playback position used to surface a "Resume from X:XX" button on
   * the poster and a center overlay when the user pauses mid-playback. Only
   * the display-time — the actual seeking is driven via `initialPositionSeconds`
   * (for the Resume button) or zero (for Start over).
   */
  resumePositionSeconds?: number;
  /**
   * Optional logo painted in the bottom-right of the player as a soft
   * brand watermark. Persists in fullscreen since the host container is
   * what gets fullscreened.
   */
  watermarkUrl?: string | null;
}

const HIDE_CONTROLS_DELAY_MS = 2500;
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SEEK_STEP_SHORT_S = 5;
const SEEK_STEP_LONG_S = 10;
const VOLUME_STORAGE_KEY = 'openmembers:player:volume';
const MUTED_STORAGE_KEY = 'openmembers:player:muted';
const RATE_STORAGE_KEY = 'openmembers:player:rate';

/**
 * Self-hosted (R2) player with fully custom chrome. Native browser controls
 * are hidden; we drive a <video> element directly and render our own bar.
 *
 * Subtask 1 of 3: base structure — play/pause, scrubber, time, fullscreen,
 * auto-hide, and a branded poster with the default cover.
 */
export function R2VideoPlayer(props: R2VideoPlayerProps) {
  return <R2VideoPlayerSession key={props.lessonId} {...props} />;
}

function R2VideoPlayerSession({
  lessonId,
  title,
  durationSeconds,
  posterUrl,
  onEnded,
  onProgress,
  initialPositionSeconds = 0,
  autoPlay = false,
  resumePositionSeconds = 0,
  watermarkUrl = null,
}: R2VideoPlayerProps) {
  const t = useTranslations('learningMedia.video');
  // When the user has a saved position, we take control of autoplay: the
  // poster shows both "Resume" and "Start over" so they can choose. If
  // there's no saved progress we honor the autoPlay prop as before.
  const hasResume = resumePositionSeconds >= 30;
  const effectiveAutoPlay = autoPlay && !hasResume;
  // ── Signed URL ─────────────────────────────────────────────────────────
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<VideoErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch(`/api/r2/playback-url?lessonId=${encodeURIComponent(lessonId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setError(res.status === 401 ? 'unauthenticated'
            : res.status === 403 ? 'forbidden'
              : res.status === 404 || res.status === 503 ? 'unavailable' : 'failed');
          return;
        }
        const data = (await res.json()) as { url?: unknown };
        if (typeof data.url !== 'string' || !data.url) throw new Error('Invalid playback response');
        if (!cancelled) setVideoUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setError('failed');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lessonId]);

  // ── Refs / state ───────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const initialPosRef = useRef(Math.max(0, Math.floor(initialPositionSeconds)));
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    durationSeconds && durationSeconds > 0 ? durationSeconds : 0,
  );
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [volumePreference, setVolumePreference] = usePlayerPreference(VOLUME_STORAGE_KEY, '1');
  const [mutedPreference, setMutedPreference] = usePlayerPreference(MUTED_STORAGE_KEY, 'false');
  const [ratePreference, setRatePreference] = usePlayerPreference(RATE_STORAGE_KEY, '1');
  const parsedVolume = Number.parseFloat(volumePreference);
  const volume = Number.isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1 ? parsedVolume : 1;
  const isMuted = mutedPreference === 'true';
  const parsedRate = Number.parseFloat(ratePreference);
  const playbackRate = PLAYBACK_RATES.includes(parsedRate as (typeof PLAYBACK_RATES)[number]) ? parsedRate : 1;
  const [isPiP, setIsPiP] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [isPointerInside, setIsPointerInside] = useState(false);
  // `mounted` gates browser-only capability checks (like PiP) so the server
  // and first client render agree — avoids a hydration mismatch warning.
  const mounted = usePlayerHydrated();
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [tapFeedback, setTapFeedback] = useState<'left' | 'right' | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null);

  // ── Auto-hide controls while playing ───────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, HIDE_CONTROLS_DELAY_MS);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (isPlaying) scheduleHide();
  }, [isPlaying, scheduleHide]);

  useEffect(() => {
    if (!isPlaying) {
      if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    } else {
      scheduleHide();
    }
    return () => {
      if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    };
  }, [isPlaying, scheduleHide]);

  // ── Fullscreen tracking ────────────────────────────────────────────────
  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ── Sync state → video element (volume, muted, playbackRate). ──────────
  // autoPlay forces muted at start; only apply our saved muted state after
  // the user interacts (otherwise the browser may block autoplay entirely).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
  }, [volume, videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // While autoplay is active we keep muted on so playback isn't blocked.
    // After `hasStarted` we honor the user's unmute choice.
    v.muted = effectiveAutoPlay && !hasStarted ? true : isMuted;
  }, [isMuted, effectiveAutoPlay, hasStarted, videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackRate;
  }, [playbackRate, videoUrl]);

  // ── Picture-in-Picture tracking ────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [videoUrl]);

  // ── Actions ────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      v.play().catch(() => {
        /* user-gesture-required etc. — surfaced by native UI if needed */
      });
    } else {
      v.pause();
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.1, seconds));
  }, []);

  // Poster "Resume" — video is already seeked to the saved position via the
  // initialPositionSeconds onLoadedMetadata handler, so we just start playback.
  const handleResume = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
  }, []);

  // Poster "Start over" — force seek to 0 (ignoring the saved position) and play.
  const handleStartOver = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = 0;
    } catch {
      /* seek may throw before metadata loads */
    }
    v.play().catch(() => {});
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const changeVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolumePreference(String(clamped));
    if (clamped > 0 && isMuted) setMutedPreference('false');
  }, [isMuted, setVolumePreference, setMutedPreference]);

  const toggleMute = useCallback(() => {
    setMutedPreference(String(!isMuted));
  }, [isMuted, setMutedPreference]);

  const changeRate = useCallback((rate: number) => {
    setRatePreference(String(rate));
    setSpeedMenuOpen(false);
  }, [setRatePreference]);

  const togglePiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      }
    } catch {
      /* PiP may be blocked — ignore */
    }
  }, []);

  const nudgeSeek = useCallback(
    (deltaSeconds: number) => {
      const v = videoRef.current;
      if (!v) return;
      seekTo(v.currentTime + deltaSeconds);
    },
    [seekTo],
  );

  // Video tap — mouse: togglePlay. Touch: single-tap toggles controls, double-
  // tap on the left/right half seeks ±10s with a brief visual flash. We ignore
  // the synthetic click that would otherwise fire after the pointer gesture.
  const handleVideoPointerUp = useCallback(
    (e: React.PointerEvent<HTMLVideoElement>) => {
      if (e.pointerType !== 'touch') {
        togglePlay();
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const side: 'left' | 'right' =
        e.clientX - rect.left > rect.width / 2 ? 'right' : 'left';
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && now - last.time < 300 && last.side === side) {
        lastTapRef.current = null;
        nudgeSeek(side === 'left' ? -SEEK_STEP_LONG_S : SEEK_STEP_LONG_S);
        setTapFeedback(side);
        window.setTimeout(() => setTapFeedback(null), 600);
      } else {
        lastTapRef.current = { time: now, side };
        // Single-tap toggles the controls overlay on touch — matches the
        // YouTube/Netflix mobile pattern where play/pause is via the button.
        setShowControls((s) => !s);
      }
    },
    [togglePlay, nudgeSeek],
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  // Active when the pointer is inside the player OR we're in fullscreen.
  // Ignores the key if the user is typing in an input/textarea.
  useEffect(() => {
    const active = isPointerInside || isFullscreen;
    if (!active) return;

    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(document.activeElement)) return;
      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nudgeSeek(-SEEK_STEP_SHORT_S);
          break;
        case 'ArrowRight':
          e.preventDefault();
          nudgeSeek(SEEK_STEP_SHORT_S);
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          nudgeSeek(-SEEK_STEP_LONG_S);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          nudgeSeek(SEEK_STEP_LONG_S);
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(volume - 0.1);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
          e.preventDefault();
          const pct = Number.parseInt(e.key, 10) / 10;
          if (Number.isFinite(v.duration)) seekTo(v.duration * pct);
          break;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isPointerInside,
    isFullscreen,
    togglePlay,
    nudgeSeek,
    changeVolume,
    volume,
    toggleMute,
    toggleFullscreen,
    seekTo,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div role="alert" className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-2 text-sm text-white/80 p-4 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <span>{t(`errors.${error}`)}</span>
      </div>
    );
  }

  const progressPct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const controlsVisible = !isPlaying || showControls;

  return (
    <div
      ref={containerRef}
      className="group relative w-full aspect-video bg-black overflow-hidden rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] ring-1 ring-white/5 select-none"
      onMouseMove={revealControls}
      onMouseEnter={() => setIsPointerInside(true)}
      onMouseLeave={() => {
        setIsPointerInside(false);
        if (isPlaying) setShowControls(false);
      }}
    >
      {/* Ambient primary-tinted glow at the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-[var(--color-primary)]/15 via-transparent to-[var(--color-primary)]/10 opacity-60"
      />

      {/* Video element. controls={false} — we own the chrome. */}
      {videoUrl ? (
        <video
          ref={videoRef}
          key={videoUrl}
          src={videoUrl}
          playsInline
          autoPlay={effectiveAutoPlay}
          muted={effectiveAutoPlay}
          onPlay={() => {
            setShowControls(true);
            setIsPlaying(true);
            setHasStarted(true);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            onEndedRef.current?.();
          }}
          onError={() => setError('failed')}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onCanPlay={() => setIsBuffering(false)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (Number.isFinite(v.duration)) setDuration(v.duration);
            const target = initialPosRef.current;
            if (target > 0 && Number.isFinite(v.duration) && target < v.duration - 1) {
              try {
                v.currentTime = target;
              } catch {
                /* media not ready */
              }
            }
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setCurrentTime(v.currentTime);
            onProgressRef.current?.(
              v.currentTime,
              Number.isFinite(v.duration) ? v.duration : 0,
            );
          }}
          onProgress={(e) => {
            const v = e.currentTarget;
            if (v.buffered.length > 0) {
              setBufferedEnd(v.buffered.end(v.buffered.length - 1));
            }
          }}
          onPointerUp={handleVideoPointerUp}
          className="absolute inset-0 w-full h-full bg-black cursor-pointer"
        />
      ) : (
        <div role="status" aria-label={t('loading')} className="absolute inset-0 flex items-center justify-center text-white/70">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {/* Brand watermark — bottom-right, soft, non-interactive. Only visible
          once playback has started so it doesn't fight the poster artwork. */}
      {watermarkUrl && hasStarted && (
        <Image
          src={watermarkUrl}
          alt=""
          width={160}
          height={28}
          unoptimized
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute bottom-3 right-3 md:bottom-4 md:right-4 h-6 md:h-7 w-auto opacity-60 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] z-10 select-none"
        />
      )}

      {/* Touch double-tap seek feedback — brief flash on the side that got hit. */}
      {tapFeedback && (
        <div
          aria-hidden
          className={`pointer-events-none absolute top-0 bottom-0 ${
            tapFeedback === 'left' ? 'left-0' : 'right-0'
          } w-1/2 flex items-center justify-center`}
        >
          <div className="flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md px-4 py-3 text-white">
            {tapFeedback === 'left' ? (
              <ChevronsLeft className="w-5 h-5" />
            ) : (
              <ChevronsRight className="w-5 h-5" />
            )}
            <span className="text-sm font-semibold tabular-nums">
              {t('seekSeconds', { seconds: SEEK_STEP_LONG_S })}
            </span>
          </div>
        </div>
      )}

      {/* Buffering spinner overlaid during playback. */}
      {isBuffering && hasStarted && (
        <div role="status" aria-label={t('buffering')} className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-black/50 p-3 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        </div>
      )}

      {/* Poster overlay — shown until first play. */}
      {!hasStarted && videoUrl && (
        <PosterOverlay
          title={title}
          durationSeconds={durationSeconds ?? duration}
          posterUrl={posterUrl}
          resumePositionSeconds={hasResume ? resumePositionSeconds : 0}
          onPlay={togglePlay}
          onResume={handleResume}
          onStartOver={handleStartOver}
        />
      )}

      {/* Paused mid-playback overlay — big center button to resume (B). */}
      {hasStarted && !isPlaying && !isBuffering && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={t('resume')}
          className="absolute inset-0 flex items-center justify-center group/resume focus:outline-none"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity duration-200"
          />
          <div className="relative flex flex-col items-center gap-2">
            <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30 shadow-2xl transition-all duration-200 group-hover/resume:bg-[var(--color-primary)] group-hover/resume:scale-110 group-hover/resume:ring-[var(--color-primary)]">
              <Play className="w-7 h-7 md:w-9 md:h-9 text-white fill-current translate-x-0.5" />
            </div>
            <span className="text-white text-xs md:text-sm font-semibold tracking-wide drop-shadow-md">
              {t('resume')}
            </span>
          </div>
        </button>
      )}

      {/* Hover title at top (desktop only). */}
      {title && hasStarted && (
        <div
          aria-hidden
          className={`pointer-events-none absolute top-0 inset-x-0 p-4 md:p-5 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="text-white text-sm md:text-base font-semibold drop-shadow-md line-clamp-2">
            {title}
          </p>
        </div>
      )}

      {/* Bottom control bar. */}
      {hasStarted && (
        <div
          className={`absolute bottom-0 inset-x-0 px-3 md:px-5 pb-3 md:pb-4 pt-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrubber */}
          <Scrubber
            currentTime={currentTime}
            duration={duration}
            progressPct={progressPct}
            bufferedEnd={bufferedEnd}
            onSeek={seekTo}
          />

          {/* Controls row */}
          <div className="flex items-center gap-2 md:gap-3 mt-2 text-white">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1.5 hover:text-[var(--color-primary)] transition-colors"
              aria-label={isPlaying ? t('pause') : t('play')}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              ) : (
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              )}
            </button>

            <VolumeControl
              volume={volume}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              onVolumeChange={changeVolume}
            />

            <div className="text-xs md:text-sm font-mono tabular-nums text-white/90">
              <span>{formatTime(currentTime)}</span>
              <span className="text-white/50 mx-1">/</span>
              <span className="text-white/70">{formatTime(duration)}</span>
            </div>

            <div className="flex-1" />

            <SpeedControl
              playbackRate={playbackRate}
              open={speedMenuOpen}
              onToggle={() => setSpeedMenuOpen((v) => !v)}
              onClose={() => setSpeedMenuOpen(false)}
              onSelect={changeRate}
            />

            {mounted && document.pictureInPictureEnabled && (
              <button
                type="button"
                onClick={togglePiP}
                className={`p-1.5 transition-colors ${
                  isPiP
                    ? 'text-[var(--color-primary)]'
                    : 'hover:text-[var(--color-primary)]'
                }`}
                aria-label={isPiP ? t('exitPip') : t('enterPip')}
              >
                <PictureInPicture2 className="w-5 h-5" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 hover:text-[var(--color-primary)] transition-colors"
              aria-label={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5" />
              ) : (
                <Maximize className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scrubber ───────────────────────────────────────────────────────────────

function Scrubber({
  currentTime,
  duration,
  progressPct,
  bufferedEnd,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  progressPct: number;
  bufferedEnd: number;
  onSeek: (seconds: number) => void;
}) {
  const t = useTranslations('learningMedia.video');
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const pctFromPointer = useCallback((clientX: number): number | null => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      if (duration <= 0) return;
      const ratio = pctFromPointer(clientX);
      if (ratio === null) return;
      onSeek(ratio * duration);
    },
    [duration, onSeek, pctFromPointer],
  );

  const bufferedPct =
    duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const hoverTime = hoverPct !== null && duration > 0 ? hoverPct * duration : null;

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromPointer(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekFromPointer(e.clientX);
        // Hover preview — only for mouse/pen, not during touch dragging.
        if (e.pointerType !== 'touch') {
          const ratio = pctFromPointer(e.clientX);
          if (ratio !== null) setHoverPct(ratio);
        }
      }}
      onPointerLeave={() => setHoverPct(null)}
      role="slider"
      tabIndex={0}
      aria-label={t('seek')}
      aria-valuetext={t('seekValue', { current: formatTime(currentTime), total: formatTime(duration) })}
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      className="group/track relative h-1.5 rounded-full bg-white/20 cursor-pointer touch-none"
    >
      {/* Buffered range (lighter than the filled range, behind it). */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-white/35"
        style={{ width: `${bufferedPct}%` }}
      />
      {/* Filled range */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-primary)]"
        style={{ width: `${progressPct}%` }}
      />
      {/* Thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover/track:opacity-100 transition-opacity"
        style={{ left: `${progressPct}%` }}
      />
      {/* Hover preview tooltip — desktop only, anchored to cursor position. */}
      {hoverTime !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/85 border border-white/10 text-[11px] font-mono tabular-nums text-white shadow-lg"
          style={{ left: `${(hoverPct ?? 0) * 100}%` }}
        >
          {formatTime(hoverTime)}
        </div>
      )}
    </div>
  );
}

// ─── Volume control ────────────────────────────────────────────────────────

function VolumeControl({
  volume,
  isMuted,
  onToggleMute,
  onVolumeChange,
}: {
  volume: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
}) {
  const t = useTranslations('learningMedia.video');
  const trackRef = useRef<HTMLDivElement>(null);
  const effectiveVolume = isMuted ? 0 : volume;
  const Icon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onVolumeChange(ratio);
    },
    [onVolumeChange],
  );

  return (
    <div className="group/vol flex items-center">
      <button
        type="button"
        onClick={onToggleMute}
        className="p-1.5 hover:text-[var(--color-primary)] transition-colors"
        aria-label={isMuted ? t('unmute') : t('mute')}
      >
        <Icon className="w-5 h-5" />
      </button>
      {/* Slider expands on hover (desktop); hidden on small screens. */}
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromPointer(e.clientX);
        }}
        role="slider"
        aria-label={t('volume')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(effectiveVolume * 100)}
        className="hidden md:block relative h-1 w-0 group-hover/vol:w-20 rounded-full bg-white/20 cursor-pointer touch-none transition-all duration-200 overflow-hidden"
      >
        <div
          className="absolute inset-y-0 left-0 bg-white"
          style={{ width: `${effectiveVolume * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─── Speed control ─────────────────────────────────────────────────────────

function SpeedControl({
  playbackRate,
  open,
  onToggle,
  onClose,
  onSelect,
}: {
  playbackRate: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (rate: number) => void;
}) {
  const t = useTranslations('learningMedia.video');
  const format = useFormatter();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [open, onClose]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          open
            ? 'bg-white/10 text-white'
            : 'hover:bg-white/10 text-white/90 hover:text-white'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('speed')}
      >
        <Gauge className="w-4 h-4" />
        <span className="tabular-nums">
          {t('rate', { rate: format.number(playbackRate) })}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 min-w-[7rem] rounded-lg border border-white/10 bg-black/90 backdrop-blur-md shadow-xl py-1 z-10"
        >
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              role="menuitemradio"
              aria-checked={playbackRate === rate}
              onClick={() => onSelect(rate)}
              className={`block w-full text-left px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                playbackRate === rate
                  ? 'text-[var(--color-primary)]'
                  : 'text-white/85 hover:text-white hover:bg-white/10'
              }`}
            >
              {rate === 1 ? t('normalSpeed') : t('rate', { rate: format.number(rate) })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Poster ─────────────────────────────────────────────────────────────────

function PosterOverlay({
  title,
  durationSeconds,
  posterUrl,
  resumePositionSeconds,
  onPlay,
  onResume,
  onStartOver,
}: {
  title?: string;
  durationSeconds?: number;
  posterUrl?: string;
  resumePositionSeconds: number;
  onPlay: () => void;
  onResume: () => void;
  onStartOver: () => void;
}) {
  const t = useTranslations('learningMedia.video');
  const hasResume = resumePositionSeconds > 0;

  return (
    <div className="absolute inset-0 w-full h-full select-none">
      {/* Background: custom image if provided, else the branded default. */}
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt=""
          fill
          unoptimized
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <DefaultPosterArt />
      )}

      {/* Dark vignette overlay so text + button read on any background. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50"
      />

      {/* Center action(s) — single play or resume / start-over pair. */}
      <div className="absolute inset-0 flex items-center justify-center">
        {hasResume ? (
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <button
              type="button"
              onClick={onResume}
              className="inline-flex items-center gap-3 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover,var(--color-primary))] px-6 md:px-7 py-3 md:py-3.5 shadow-2xl ring-1 ring-white/20 text-white font-bold text-sm md:text-base transition-all duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/20">
                <Play className="w-4 h-4 md:w-5 md:h-5 fill-current translate-x-0.5" />
              </span>
              {t('resumeFrom', { time: formatTime(resumePositionSeconds) })}
            </button>
            <button
              type="button"
              onClick={onStartOver}
              className="text-white/80 hover:text-white text-xs md:text-sm font-semibold underline underline-offset-4 decoration-white/30 hover:decoration-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
            >
              {t('startOver')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            aria-label={t('playLesson')}
            className="group/poster focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-full"
          >
            <div className="flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/30 shadow-2xl transition-all duration-300 group-hover/poster:bg-[var(--color-primary)] group-hover/poster:scale-110 group-hover/poster:ring-[var(--color-primary)]">
              <Play className="w-9 h-9 md:w-11 md:h-11 text-white fill-current translate-x-0.5" />
            </div>
          </button>
        )}
      </div>

      {/* Metadata footer */}
      <div className="absolute bottom-0 inset-x-0 p-5 md:p-7 flex items-end justify-between gap-4 text-left pointer-events-none">
        <div className="min-w-0">
          {title && (
            <p className="text-white text-lg md:text-2xl font-bold drop-shadow-lg line-clamp-2">
              {title}
            </p>
          )}
        </div>
        {typeof durationSeconds === 'number' && durationSeconds > 0 && (
          <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/15 px-3 py-1 text-xs md:text-sm font-mono tabular-nums text-white">
            {formatTime(durationSeconds)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Branded default cover — pure SVG + CSS, themed with `var(--color-primary)`.
 * Layers: deep gradient → blurred primary orb → diagonal highlight →
 * low-opacity dot grid pattern. Feels cinematic without a real image.
 */
function DefaultPosterArt() {
  return (
    <div className="absolute inset-0 bg-[#0a0a0f] overflow-hidden">
      {/* Primary-tinted orb, blurred, offset to upper-left. */}
      <div
        aria-hidden
        className="absolute -top-1/3 -left-1/4 w-[80%] h-[140%] rounded-full blur-3xl opacity-40"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, var(--color-primary) 0%, transparent 70%)',
        }}
      />
      {/* Secondary orb, bottom-right, cooler. */}
      <div
        aria-hidden
        className="absolute -bottom-1/3 -right-1/4 w-[70%] h-[120%] rounded-full blur-3xl opacity-30"
        style={{
          background:
            'radial-gradient(circle at 70% 70%, var(--color-primary-dark, var(--color-primary)) 0%, transparent 60%)',
        }}
      />
      {/* Diagonal highlight band */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{
          background:
            'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)',
        }}
      />
      {/* Dot grid pattern */}
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="dotgrid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)" />
      </svg>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
