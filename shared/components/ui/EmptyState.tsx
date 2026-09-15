'use client';

import type { ComponentType, ReactNode } from 'react';
import { motion } from 'motion/react';
import { DURATION, EASE, STAGGER } from '@/shared/motion/constants';

interface EmptyStateProps {
  /** Lucide (or any) icon component rendered inside the rounded badge. */
  icon: ComponentType<{ className?: string }>;
  /** Optional small uppercase eyebrow above the title. */
  eyebrow?: string;
  /** Headline. */
  title: string;
  /** Sub-copy. Optional. */
  description?: ReactNode;
  /** Optional CTA — e.g. a Link or a button. Rendered below the body. */
  cta?: ReactNode;
  /**
   * Surface tone:
   *  - `card`   (default): full card with border + bg, used when this is
   *    the only thing on a section.
   *  - `inline`: lighter, no card chrome, for inside an existing card
   *    (e.g. Comments section that already has its own container).
   */
  tone?: 'card' | 'inline';
  /** Compact paddings — useful inside drawers or narrow columns. */
  compact?: boolean;
  /** Override the icon-badge accent. Defaults to the primary tint. */
  accent?: 'primary' | 'muted';
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.default } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

/**
 * Unified empty-state surface used across the platform. Comments,
 * Notifications, ticket lists, etc. all funnel through this so the
 * "nothing here yet" moment reads as a single design decision instead
 * of N different placeholders.
 *
 * Stagger entrance + subtle icon pulse give it just enough motion to
 * feel alive without competing with real content. Honours
 * prefers-reduced-motion through the global MotionProvider.
 */
export function EmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  cta,
  tone = 'card',
  compact = false,
  accent = 'primary',
}: EmptyStateProps) {
  const wrapperClass =
    tone === 'card'
      ? `rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40 ${
          compact ? 'px-4 py-8' : 'px-6 py-12 md:py-16'
        } text-center`
      : `${compact ? 'py-6' : 'py-10'} text-center`;

  const badgeColor =
    accent === 'primary'
      ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]';

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={wrapperClass}
    >
      <motion.div
        variants={item}
        className={`inline-flex ${compact ? 'w-10 h-10' : 'w-12 h-12'} items-center justify-center rounded-full ${badgeColor} mb-3`}
      >
        <motion.span
          animate={{ scale: [1, 1.06, 1], rotate: [0, 3, 0] }}
          transition={{
            duration: 4,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 0.4,
          }}
          className="flex items-center justify-center"
        >
          <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </motion.span>
      </motion.div>

      {eyebrow && (
        <motion.p
          variants={item}
          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-1.5"
        >
          {eyebrow}
        </motion.p>
      )}

      <motion.h3
        variants={item}
        className={`font-display ${compact ? 'text-base md:text-lg' : 'text-lg md:text-xl'} font-medium text-[var(--color-foreground)] leading-tight tracking-tight`}
      >
        {title}
      </motion.h3>

      {description && (
        <motion.div
          variants={item}
          className={`text-sm text-[var(--color-muted-foreground)] max-w-md mx-auto ${compact ? 'mt-1.5' : 'mt-2'} leading-relaxed`}
        >
          {description}
        </motion.div>
      )}

      {cta && (
        <motion.div variants={item} className="mt-4">
          {cta}
        </motion.div>
      )}
    </motion.div>
  );
}
