'use client';

import { useLocale, useNow, useTranslations } from 'next-intl';
import { useBrowserTimezone } from '@/shared/hooks/useBrowserTimezone';
import Link from 'next/link';
import { CalendarDays, ArrowUpRight, Compass } from 'lucide-react';
import { motion } from 'motion/react';
import { DURATION, EASE, STAGGER } from '@/shared/motion/constants';
import type { LiveClassWithCourse } from '../types';
import { formatInZone, formatTimeInZone } from '../lib/timezone';
import { trackLiveClassClick } from '../lib/track-click';

const MAX_ITEMS = 5;
const WINDOW_DAYS = 30;

interface Props {
  events: LiveClassWithCourse[];
  hasAnyEnrollment: boolean;
}

function isWithinWindow(startsAt: string, durationMinutes: number, now: number): boolean {
  const startMs = new Date(startsAt).getTime();
  const endMs = startMs + durationMinutes * 60_000;
  // Show classes that haven't ended yet, up to N days in the future.
  return endMs > now && startMs < now + WINDOW_DAYS * 86_400_000;
}

function buildCountdown(startsAt: string, durationMinutes: number, now: number, t: ReturnType<typeof useTranslations<'liveClasses'>>): {
  label: string;
  isLive: boolean;
} {
  const startMs = new Date(startsAt).getTime();
  const endMs = startMs + durationMinutes * 60_000;

  if (now >= startMs && now < endMs) return { label: t('liveNow'), isLive: true };

  const ms = startMs - now;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);

  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return { label: t('countdown.weeks', { count: weeks }), isLive: false };
  }
  if (days >= 2) return { label: t('countdown.days', { count: days }), isLive: false };
  if (days === 1) return { label: t('countdown.tomorrow'), isLive: false };
  if (hours >= 1) return { label: t('countdown.hoursMinutes', { hours, minutes }), isLive: false };
  return { label: t('countdown.minutes', { count: Math.max(1, minutes) }), isLive: false };
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.tight } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

/**
 * Compact upcoming-live list. Replaces the page-eating month calendar
 * for the common case (≤ 5 classes in the next 30 days). Renders an
 * empty banner when the user has nothing scheduled in the window.
 */
export function UpcomingLiveStrip({ events, hasAnyEnrollment }: Props) {
  const t = useTranslations('liveClasses');
  const locale = useLocale();
  const tz = useBrowserTimezone() ?? 'UTC';
  // The initial instant is inherited from the request; refresh after hydration.
  const now = useNow({ updateInterval: 60_000 }).getTime();

  const inWindow = events
    .filter((e) => isWithinWindow(e.startsAt, e.durationMinutes, now))
    .slice(0, MAX_ITEMS);

  if (inWindow.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40 px-6 py-10 md:py-12 text-center">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] mb-3">
          <CalendarDays className="w-5 h-5" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-1.5">
          {t('upcoming')}
        </p>
        <h3 className="font-display text-lg md:text-xl font-medium text-[var(--color-foreground)]">
          {hasAnyEnrollment
            ? t('strip.emptyEnrolled', { days: WINDOW_DAYS })
            : t('strip.emptyVisitor')}
        </h3>
        {!hasAnyEnrollment && (
          <Link
            href="/courses"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:underline"
          >
            <Compass className="w-4 h-4" />
            {t('browseCourses')}
          </Link>
        )}
      </section>
    );
  }

  return (
    <section>
      <header className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-1">
            {t('schedule')}
          </p>
          <h2 className="font-display text-xl md:text-2xl font-medium leading-tight tracking-tight text-[var(--color-foreground)]">
            {t('upcoming')}
          </h2>
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)] hidden sm:block">
          {t('strip.window', { days: WINDOW_DAYS, timezone: tz })}
        </p>
      </header>

      <motion.ul
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-2.5"
      >
        {inWindow.map((evt) => {
          const cd = buildCountdown(evt.startsAt, evt.durationMinutes, now, t);
          const dateLabel = formatInZone(evt.startsAt, tz, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }, locale);
          const timeLabel = formatTimeInZone(evt.startsAt, tz, locale);
          const courseTitle = evt.courses[0]?.title ?? evt.courseTitle;
          const courseSlug = evt.courses[0]?.slug ?? evt.courseSlug;

          return (
            <motion.li key={evt.id} variants={itemVariants}>
              <a
                href={evt.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackLiveClassClick(evt.id)}
                className="group flex items-center gap-3 md:gap-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 md:p-4 transition-[border-color,box-shadow] hover:border-[var(--color-primary)]/40 hover:shadow-md"
              >
                {/* Countdown pill — left rail */}
                <div
                  className={`shrink-0 w-20 md:w-24 rounded-lg px-2.5 py-1.5 text-center ${
                    cd.isLive
                      ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-wider font-bold">
                    {cd.isLive ? `● ${t('live')}` : t('starts')}
                  </p>
                  <p
                    className={`text-xs md:text-sm font-semibold leading-tight ${
                      cd.isLive
                        ? 'text-[var(--color-accent)]'
                        : 'text-[var(--color-foreground)]'
                    }`}
                  >
                    {cd.label}
                  </p>
                </div>

                {/* Title + course */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-base md:text-lg font-medium leading-snug tracking-tight text-[var(--color-foreground)] line-clamp-1">
                    {evt.title}
                  </h3>
                  <p className="text-xs text-[var(--color-muted-foreground)] truncate mt-0.5">
                    {courseTitle}
                  </p>
                </div>

                {/* Time + arrow */}
                <div className="hidden md:flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-[var(--color-muted-foreground)] uppercase tracking-wider">
                      {dateLabel}
                    </p>
                    <p className="text-sm font-semibold text-[var(--color-foreground)] tabular-nums">
                      {timeLabel}
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] transition-colors" />
                </div>
              </a>
              {courseSlug && (
                <Link
                  href={`/courses/${courseSlug}`}
                  className="inline-flex mt-1.5 ml-3 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t('viewCourse')}
                </Link>
              )}
            </motion.li>
          );
        })}
      </motion.ul>
    </section>
  );
}
