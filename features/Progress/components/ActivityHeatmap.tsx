'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import { DURATION, EASE } from '@/shared/motion/constants';
import type { ActivityDay } from '@/features/Dashboard/queries.server';

// 5-step intensity scale. Buckets chosen so a typical study day (1-3
// lessons) lights up clearly, but a marathon day (6+) reads distinctly
// brighter — the difference between "I showed up" and "I went deep".
const LEVELS = [
  { min: 0, opacity: 6 },
  { min: 1, opacity: 28 },
  { min: 2, opacity: 48 },
  { min: 4, opacity: 72 },
  { min: 6, opacity: 100 },
];

function levelFor(count: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (count >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

interface ActivityHeatmapProps {
  days: ActivityDay[];
}

export function ActivityHeatmap({ days }: ActivityHeatmapProps) {
  const t = useTranslations('learningOverview.activity');
  const format = useFormatter();
  const reduced = useReducedMotion();

  // Group days into weeks (columns). Anchor the first column to the
  // calendar week boundary so weekday rows line up across columns —
  // pad the leading week with empty cells if it doesn't start on Sunday.
  const weeks: (ActivityDay | null)[][] = [];
  let week: (ActivityDay | null)[] = [];

  if (days.length > 0) {
    const firstDow = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
    for (let i = 0; i < firstDow; i++) week.push(null);
  }
  for (const d of days) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  // Month labels — pin one label above the first week of each month.
  const monthMarkers: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < weeks.length; i++) {
    const firstReal = weeks[i].find((d): d is ActivityDay => d !== null);
    if (!firstReal) continue;
    const m = new Date(firstReal.date + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth) {
      monthMarkers.push({ weekIndex: i, label: format.dateTime(new Date(firstReal.date + 'T00:00:00Z'), { month: 'short', timeZone: 'UTC' }) });
      lastMonth = m;
    }
  }

  const totalLessons = days.reduce((sum, d) => sum + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:p-6">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-1">
            {t('period')}
          </p>
          <h2 className="font-display text-xl md:text-2xl font-medium leading-tight tracking-tight text-[var(--color-foreground)]">
            {t('title')}
          </h2>
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {totalLessons === 0
            ? t('empty')
            : t('summary', { lessons: totalLessons, days: activeDays })}
        </p>
      </header>

      {/* Scrollable wrapper for narrow viewports — 12 weeks × ~16px =
          ~200px, fits even small phones, but allow horizontal scroll if
          fonts make it overflow. */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="inline-block">
          {/* Month label row */}
          <div className="flex gap-1 mb-1.5 h-3 text-[10px] font-medium text-[var(--color-muted-foreground)]">
            {weeks.map((_, wi) => {
              const marker = monthMarkers.find((m) => m.weekIndex === wi);
              return (
                <div key={wi} className="w-3 md:w-3.5 shrink-0 leading-none">
                  {marker ? marker.label : ''}
                </div>
              );
            })}
          </div>

          {/* Heatmap grid — 7 rows (Sun-Sat) × N columns (weeks) */}
          <div className="flex gap-1">
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {w.map((day, di) => {
                  if (!day) {
                    return (
                      <div
                        key={`pad-${wi}-${di}`}
                        className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-sm"
                        aria-hidden
                      />
                    );
                  }
                  const level = levelFor(day.count);
                  return (
                    <motion.div
                      key={day.date}
                      initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: DURATION.short,
                        delay: reduced ? 0 : Math.min((wi * 7 + di) * 0.004, 0.5),
                        ease: EASE.out,
                      }}
                      title={t('day', { date: format.dateTime(new Date(day.date + 'T00:00:00Z'), { dateStyle: 'long', timeZone: 'UTC' }), count: day.count })}
                      className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-sm transition-transform hover:scale-125"
                      style={{
                        backgroundColor: `color-mix(in oklab, var(--color-primary) ${level.opacity}%, var(--color-muted))`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <footer className="mt-4 flex items-center justify-end gap-1.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">
        <span>{t('less')}</span>
        {LEVELS.map((l) => (
          <div
            key={l.opacity}
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: `color-mix(in oklab, var(--color-primary) ${l.opacity}%, var(--color-muted))`,
            }}
          />
        ))}
        <span>{t('more')}</span>
      </footer>
    </section>
  );
}
