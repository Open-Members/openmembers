'use client';

/**
 * Siri-inspired animated gradient orb. Pure CSS (conic + radial gradients
 * on layered divs) — no SVG, no Canvas, no JS-driven animation. Renders
 * at 60fps on anything modern because the animation is a single
 * background-position / transform loop that the compositor can handle
 * on its own thread.
 *
 * Usage:
 *   <SiriOrb size="md" />
 *   <SiriOrb size="xl" state="thinking" />
 *   <SiriOrb size={44} />
 */
import type { CSSProperties } from 'react';

type SiriOrbSize = 'sm' | 'md' | 'lg' | 'xl' | number;
type SiriOrbState = 'idle' | 'thinking';

interface SiriOrbProps {
  size?: SiriOrbSize;
  state?: SiriOrbState;
  className?: string;
  /** Render without the outer soft halo (useful inside small buttons). */
  noHalo?: boolean;
}

function resolveSize(size: SiriOrbSize): number {
  if (typeof size === 'number') return size;
  switch (size) {
    case 'sm':
      return 18;
    case 'md':
      return 36;
    case 'lg':
      return 64;
    case 'xl':
      return 112;
  }
}

/**
 * Blend the installation's primary and accent colors, closing the loop so
 * the rotating conic gradient has no visible seam.
 */
const GRADIENT = [
  'var(--color-primary)',
  'color-mix(in oklab, var(--color-primary), var(--color-accent) 30%)',
  'var(--color-accent)',
  'color-mix(in oklab, var(--color-primary), var(--color-accent) 60%)',
  'var(--color-primary)',
].join(', ');

export default function SiriOrb({
  size = 'md',
  state = 'idle',
  className = '',
  noHalo = false,
}: SiriOrbProps) {
  const px = resolveSize(size);
  const rotateDuration = state === 'thinking' ? '2.5s' : '6s';
  const breatheDuration = state === 'thinking' ? '1.4s' : '3.2s';
  const haloScale = state === 'thinking' ? 1.35 : 1.2;

  const root: CSSProperties = {
    width: px,
    height: px,
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0,
  };

  // Inner rotating conic gradient — this is the "shimmer"
  const conicLayer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    background: `conic-gradient(from 0deg, ${GRADIENT})`,
    animation: `sirorb-rotate ${rotateDuration} linear infinite`,
    filter: `blur(${px > 50 ? 6 : 2}px)`,
  };

  // Soft centre highlight to give depth (radial gradient overlay)
  const highlightLayer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    background:
      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 45%)',
    pointerEvents: 'none',
  };

  // Breathing outer halo — soft glow behind the orb
  const halo: CSSProperties = noHalo
    ? { display: 'none' }
    : {
        position: 'absolute',
        inset: `-${Math.round(px * 0.3)}px`,
        borderRadius: '50%',
        background: `conic-gradient(from 90deg, ${GRADIENT})`,
        filter: `blur(${Math.max(12, px * 0.25)}px)`,
        opacity: state === 'thinking' ? 0.55 : 0.35,
        transform: `scale(${haloScale})`,
        animation: `sirorb-rotate ${rotateDuration} linear infinite reverse, sirorb-breathe ${breatheDuration} ease-in-out infinite`,
        pointerEvents: 'none',
        zIndex: 0,
      };

  // Crisp rim to hide any seam and give the orb a defined edge
  const rim: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
    pointerEvents: 'none',
  };

  return (
    <span
      style={root}
      className={`siri-orb-root ${className}`.trim()}
      aria-hidden="true"
    >
      <span style={halo} />
      <span
        style={{
          ...conicLayer,
          animation: `${conicLayer.animation}, sirorb-breathe ${breatheDuration} ease-in-out infinite`,
        }}
      />
      <span style={highlightLayer} />
      <span style={rim} />
      <style jsx global>{`
        @keyframes sirorb-rotate {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes sirorb-breathe {
          0%,
          100% {
            opacity: 0.95;
          }
          50% {
            opacity: 0.75;
          }
        }
        /* Dim the orb uniformly in dark mode — the halo that reads well
           on a light surface was punching through and looking "hot" on
           our near-black background. brightness+saturate together keep
           hue identity while lowering intensity. */
        .dark .siri-orb-root {
          filter: brightness(0.78) saturate(0.9);
        }
      `}</style>
    </span>
  );
}
