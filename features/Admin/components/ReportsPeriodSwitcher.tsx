'use client';

import { useTranslations } from 'next-intl';


import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, Check } from 'lucide-react';
import type {
  ResolvedPeriod,
  ReportsPeriodKey,
} from '../reports-queries';
import { useReportPresentation } from '../report-presentation';



type Props = {
  current: ResolvedPeriod;
};

function toYmd(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function ReportsPeriodSwitcher({ current }: Props) {
  const t = useTranslations('adminReports');
  const { periodName } = useReportPresentation();
  const PRESETS: ReadonlyArray<{ key: ReportsPeriodKey; label: string }> = [
  { key: '30d', label: t('last30Days') },
  { key: 'month', label: t('thisMonth') },
  { key: 'last_month', label: t('lastMonth') },
  { key: '90d', label: t('last90Days') },
];

  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(
    current.key === 'custom' ? toYmd(current.from) : '',
  );
  const [to, setTo] = useState(
    current.key === 'custom' ? toYmd(current.to) : '',
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const invalidRange = Boolean(from && to && from >= to);

  // Close panel on outside click.
  useEffect(() => {
    if (!customOpen) return;
    function onClick(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setCustomOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [customOpen]);

  function applyPreset(key: ReportsPeriodKey) {
    router.push(`/admin/reports?period=${key}`);
    setCustomOpen(false);
  }

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || invalidRange) return;
    const params = new URLSearchParams({ period: 'custom', from, to });
    router.push(`/admin/reports?${params.toString()}`);
    setCustomOpen(false);
  }

  return (
    <div className="flex flex-col items-start gap-1 relative">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]"> {t('period')} </span>
      <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-1 gap-0.5 flex-wrap">
        {PRESETS.map((opt) => {
          const active = opt.key === current.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => applyPreset(opt.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            current.key === 'custom'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
          }`}
        >
          <CalendarRange className="w-3.5 h-3.5" />
          {current.key === 'custom' ? periodName(current) : t('custom')}
        </button>
      </div>

      {customOpen && (
        <div
          ref={panelRef}
          className="absolute top-full right-0 md:right-auto mt-2 z-20 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-4 w-72"
        >
          <form onSubmit={applyCustom} className="flex flex-col gap-3" noValidate>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"> {t('from')} </span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                max={to || undefined}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                required
                aria-describedby={invalidRange ? errorId : undefined}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"> {t('to')} </span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from || undefined}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                required
                aria-describedby={invalidRange ? errorId : undefined}
              />
            </label>
            {invalidRange && (
              <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
                {t('invalidRange')}
              </p>
            )}
            <button
              type="submit"
              disabled={!from || !to || invalidRange}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Check className="w-4 h-4" /> {t('applyRange')} </button>
          </form>
        </div>
      )}
    </div>
  );
}
