import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ResolvedPeriod } from './reports-queries';

/** Locale-aware presentation for report data. Query boundaries remain UTC. */
export function useReportPresentation() {
  const format = useFormatter();
  const now = useNow();
  const t = useTranslations('adminReports');

  const number = (value: number) => format.number(value);
  const decimal = (value: number) =>
    format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const percent = (value: number) =>
    format.number(value / 100, { style: 'percent', maximumFractionDigits: 1 });
  const absoluteDate = (iso: string) =>
    format.dateTime(new Date(iso), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const relativeTime = (iso: string) => format.relativeTime(new Date(iso), now);
  const periodName = (period: ResolvedPeriod) => {
    if (period.key === '30d') return t('last30Days');
    if (period.key === '90d') return t('last90Days');
    if (period.key === 'month') return t('thisMonth');
    if (period.key === 'last_month') return t('lastMonth');
    return t('customRange', {
      from: absoluteDate(period.from),
      to: absoluteDate(period.to),
    });
  };

  return { absoluteDate, decimal, number, percent, periodName, relativeTime };
}
