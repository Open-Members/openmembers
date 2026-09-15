'use client';

import { useEffect, useRef, useState } from 'react';

const HOVER_DELAY_MS = 500;
const MAX_PLAYBACK_SECONDS = 15;

interface HoverPreviewProps {
  /** Presigned R2 URL for the trailer; parent is responsible for refreshing. */
  src: string;
  /** Hover target — when the pointer lingers past the debounce, the video fades in. */
  hoverRef: React.RefObject<HTMLElement | null>;
  /** Opt out on pointer-coarse devices (touch); hover previews are disruptive there. */
  disabled?: boolean;
  /** First frame shown before playback starts — avoids black flash during fade-in. */
  poster?: string;
}

/**
 * Netflix-style hover trailer. Starts muted/autoplay after a 500ms debounce
 * so casual mouseovers don't trigger playback, caps playback at 15s to keep
 * R2 egress bounded, and fades out when the pointer leaves.
 *
 * The `<video>` stacks above the thumbnail with `pointer-events: none` so
 * the parent Link/button still owns the click.
 */
export function HoverPreview({ src, hoverRef, disabled, poster }: HoverPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (disabled) return;

    // Don't wire hover listeners on touch devices — they'd fire on tap and
    // compete with the card's navigation click.
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(hover: hover)');
      if (!mq.matches) return;
    }

    const el = hoverRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onEnter = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(true), HOVER_DELAY_MS);
    };
    const onLeave = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      setActive(false);
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [hoverRef, disabled]);

  // Rewind + pause when the preview leaves the active state so the next
  // hover always starts from frame 0.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => {
        /* autoplay blocked — silent fallback, thumbnail stays visible */
      });
    } else {
      v.pause();
    }
  }, [active]);

  if (disabled) return null;

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      muted
      playsInline
      loop
      preload="none"
      onTimeUpdate={(e) => {
        // Cap each hover session to 15s — the <video> has loop enabled so
        // once we hit the cap we stop active state; next hover restarts.
        if (e.currentTarget.currentTime >= MAX_PLAYBACK_SECONDS) {
          setActive(false);
        }
      }}
      className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden="true"
    />
  );
}
