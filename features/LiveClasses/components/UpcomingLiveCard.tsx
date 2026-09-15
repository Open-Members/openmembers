'use client';

import { useMemo } from 'react';
import { useLocale, useNow, useTranslations } from 'next-intl';
import { useBrowserTimezone } from '@/shared/hooks/useBrowserTimezone';
import {
  CalendarDays,
  ArrowUpRight,
  Video,
  CalendarPlus,
  Clock,
  Globe,
} from 'lucide-react';
import type { UpcomingLiveClass, LiveClassCourseLink } from '../types';
import { SoundwaveIcon } from './SoundwaveIcon';
import { buildIcsDataUrl, icsFileName } from '../lib/ics';
import { trackLiveClassClick } from '../lib/track-click';
import {
  formatInZone,
  formatTimeInZone,
} from '../lib/timezone';

type Props = {
  liveClass: UpcomingLiveClass;
};

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

type Translate = ReturnType<typeof useTranslations<'liveClasses'>>;

function courseLabel(courses: LiveClassCourseLink[], t: Translate): string {
  if (courses.length === 0) return '';
  if (courses.length === 1) return courses[0].title;
  return t('coursesMore', { title: courses[0].title, count: courses.length - 1 });
}

type UpcomingView =
  | {
      mode: 'normal';
      /** "Fri, Oct 17" */
      dateLabel: string;
      /** "6:30 PM BST" */
      timeLabel: string;
      /** "in 3h 24m" */
      countdown: string;
      alertLevel: 'normal';
    }
  | {
      mode: 'imminent';
      /** "Starting in 4:23" — big digits */
      big: string;
      /** "6:30 PM BST" — still shown muted below */
      timeLabel: string;
      alertLevel: 'close' | 'imminent';
    };

function buildUpcomingView(
  startsAt: string,
  nowMs: number,
  zone: string,
  locale: string,
  t: Translate,
): UpcomingView {
  const start = new Date(startsAt);
  const ms = Math.max(0, start.getTime() - nowMs);
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const dateLabel = formatInZone(startsAt, zone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }, locale);
  const timeLabel = formatTimeInZone(startsAt, zone, locale);

  // Imminent mode (<5 min) — drop the date, emphasise the count.
  if (days === 0 && hours === 0 && minutes < 5) {
    const mmss = `${pad(minutes)}:${pad(seconds)}`;
    return {
      mode: 'imminent',
      big: t('countdown.starting', { time: mmss }),
      timeLabel,
      alertLevel: minutes < 1 ? 'imminent' : 'close',
    };
  }

  let countdown: string;
  if (days > 0) countdown = t('countdown.daysHours', { days, hours });
  else if (hours > 0) countdown = t('countdown.hoursMinutes', { hours, minutes });
  else countdown = t('countdown.minutesSeconds', { minutes, seconds: pad(seconds) });

  return { mode: 'normal', dateLabel, timeLabel, countdown, alertLevel: 'normal' };
}

function formatElapsedMinSec(nowMs: number, startMs: number, t: Translate): string {
  const sec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}:${pad(s)}`;
  const h = Math.floor(m / 60);
  return t('elapsedHours', { hours: h, minutes: pad(m % 60) });
}

export function UpcomingLiveCard({ liveClass }: Props) {
  const startMs = useMemo(
    () => new Date(liveClass.startsAt).getTime(),
    [liveClass.startsAt],
  );
  const endMs = startMs + liveClass.durationMinutes * 60_000;

  const now = useNow({ updateInterval: 1000 }).getTime();

  if (now >= endMs) return null;

  const isLive = now >= startMs;

  return (
    <section aria-labelledby="upcoming-live-title" className="px-4 md:px-6 lg:px-8">
      <div className="max-w-[1600px] mx-auto">
        {isLive ? (
          <LiveState liveClass={liveClass} now={now} startMs={startMs} />
        ) : (
          <UpcomingState liveClass={liveClass} now={now} />
        )}
      </div>
    </section>
  );
}

/* ─── LIVE NOW ─────────────────────────────────────────────────────── */

function LiveState({
  liveClass,
  now,
  startMs,
}: {
  liveClass: UpcomingLiveClass;
  now: number;
  startMs: number;
}) {
  const t = useTranslations('liveClasses');
  const elapsed = formatElapsedMinSec(now, startMs, t);
  const coursesText = courseLabel(liveClass.courses, t);

  return (
    <div
      className="live-halo-wrapper relative overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/40 via-[var(--color-card)] to-[var(--color-card)] p-6 md:p-8 transition-transform duration-300 hover:-translate-y-0.5"
      style={{ animation: 'live-halo 2.4s ease-in-out infinite' }}
    >
      <div
        aria-hidden
        className="live-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.16) 50%, transparent 100%)',
          animation: 'live-shimmer-sweep 4.5s ease-in-out infinite',
        }}
      />

      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div
            className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shrink-0 bg-red-500 text-white shadow-lg shadow-red-500/40"
            aria-hidden
          >
            <Video className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2.2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="inline-flex items-center gap-2 rounded-full bg-red-500 text-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.18em] shadow-sm shadow-red-500/40">
                <SoundwaveIcon className="w-3.5 h-3.5" />
                {t('liveNow')}
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)] truncate">
                {coursesText}
              </span>
            </div>

            <h2
              id="upcoming-live-title"
              className="font-display text-2xl md:text-3xl font-semibold text-[var(--color-foreground)] leading-[1.15] tracking-tight"
            >
              {liveClass.title}
            </h2>

            <p className="text-sm text-[var(--color-muted-foreground)] mt-2 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span className="tabular-nums">{t('elapsed', { time: elapsed })}</span>
              </span>
              <span className="opacity-60">·</span>
              <span>{t('scheduled', { minutes: liveClass.durationMinutes })}</span>
            </p>
          </div>
        </div>

        <a
          href={liveClass.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackLiveClassClick(liveClass.id, 'banner')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm md:text-base font-bold text-white bg-red-500 hover:bg-red-600 focus-visible:ring-4 focus-visible:ring-red-500/40 transition-colors shrink-0 whitespace-nowrap shadow-lg shadow-red-500/30"
        >
          <Video className="w-4 h-4" />
          {t('join')}
          <ArrowUpRight className="w-4 h-4 opacity-90" />
        </a>
      </div>
    </div>
  );
}

/* ─── UPCOMING ─────────────────────────────────────────────────────── */

function UpcomingState({
  liveClass,
  now,
}: {
  liveClass: UpcomingLiveClass;
  now: number;
}) {
  const t = useTranslations('liveClasses');
  const locale = useLocale();
  const localTz = useBrowserTimezone();

  const view = buildUpcomingView(liveClass.startsAt, now, liveClass.originTimezone, locale, t);
  const coursesText = courseLabel(liveClass.courses, t);

  const icsHref = useMemo(
    () =>
      buildIcsDataUrl({
        id: liveClass.id,
        title: liveClass.title,
        description: liveClass.description,
        startsAt: liveClass.startsAt,
        durationMinutes: liveClass.durationMinutes,
        url: liveClass.meetingUrl,
      }),
    [liveClass],
  );
  const icsName = icsFileName(liveClass.title);

  const showLocalHelper = !!localTz && localTz !== liveClass.originTimezone;
  const localLine = showLocalHelper
    ? `${formatInZone(liveClass.startsAt, localTz!, { weekday: 'short', month: 'short', day: 'numeric' }, locale)} · ${formatTimeInZone(liveClass.startsAt, localTz!, locale)}`
    : null;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] p-6 md:p-8 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--color-primary) 16%, var(--color-card)) 0%, color-mix(in oklab, var(--color-primary) 4%, var(--color-card)) 55%, var(--color-card) 100%)',
      }}
    >
      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div
            className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor:
                'color-mix(in oklab, var(--color-primary) 20%, transparent)',
              color: 'var(--color-primary)',
            }}
            aria-hidden
          >
            <CalendarDays className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{
                  backgroundColor:
                    'color-mix(in oklab, var(--color-primary) 15%, transparent)',
                  color: 'var(--color-primary)',
                }}
              >
                {t('upcomingClass')}
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)] truncate">
                {coursesText}
              </span>
            </div>

            <h2
              id="upcoming-live-title"
              className="font-display text-2xl md:text-3xl font-semibold text-[var(--color-foreground)] leading-[1.15] tracking-tight"
            >
              {liveClass.title}
            </h2>

            {/* Primary time block */}
            {view.mode === 'imminent' ? (
              <div className="mt-2.5 flex items-baseline gap-3 flex-wrap">
                <p
                  className={
                    'font-semibold tabular-nums text-xl md:text-2xl ' +
                    (view.alertLevel === 'imminent'
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-[var(--color-foreground)]')
                  }
                  style={
                    view.alertLevel === 'imminent'
                      ? {
                          animation: 'countdown-soft-pulse 1.2s ease-in-out infinite',
                        }
                      : undefined
                  }
                >
                  {view.big}
                </p>
                <span className="text-sm text-[var(--color-muted-foreground)] inline-flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {view.timeLabel}
                </span>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-col gap-0.5">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <p className="text-base md:text-lg font-semibold text-[var(--color-foreground)] tabular-nums">
                    {view.dateLabel} · {view.timeLabel}
                  </p>
                  <span className="text-sm text-[var(--color-muted-foreground)]">
                    {view.countdown}
                  </span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    · {t('duration', { minutes: liveClass.durationMinutes })}
                  </span>
                </div>
                {localLine && (
                  <p className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
                    {t('localTime', { time: localLine })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-stretch md:items-end gap-2 shrink-0">
          <a
            href={liveClass.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackLiveClassClick(liveClass.id, 'banner')}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:ring-4 whitespace-nowrap"
            style={{
              backgroundColor: 'var(--color-primary)',
              ['--tw-ring-color' as string]:
                'color-mix(in oklab, var(--color-primary) 35%, transparent)',
            }}
          >
            {t('openMeeting')}
            <ArrowUpRight className="w-4 h-4" />
          </a>
          <a
            href={icsHref}
            download={icsName}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            {t('addCalendar')}
          </a>
        </div>
      </div>
    </div>
  );
}
