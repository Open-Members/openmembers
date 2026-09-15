'use client';

import { useMemo, useState } from 'react';
import { useLocale, useNow, useTranslations } from 'next-intl';
import { useBrowserTimezone } from '@/shared/hooks/useBrowserTimezone';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowUpRight,
  CalendarPlus,
  Compass,
  Clock,
  Globe,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { LiveClassWithCourse } from '../types';
import { swatchForCourse } from '../lib/colors';
import { buildIcsDataUrl, icsFileName } from '../lib/ics';
import {
  formatInZone,
  formatTimeInZone,
} from '../lib/timezone';
import { trackLiveClassClick } from '../lib/track-click';

type Props = {
  /** All live classes the current user has access to, ordered ascending by starts_at. */
  events: LiveClassWithCourse[];
  /** True when the user has at least one active enrollment. Drives the conversion banner. */
  hasAnyEnrollment: boolean;
};

// Fixed UTC dates produce Monday-first labels without changing the calendar grid.
const WEEKDAY_DATES = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)));

/** Represent a civil date in UTC so month arithmetic never uses the host zone. */
function calendarDateInZone(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((item) => item.type === type)!.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

function toDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Monday-first grid: returns how many cells sit before the 1st of the month. */
function leadingCellsForMonth(firstOfMonth: Date): number {
  return (firstOfMonth.getUTCDay() + 6) % 7;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/**
 * Short time in an IANA zone, stripped of the space so pills like "6:30PM"
 * stay readable inside narrow grid cells.
 */
function shortTime(iso: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(/\s/g, '');
}

function courseBadgeLabel(ev: LiveClassWithCourse, locale: string): string {
  if (ev.courses.length === 0) return ev.courseTitle;
  if (ev.courses.length === 1) return ev.courses[0].title;
  return `${ev.courses[0].title} + ${new Intl.NumberFormat(locale).format(ev.courses.length - 1)}`;
}

/** Primary pill colour for an event. Single-course → course swatch;
 *  multi-course → neutral primary so no single course gets branding priority. */
function pillColorsFor(ev: LiveClassWithCourse): { bg: string; fg: string } {
  if (ev.courses.length <= 1) {
    const swatch = swatchForCourse(ev.courses[0]?.id ?? ev.courseId);
    return { bg: swatch.bg, fg: swatch.fg };
  }
  return {
    bg: 'color-mix(in oklab, var(--color-primary) 85%, transparent)',
    fg: '#fff',
  };
}

export function LiveClassesCalendar({ events, hasAnyEnrollment }: Props) {
  const t = useTranslations('liveClasses');
  const locale = useLocale();
  const now = useNow({ updateInterval: 60_000 });
  const localTz = useBrowserTimezone();
  const calendarZone = localTz ?? 'UTC';
  const today = useMemo(() => calendarDateInZone(now, calendarZone), [now, calendarZone]);
  const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
  // Follow today's month until the student explicitly navigates to another month.
  const visibleMonth = useMemo(() => selectedMonth ?? new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), 1,
  )), [selectedMonth, today]);

  // Group events by local date key for fast per-cell lookup.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, LiveClassWithCourse[]>();
    for (const ev of events) {
      const key = toDayKey(calendarDateInZone(new Date(ev.startsAt), calendarZone));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events, calendarZone]);

  // 6 × 7 = 42 cells, Monday-first. Always 42 so the grid height never jumps.
  const cells = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(
      visibleMonth.getUTCFullYear(),
      visibleMonth.getUTCMonth(),
      1,
    ));
    const leading = leadingCellsForMonth(firstOfMonth);
    const start = addDays(firstOfMonth, -leading);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [visibleMonth]);

  const monthTitle = visibleMonth.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const visibleMonthEvents = useMemo(() => {
    return events.filter((ev) => {
      const d = calendarDateInZone(new Date(ev.startsAt), calendarZone);
      return (
        d.getUTCFullYear() === visibleMonth.getUTCFullYear() &&
        d.getUTCMonth() === visibleMonth.getUTCMonth()
      );
    });
  }, [events, visibleMonth, calendarZone]);

  const goPrev = () => setSelectedMonth(new Date(Date.UTC(
    visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() - 1, 1,
  )));
  const goNext = () => setSelectedMonth(new Date(Date.UTC(
    visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 1,
  )));
  const goToday = () => setSelectedMonth(null);

  const isThisMonth =
    visibleMonth.getUTCFullYear() === today.getUTCFullYear() &&
    visibleMonth.getUTCMonth() === today.getUTCMonth();

  return (
    <section aria-labelledby="schedule-title" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
          {t('schedule')}
        </p>
        <h2
          id="schedule-title"
          className="font-display text-2xl md:text-3xl font-medium leading-tight tracking-tight text-[var(--color-foreground)]"
        >
          {t('calendar.title')}
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t('calendar.description')}
        </p>
      </header>

      {!hasAnyEnrollment && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor:
                'color-mix(in oklab, var(--color-primary) 15%, transparent)',
              color: 'var(--color-primary)',
            }}
            aria-hidden
          >
            <CalendarDays className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm md:text-base font-semibold text-[var(--color-foreground)]">
              {t('calendar.enrollTitle')}
            </p>
            <p className="text-xs md:text-sm text-[var(--color-muted-foreground)] mt-0.5">
              {t('calendar.enrollDescription')}
            </p>
          </div>
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 shrink-0 whitespace-nowrap"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Compass className="w-4 h-4" />
            {t('browseCatalog')}
          </Link>
        </div>
      )}

      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition"
              aria-label={t('calendar.previous')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition"
              aria-label={t('calendar.next')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <h3 className="ml-2 font-display text-lg md:text-xl font-semibold text-[var(--color-foreground)]">
              {monthTitle}
            </h3>
          </div>
          {!isThisMonth && (
            <button
              type="button"
              onClick={goToday}
              className="text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] rounded-lg px-3 py-1.5 hover:bg-[var(--color-muted)] transition"
            >
              {t('calendar.today')}
            </button>
          )}
        </div>

        {/* Weekday row */}
        <div className="grid grid-cols-7 px-2 md:px-4 pt-3">
          {WEEKDAY_DATES.map((date) => (
            <div
              key={date.toISOString()}
              className="text-center text-[10px] md:text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)] pb-2"
            >
              <span className="hidden sm:inline">{date.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })}</span>
              <span className="sm:hidden">{date.toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' })}</span>
            </div>
          ))}
        </div>

        {/* Cell grid */}
        <div
          role="grid"
          aria-label={t('calendar.grid', { month: monthTitle })}
          className="grid grid-cols-7 gap-px bg-[var(--color-border)]/40 px-2 md:px-4 pb-3"
        >
          {cells.map((date) => {
            const dayEvents = eventsByDay.get(toDayKey(date)) ?? [];
            const inCurrentMonth = date.getUTCMonth() === visibleMonth.getUTCMonth();
            const isToday = date.getTime() === today.getTime();
            const isPast = date < today;

            return (
              <div
                key={date.toISOString()}
                role="gridcell"
                aria-label={
                  dayEvents.length > 0
                    ? t('calendar.dayEvents', { date: date.toLocaleDateString(locale, { dateStyle: 'full', timeZone: 'UTC' }), count: dayEvents.length })
                    : date.toLocaleDateString(locale, { dateStyle: 'full', timeZone: 'UTC' })
                }
                className={cn(
                  'relative bg-[var(--color-card)] min-h-[76px] md:min-h-[100px] p-1.5 md:p-2 flex flex-col gap-1 text-left',
                  !inCurrentMonth && 'opacity-35',
                  isPast && inCurrentMonth && !isToday && 'opacity-60',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-[11px] md:text-xs font-semibold tabular-nums',
                      isToday
                        ? 'inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full bg-[var(--color-primary)] text-white'
                        : 'text-[var(--color-foreground)]',
                    )}
                  >
                    {new Intl.NumberFormat(locale).format(date.getUTCDate())}
                  </span>
                </div>

                {/* Event pills (desktop + md) */}
                <div className="hidden sm:flex flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((ev) => {
                    const colors = pillColorsFor(ev);
                    return (
                      <a
                        key={ev.id}
                        href={ev.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackLiveClassClick(ev.id, 'calendar')}
                        className="group flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] md:text-[11px] font-semibold truncate hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: colors.bg, color: colors.fg }}
                        title={`${ev.title} — ${shortTime(ev.startsAt, ev.originTimezone, locale)} ${ev.originTimezone} — ${courseBadgeLabel(ev, locale)}`}
                      >
                        <span className="tabular-nums shrink-0 opacity-80">
                          {shortTime(ev.startsAt, ev.originTimezone, locale)}
                        </span>
                        <span className="truncate">{ev.title}</span>
                      </a>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <span className="text-[10px] font-semibold text-[var(--color-muted-foreground)] px-1">
                      {t('calendar.more', { count: dayEvents.length - 2 })}
                    </span>
                  )}
                </div>

                {/* Mobile: dots */}
                <div className="flex sm:hidden flex-wrap gap-0.5 mt-auto">
                  {dayEvents.slice(0, 4).map((ev) => (
                    <span
                      key={ev.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: pillColorsFor(ev).bg }}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Agenda events={visibleMonthEvents} monthTitle={monthTitle} localTz={localTz} now={now.getTime()} />
    </section>
  );
}

/* ─── Agenda list ─────────────────────────────────────────────────── */

function Agenda({
  events,
  monthTitle,
  localTz,
  now,
}: {
  events: LiveClassWithCourse[];
  monthTitle: string;
  /** Browser-detected IANA zone, populated post-mount. When it differs from
   *  the event's origin_timezone, the card shows a secondary "your local" line. */
  localTz: string | null;
  now: number;
}) {
  const t = useTranslations('liveClasses');
  const locale = useLocale();

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t('calendar.empty', { month: monthTitle })}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((ev) => {
        const start = new Date(ev.startsAt);
        const endMs = start.getTime() + ev.durationMinutes * 60_000;
        const isLive = now >= start.getTime() && now < endMs;
        const isPast = now >= endMs;
        // Single-course events still get a branded swatch; multi-course
        // uses a neutral primary so no co-enrolled course gets highlighted.
        const swatch =
          ev.courses.length <= 1
            ? swatchForCourse(ev.courses[0]?.id ?? ev.courseId)
            : null;
        const courseBadge = courseBadgeLabel(ev, locale);
        const zone = ev.originTimezone;
        const monthShortOrigin = formatInZone(ev.startsAt, zone, { month: 'short' }, locale);
        const dayOriginRaw = formatInZone(ev.startsAt, zone, { day: 'numeric' }, locale);
        const weekdayOrigin = formatInZone(ev.startsAt, zone, { weekday: 'short' }, locale);
        const timeOrigin = formatTimeInZone(ev.startsAt, zone, locale);
        const showLocal = !!localTz && localTz !== zone;
        const icsHref = buildIcsDataUrl({
          id: ev.id,
          title: ev.title,
          description: ev.description,
          startsAt: ev.startsAt,
          durationMinutes: ev.durationMinutes,
          url: ev.meetingUrl,
        });
        return (
          <li
            key={ev.id}
            className={cn(
              'rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3',
              isPast && 'opacity-60',
            )}
          >
            {/* Date block — shows the event's origin-zone day */}
            <div className="flex items-center gap-3 md:w-48 shrink-0">
              <div
                className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
                style={
                  swatch
                    ? { backgroundColor: swatch.soft, color: swatch.bg }
                    : {
                        backgroundColor:
                          'color-mix(in oklab, var(--color-primary) 14%, transparent)',
                        color: 'var(--color-primary)',
                      }
                }
                aria-hidden
              >
                <span className="text-[10px] font-bold uppercase tracking-wider leading-none">
                  {monthShortOrigin}
                </span>
                <span className="text-lg font-bold leading-none tabular-nums">
                  {dayOriginRaw}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {weekdayOrigin}
                </span>
                <span className="text-sm font-semibold text-[var(--color-foreground)] tabular-nums truncate">
                  {timeOrigin}
                </span>
                {showLocal && (
                  <span className="text-[10px] text-[var(--color-muted-foreground)] tabular-nums truncate">
                    {t('localTimeShort', { time: formatTimeInZone(ev.startsAt, localTz!, locale) })}
                  </span>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={
                    swatch
                      ? { backgroundColor: swatch.soft, color: swatch.bg }
                      : {
                          backgroundColor:
                            'color-mix(in oklab, var(--color-primary) 14%, transparent)',
                          color: 'var(--color-primary)',
                        }
                  }
                >
                  {courseBadge}
                </span>
                {isLive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    {t('live')}
                  </span>
                )}
              </div>
              <h4 className="mt-1 text-sm md:text-base font-semibold text-[var(--color-foreground)] truncate">
                {ev.title}
              </h4>
              {ev.description && (
                <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 line-clamp-2">
                  {ev.description}
                </p>
              )}
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t('duration', { minutes: ev.durationMinutes })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {zone}
                </span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {!isPast && (
                <a
                  href={ev.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackLiveClassClick(ev.id, 'calendar')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs md:text-sm font-bold text-white transition-opacity hover:opacity-90 whitespace-nowrap',
                  )}
                  style={{
                    backgroundColor: isLive ? '#ef4444' : 'var(--color-primary)',
                  }}
                >
                  {isLive ? t('join') : t('openLink')}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              )}
              {!isPast && (
                <a
                  href={icsHref}
                  download={icsFileName(ev.title)}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:bg-[var(--color-muted)] transition"
                  title={t('addCalendar')}
                  aria-label={t('addCalendar')}
                >
                  <CalendarPlus className="w-4 h-4" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
