'use client';

import Image from 'next/image';
import { Link as NextLink } from '@/core/i18n/routing';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { BookOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE } from '@/shared/motion/constants';
import { courseAccessHref } from '@/shared/config/sales';

// motion-wrapped Next Link so the whole card gets a spring hover without
// losing route prefetching.
const MotionLink = motion.create(NextLink);
import {
  NewBadge,
  LockBadge,
  CompletedBadge,
  DurationChip,
  DurationLabel,
  ProgressBar,
  FreeBadge,
  ComingSoonBadge,
} from './Badges';
import { HoverPreview } from './HoverPreview';

/**
 * View-model consumed by every student-facing card surface. All student
 * queries should shape their results into this type.
 */
export type CardCourse = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  thumbnailLandscapeUrl: string | null;
  thumbnailPortraitUrl: string | null;
  instructorName: string | null;
  instructorPortraitUrl?: string | null;
  durationMinutes: number | null;
  isNew: boolean;
  isFeatured: boolean;
  /** Free-tier course — accessible to any authenticated user. */
  isFree: boolean;
  /**
   * Admin-flagged teaser — the course shell exists but isn't released yet.
   * Overrides lock/new/free badges on the card and blocks navigation for
   * everyone (including admins and owners).
   */
  isComingSoon: boolean;
  /** Whether the user can reach the course player (admins bypass this). */
  isAccessible: boolean;
  /**
   * Whether the user *owns* this course via an active enrollment (no admin
   * bypass). Drives the lock visual so admins previewing the catalog still
   * see locks on courses they haven't enrolled in.
   */
  isOwned: boolean;
  /** 0–100. Use when the user is enrolled. */
  progressPercent: number;
  /** True when the user has finished every lesson. */
  isCompleted: boolean;
  /** Configured offer; falls back to support when absent or invalid. */
  checkoutUrl: string | null;
  /** Short R2-hosted trailer URL for hover preview; null → static thumbnail only. */
  trailerUrl?: string | null;
};

type CardProps = {
  course: CardCourse;
  className?: string;
  /**
   * - `row` (default): fixed width with `flex-shrink-0 snap-start` — used inside a ContentRow.
   * - `grid`: fills its grid cell (`w-full`).
   */
  variant?: 'row' | 'grid';
};

// ─────────────────────────────────────────────────────────────────────────────
// PortraitCard — 2:3 cinematic tile (Masterclass-style).
// ─────────────────────────────────────────────────────────────────────────────

export function PortraitCard({ course, className = '', variant = 'row' }: CardProps) {
  const t = useTranslations('learningOverview.cards');
  const href = accessHref(course);
  const external = isExternal(href);
  const comingSoon = course.isComingSoon;
  const locked = !comingSoon && !course.isOwned;
  const image = course.thumbnailPortraitUrl ?? course.thumbnailLandscapeUrl;
  const thumbRef = useRef<HTMLDivElement>(null);
  const trailerEnabled =
    !locked && !comingSoon && !!course.trailerUrl;

  const sizing =
    variant === 'row'
      ? 'flex-shrink-0 w-40 md:w-48 lg:w-52 snap-start'
      : 'w-full';

  return (
    <CardLink
      href={href}
      external={external}
      className={`group relative block ${sizing} rounded-xl overflow-hidden bg-[var(--color-muted)] transition-[box-shadow,outline-color] duration-300 ease-out outline outline-1 outline-transparent ${
        locked ? '' : 'hover:shadow-xl hover:outline-[color-mix(in_oklab,var(--color-foreground)_14%,transparent)]'
      } ${className}`}
    >
      <div ref={thumbRef} className="relative aspect-[2/3] overflow-hidden">
        <Thumbnail
          src={image}
          alt={course.title}
          locked={locked}
          comingSoon={comingSoon}
          hover={!locked && !comingSoon}
          sizes="(max-width: 768px) 160px, 208px"
        />

        {/* Legibility gradient — darker at bottom for editorial title */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />

        {trailerEnabled && course.trailerUrl && (
          <HoverPreview
            src={course.trailerUrl}
            hoverRef={thumbRef}
            poster={image ?? undefined}
          />
        )}

        {/* Top-left badges — Coming Soon is exclusive; otherwise stack Free/New/Completed */}
        <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1 z-10">
          {comingSoon ? (
            <ComingSoonBadge />
          ) : (
            <>
              {course.isFree && <FreeBadge />}
              {course.isNew && !locked && <NewBadge />}
              {course.isCompleted && !locked && <CompletedBadge />}
            </>
          )}
        </div>

        {/* Top-right chip / lock — suppressed for Coming Soon */}
        {!comingSoon && (
          <div className="absolute top-2.5 right-2.5 z-10">
            {locked ? (
              <LockBadge />
            ) : (
              <DurationChip minutes={course.durationMinutes} />
            )}
          </div>
        )}

        {/* Bottom text — display serif for editorial feel */}
        <div className="absolute inset-x-0 bottom-0 p-3.5 z-10">
          <h3 className="font-display text-base md:text-lg font-semibold text-white leading-[1.1] tracking-tight line-clamp-2 drop-shadow">
            {course.title}
          </h3>
          {course.instructorName && (
            <p className="font-display italic text-xs md:text-sm text-white/75 mt-1.5 line-clamp-1">
              {t('instructor', { name: course.instructorName })}
            </p>
          )}
        </div>

        {/* Progress bar for in-progress enrolled courses */}
        {!locked && course.progressPercent > 0 && !course.isCompleted && (
          <ProgressBar percent={course.progressPercent} />
        )}
      </div>
    </CardLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LandscapeCard — 16:9 with metadata strip under the image.
// ─────────────────────────────────────────────────────────────────────────────

export function LandscapeCard({ course, className = '', variant = 'row' }: CardProps) {
  const t = useTranslations('learningOverview.cards');
  const href = accessHref(course);
  const external = isExternal(href);
  const comingSoon = course.isComingSoon;
  const locked = !comingSoon && !course.isOwned;
  const image = course.thumbnailLandscapeUrl ?? course.thumbnailPortraitUrl;
  const thumbRef = useRef<HTMLDivElement>(null);
  const trailerEnabled =
    !locked && !comingSoon && !!course.trailerUrl;

  const sizing =
    variant === 'row'
      ? 'flex-shrink-0 w-64 md:w-80 snap-start'
      : 'w-full';

  return (
    <CardLink
      href={href}
      external={external}
      className={`group relative block ${sizing} rounded-xl overflow-hidden bg-[var(--color-card)] border border-hairline transition-[border-color,box-shadow] duration-300 ease-out ${
        locked ? '' : 'hover:border-[color-mix(in_oklab,var(--color-foreground)_18%,transparent)] hover:shadow-lg'
      } ${className}`}
    >
      <div ref={thumbRef} className="relative aspect-video overflow-hidden">
        <Thumbnail
          src={image}
          alt={course.title}
          locked={locked}
          comingSoon={comingSoon}
          hover={!locked && !comingSoon}
          sizes="(max-width: 768px) 256px, 320px"
        />

        {trailerEnabled && course.trailerUrl && (
          <HoverPreview
            src={course.trailerUrl}
            hoverRef={thumbRef}
            poster={image ?? undefined}
          />
        )}

        {/* Top-left badges — Coming Soon is exclusive */}
        <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1 z-10">
          {comingSoon ? (
            <ComingSoonBadge />
          ) : (
            <>
              {course.isFree && <FreeBadge />}
              {course.isNew && !locked && <NewBadge />}
              {course.isCompleted && !locked && <CompletedBadge />}
            </>
          )}
        </div>

        {/* Top-right lock — suppressed for Coming Soon */}
        {locked && (
          <div className="absolute top-2.5 right-2.5 z-10">
            <LockBadge />
          </div>
        )}

        {/* Progress bar */}
        {!locked && !comingSoon && course.progressPercent > 0 && !course.isCompleted && (
          <ProgressBar percent={course.progressPercent} />
        )}
      </div>

      {/* Metadata strip */}
      <div className="p-4 space-y-1.5">
        <h3 className="font-display text-base md:text-lg font-semibold text-[var(--color-foreground)] leading-[1.15] tracking-tight line-clamp-2">
          {course.title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          {course.instructorName && (
            <span className="truncate font-display italic">{t('instructor', { name: course.instructorName })}</span>
          )}
          {course.durationMinutes && course.instructorName && (
            <span className="text-[var(--color-muted-foreground)]/40">·</span>
          )}
          {course.durationMinutes ? (
            <span className="shrink-0">
              <DurationLabel minutes={course.durationMinutes} />
            </span>
          ) : null}
        </div>
      </div>
    </CardLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the target URL for the card click. Accessible courses open the
 * player; locked courses open a configured offer or ask support for access.
 */
function accessHref(course: CardCourse): string {
  if (course.isAccessible) return `/courses/${course.slug}`;
  return courseAccessHref(course.checkoutUrl);
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function CardLink({
  href,
  external,
  className,
  children,
}: {
  href: string;
  external: boolean;
  className: string;
  children: React.ReactNode;
}) {
  // Spring hover + tap for every actionable card.
  //
  // Lift only — no outer scale. Earlier we combined y:-4 with scale:1.015,
  // but the inner <Thumbnail> already scales (group-hover:scale-[1.02]).
  // Two nested transforms + overflow-hidden + rounded-xl produced subpixel
  // antialiasing on the top edge, which read as "the top border lost
  // colour" vs the other sides. Keeping just the lift eliminates the
  // double-transform and leaves the Masterclass feel intact.
  const motionProps = {
    whileHover: { y: -4 },
    whileTap: { scale: 0.99 },
    transition: EASE.spring,
  } as const;

  if (external) {
    return (
      <motion.a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        {...motionProps}
      >
        {children}
      </motion.a>
    );
  }
  return (
    <MotionLink href={href} className={className} {...motionProps}>
      {children}
    </MotionLink>
  );
}

function Thumbnail({
  src,
  alt,
  locked,
  comingSoon = false,
  hover = false,
  sizes,
}: {
  src: string | null | undefined;
  alt: string;
  locked: boolean;
  /** Anticipation state — warm sepia tint instead of cold grayscale. */
  comingSoon?: boolean;
  /** Apply the editorial hover crossfade (brightness lift, no scale jump). */
  hover?: boolean;
  sizes: string;
}) {
  const filterClass = comingSoon
    ? 'sepia brightness-[0.72] contrast-[0.96]'
    : locked
      ? 'grayscale brightness-[0.6]'
      : hover
        ? 'group-hover:brightness-110 group-hover:scale-[1.02]'
        : '';

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover transition-[filter,transform] duration-500 ease-out ${filterClass}`}
        unoptimized
      />
    );
  }
  // Placeholder when no artwork
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center ${
        locked || comingSoon ? 'opacity-60' : ''
      }`}
      style={{
        background:
          'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
      }}
    >
      <BookOpen className="w-8 h-8 text-white/60" />
    </div>
  );
}
