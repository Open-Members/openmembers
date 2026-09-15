'use client';

import { useCallback } from 'react';
import { useReducedMotion } from 'motion/react';
import confetti from 'canvas-confetti';

// Lightweight celebration trigger. Picks tenant brand colours from CSS
// custom properties so a white-label Open Members install celebrates in
// whatever palette the admin configured. Skips entirely when the user
// has prefers-reduced-motion: reduce — celebration becomes a no-op,
// callers should still fire any companion toast.
//
// Usage:
//   const fire = useConfetti();
//   fire(); // default centre-bottom burst
//   fire({ origin: { x: 0.5, y: 0.4 } }); // custom origin (0-1 viewport)

type Options = {
  origin?: { x: number; y: number };
  particleCount?: number;
};

function readBrandColors(): string[] {
  if (typeof window === 'undefined') return ['#0235A8', '#F20505', '#FFD166'];
  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue('--color-primary').trim() || '#0235A8';
  const accent = styles.getPropertyValue('--color-accent').trim() || '#F20505';
  // Always add a warm gold for visual contrast with primary/accent —
  // tenants with cool-only palettes still get a pop of warmth.
  return [primary, accent, '#FFD166', '#FFFFFF'];
}

export function useConfetti() {
  const reduced = useReducedMotion();

  return useCallback(
    (opts: Options = {}) => {
      if (reduced) return;
      // Default origin: centre, slightly above the bottom bar (where
      // most CTAs live). Mobile gets fewer particles to feel
      // proportional and stay performant.
      const isNarrow =
        typeof window !== 'undefined' && window.innerWidth < 640;
      const particleCount =
        opts.particleCount ?? (isNarrow ? 50 : 90);
      const colors = readBrandColors();

      confetti({
        particleCount,
        spread: 70,
        startVelocity: 38,
        origin: opts.origin ?? { x: 0.5, y: 0.7 },
        colors,
        zIndex: 9999,
        scalar: isNarrow ? 0.85 : 1,
        ticks: 220,
      });
    },
    [reduced],
  );
}
