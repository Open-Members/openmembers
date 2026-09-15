'use client';

import Image from 'next/image';
import { Link as NextLink } from '@/core/i18n/routing';
import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE } from '@/shared/motion/constants';
import { ProgressBar } from './Badges';

// motion-wrapped Next Link so the card gets spring hover + tap while
// still benefiting from Next's route prefetching.
const MotionLink = motion.create(NextLink);

type Props = {
  courseSlug: string;
  lessonSlug: string;
  courseTitle: string;
  lessonTitle: string;
  thumbnailUrl: string | null;
  /** 0–100 */
  progressPercent: number;
  className?: string;
};

/**
 * Landscape card for the "Continue watching" row. Shows lesson + course
 * context with an overlay progress bar and a play-pulse on hover.
 *
 * Hover behaviour:
 *  - Whole card: lifts (y: -4) + scale 1.015 + shadow grows. Spring.
 *  - Thumbnail: brightness lift + subtle zoom (CSS — cheap on GPU).
 *  - Play overlay: scrim fades in, play button pops from 0.8 to 1 via
 *    motion.div group-hover, giving the "video is ready" affordance.
 */
export function ContinueWatchingCard({
  courseSlug,
  lessonSlug,
  courseTitle,
  lessonTitle,
  thumbnailUrl,
  progressPercent,
  className = '',
}: Props) {
  return (
    <MotionLink
      href={`/courses/${courseSlug}/${lessonSlug}`}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.99 }}
      transition={EASE.spring}
      className={`group relative block flex-shrink-0 w-64 md:w-80 snap-start rounded-xl overflow-hidden bg-[var(--color-card)] border border-[var(--color-border)] transition-[box-shadow,border-color] duration-300 hover:shadow-xl hover:border-[var(--color-primary)]/30 ${className}`}
    >
      <div className="relative aspect-video bg-[var(--color-muted)]">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={lessonTitle}
            fill
            sizes="(max-width: 768px) 256px, 320px"
            className="object-cover transition duration-500 group-hover:scale-[1.04] group-hover:brightness-110"
            unoptimized
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
            }}
          />
        )}

        {/* Play overlay — scrim fades in on card hover; play button scales
            from 0.75 → 1 with a slight extra kick (scale 1 + 110% brightness
            on the icon). Pure CSS keeps it cheap and avoids fighting the
            outer MotionLink spring. */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-[background-color] duration-300">
          <span
            aria-hidden
            className="w-12 h-12 rounded-full bg-white/95 flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition duration-300 ease-out shadow-xl"
          >
            <Play className="w-5 h-5 text-black fill-current ml-0.5" />
          </span>
        </div>

        <ProgressBar percent={progressPercent} />
      </div>

      <div className="p-3 md:p-4 space-y-0.5">
        <p className="text-[10px] md:text-xs uppercase tracking-wider font-semibold text-[var(--color-muted-foreground)] truncate">
          {courseTitle}
        </p>
        <h3 className="text-sm md:text-base font-bold text-[var(--color-foreground)] leading-tight line-clamp-1">
          {lessonTitle}
        </h3>
      </div>
    </MotionLink>
  );
}
