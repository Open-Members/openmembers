// Shared motion timing + easing constants.
//
// One source of truth so every animated surface uses the same rhythm.
// If you find yourself picking a number here, think twice — most motion
// in the app should use DURATION.base + EASE.out or EASE.spring.

export const DURATION = {
  instant: 0.12,
  short:   0.18,
  base:    0.24,
  slow:    0.40,
  slower:  0.60,
} as const;

// Cubic bezier tuple + spring presets. Import from `motion/react` and
// spread: `transition={EASE.spring}`.
export const EASE = {
  /** Cubic "premium" out — default for entrances. */
  out:    [0.16, 1, 0.3, 1] as const,
  /** Symmetric curve for state toggles. */
  inOut:  [0.4, 0, 0.2, 1] as const,
  /** Default spring for hover / layout transitions. */
  spring: { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 } as const,
  /** Softer spring for big cards / hero surfaces. */
  springSoft: { type: 'spring', stiffness: 180, damping: 22, mass: 1.1 } as const,
  /** Snappier spring for taps / quick affordances. */
  springSnappy: { type: 'spring', stiffness: 340, damping: 24, mass: 0.8 } as const,
} as const;

// Stagger delays — keep under 8 children; longer lists should stagger
// only the first 8 and instant-mount the rest.
export const STAGGER = {
  tight:   0.03,
  default: 0.05,
  loose:   0.08,
} as const;
