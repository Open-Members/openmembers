'use client';

import { useEffect } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from 'motion/react';
import { EASE } from './constants';

interface Props {
  value: number;
  duration?: number;
  /** Locale for number formatting. Defaults to user's browser locale. */
  locale?: string;
}

/**
 * Counter that animates 0 → value once on mount, respecting
 * prefers-reduced-motion (jumps straight to the final value).
 *
 * Reusable across stat cards. Lives in shared/motion so any feature
 * can adopt the same rhythm.
 */
export function AnimatedNumber({
  value,
  duration = 1.1,
  locale,
}: Props) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(mv, (v) =>
    Math.round(v).toLocaleString(locale),
  );

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: EASE.out });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduced]);

  return <motion.span>{rounded}</motion.span>;
}
