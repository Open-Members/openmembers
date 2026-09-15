import { useFormatter, useTranslations } from 'next-intl';
import { Lock, Check, Clock, Star } from 'lucide-react';

/**
 * Small presentational badges and chips used across cards, hero, and episode lists.
 * All visual; no data-fetching.
 *
 * Design language — three distinct visual personalities so stacked badges read
 * quickly:
 *   • FREE — glossy emerald "ribbon" (gift / unlock vibe)
 *   • NEW — Netflix-red pill with an animated pulse dot (alert / hot)
 *   • COMING SOON — matte classified stamp with amber warning stripes (teaser)
 */

export function FreeBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('learningOverview.badges');
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] md:text-[11px] font-black uppercase tracking-[0.22em] text-white ${className}`}
      style={{
        background:
          'linear-gradient(135deg, #047857 0%, #10b981 45%, #34d399 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.32), 0 2px 10px rgba(16, 185, 129, 0.45)',
      }}
    >
      {t('free')}
    </span>
  );
}

export function NewBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('learningOverview.badges');
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] md:text-[11px] font-black uppercase tracking-[0.12em] text-white ${className}`}
      style={{
        backgroundColor: '#E50914',
        boxShadow:
          '0 0 0 1px rgba(229, 9, 20, 0.45), 0 4px 14px rgba(229, 9, 20, 0.45)',
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/80" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
      </span>
      {t('new')}
    </span>
  );
}

/**
 * Classified / redacted-document look. Black body with amber warning-stripe
 * rules top + bottom. Slight rotation sells the "stamped on" feel.
 * Exclusive — when a course is Coming Soon, other badges (Free/New/Lock)
 * should not render.
 */
export function ComingSoonBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('learningOverview.badges');
  const stripe =
    'repeating-linear-gradient(135deg, #f59e0b 0 6px, #111111 6px 12px)';
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-[0.28em] text-[#fbbf24] bg-[#0b0b0b] ${className}`}
      style={{ transform: 'rotate(-2deg)', borderRadius: 2 }}
    >
      <span
        aria-hidden
        className="absolute left-0 right-0 top-0 h-[3px]"
        style={{ background: stripe }}
      />
      <span
        aria-hidden
        className="absolute left-0 right-0 bottom-0 h-[3px]"
        style={{ background: stripe }}
      />
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[#fbbf24]/60">
        <Clock className="w-2 h-2" />
      </span>
      {t('comingSoon')}
    </span>
  );
}

export function FeaturedBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('learningOverview.badges');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.15em] text-white ${className}`}
      style={{ backgroundColor: 'var(--color-primary)' }}
    >
      <Star className="w-3 h-3" />
      {t('featured')}
    </span>
  );
}

export function LockBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('learningOverview.badges');
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-black/70 text-white p-2 backdrop-blur-sm ${className}`}
    >
      <span className="sr-only">{t('locked')}</span>
      <Lock className="w-4 h-4" aria-hidden />
    </span>
  );
}

export function CompletedBadge({
  label,
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  const t = useTranslations('learningOverview.badges');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.15em] text-white ${className}`}
      style={{ backgroundColor: '#16a34a' }}
    >
      <Check className="w-3 h-3" />
      {label ?? t('completed')}
    </span>
  );
}

export function DurationChip({
  minutes,
  className = '',
}: {
  minutes: number | null | undefined;
  className?: string;
}) {
  if (!minutes || minutes <= 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-black/60 text-white px-1.5 py-0.5 text-[10px] md:text-xs font-semibold backdrop-blur-sm ${className}`}
    >
      <Clock className="w-3 h-3" />
      <DurationLabel minutes={minutes} />
    </span>
  );
}

/**
 * Bottom-overlay progress bar used on landscape thumbnails (continue watching,
 * course cards for enrolled items).
 */
export function ProgressBar({
  percent,
  className = '',
}: {
  percent: number;
  className?: string;
}) {
  const t = useTranslations('learningOverview.badges');
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (clamped === 0) return null;
  return (
    <div
      role="progressbar"
      aria-label={t('progress')}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`absolute left-0 right-0 bottom-0 h-1 bg-white/20 ${className}`}
    >
      <div
        className="h-full"
        style={{
          width: `${clamped}%`,
          backgroundColor: 'var(--color-accent)',
        }}
      />
    </div>
  );
}

/**
 * Inline progress pill — for list views where you can't overlay a bar.
 */
export function ProgressChip({
  percent,
  className = '',
}: {
  percent: number;
  className?: string;
}) {
  const format = useFormatter();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span
      className={`inline-flex items-center rounded-md bg-black/60 text-white px-1.5 py-0.5 text-[10px] md:text-xs font-semibold backdrop-blur-sm ${className}`}
    >
      {format.number(clamped / 100, { style: 'percent', maximumFractionDigits: 0 })}
    </span>
  );
}

/** Localized presentation only; duration arithmetic stays in minutes. */
export function DurationLabel({ minutes }: { minutes: number }) {
  const t = useTranslations('learningOverview.duration');
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return <>{hours > 0
    ? remaining > 0 ? t('hoursMinutes', { hours, minutes: remaining }) : t('hours', { hours })
    : t('minutes', { minutes: remaining })}</>;
}
