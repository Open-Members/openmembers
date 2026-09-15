'use client';

import { Link } from '@/core/i18n/routing';
import { useTranslations } from 'next-intl';
import { Compass, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { DURATION, EASE, STAGGER } from '@/shared/motion/constants';

// Empty-state card shown when no content rows resolve. Motion layer:
// - Parent stagger so each block (icon → eyebrow → title → body → CTA)
//   appears in sequence instead of as a slab.
// - Icon wrapper gently pulses (scale 1 ↔ 1.06) every 4s to suggest
//   "something will show up here". Halted at rest so it never grabs
//   focus away from the CTA.
// - CTA scales on hover + tap for the same springy feel as the rest of
//   the dashboard cards.
const container = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.default } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

export function DashboardEmptyState() {
  const t = useTranslations('learningOverview.dashboard');
  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-4 md:mx-8 lg:mx-12 rounded-2xl border border-hairline bg-[var(--color-card)] px-6 py-16 md:py-20 text-center"
    >
      <motion.div
        variants={item}
        className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] mb-5"
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
          <Sparkles className="w-6 h-6" />
        </motion.span>
      </motion.div>

      <motion.p
        variants={item}
        className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2"
      >
        {t('empty.eyebrow')}
      </motion.p>

      <motion.h2
        variants={item}
        className="font-display text-2xl md:text-3xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight mb-3"
      >
        {t('empty.title')}
      </motion.h2>

      <motion.p
        variants={item}
        className="text-sm md:text-base text-[var(--color-muted-foreground)] max-w-md mx-auto mb-6 leading-relaxed"
      >
        {t('empty.description')}
      </motion.p>

      <motion.div variants={item} className="inline-block">
        <motion.span
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={EASE.spring}
          className="inline-block"
        >
          <Link
            href="/courses"
            className="inline-flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Compass className="w-4 h-4" />
            {t('browse')}
          </Link>
        </motion.span>
      </motion.div>
    </motion.section>
  );
}
