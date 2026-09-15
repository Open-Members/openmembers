'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';


import {
  BookOpen,
  CheckCircle,
  Users,
  TrendingUp,
  FileText,
  Webhook,
  Plus,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from '@/core/i18n/routing';
import { AnimatedNumber } from '@/shared/motion/AnimatedNumber';
import { DURATION, EASE, STAGGER } from '@/shared/motion/constants';
import { useBrowserTimezone } from '@/shared/hooks/useBrowserTimezone';
import type { AdminKPIs, RecentEnrollment } from '../actions';
import { AdminPageHeader } from './AdminPageHeader';

const tableRowContainer = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.tight } },
};

const tableRowItem = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.short, ease: EASE.out },
  },
};

function KPICard({
  label,
  value,
  icon: Icon,
  accent = false,
  locale,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: boolean;
  locale: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={EASE.spring}
      className={`rounded-2xl border p-5 flex items-center gap-4 transition-shadow hover:shadow-md ${
        accent
          ? 'text-white border-transparent'
          : 'bg-[var(--color-card)] border-hairline'
      }`}
      style={accent ? { backgroundColor: 'var(--color-primary)' } : undefined}
    >
      <div
        className={`rounded-xl p-3 ${
          accent
            ? 'bg-[var(--color-card)]/15'
            : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p
          className={`font-display text-2xl md:text-3xl font-medium leading-none tabular-nums ${
            accent ? 'text-white' : 'text-[var(--color-foreground)]'
          }`}
        >
          <AnimatedNumber value={value} locale={locale} />
        </p>
        <p
          className={`text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.15em] mt-2 ${
            accent ? 'text-white/75' : 'text-[var(--color-muted-foreground)]'
          }`}
        >
          {label}
        </p>
      </div>
    </motion.div>
  );
}

export function AdminDashboard({
  initialKpis,
  initialEnrollments,
}: {
  initialKpis: AdminKPIs;
  initialEnrollments: RecentEnrollment[];
}) {
  const t = useTranslations('adminOverview');
  const format = useFormatter();
  const locale = useLocale();
  const browserTimezone = useBrowserTimezone();
  const kpis = initialKpis;
  const enrollments = initialEnrollments;

  return (
    <div className="max-w-6xl mx-auto w-full">
      <AdminPageHeader
        eyebrow={t('overview')}
        title={t('dashboard')}
        description={t('dashboardDescription')}
        actions={
          <>
            <Link
              href="/admin/content"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Plus className="w-4 h-4" /> {t('createCourse')} </Link>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-hairline text-[var(--color-foreground)] text-sm font-semibold hover:bg-[var(--color-muted)]"
            >
              <Users className="w-4 h-4" /> {t('students')} <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        <KPICard locale={locale} label={t('totalCourses')} value={kpis.totalCourses} icon={BookOpen} accent />
        <KPICard locale={locale} label={t('published')} value={kpis.publishedCourses} icon={CheckCircle} />
        <KPICard locale={locale} label={t('totalStudents')} value={kpis.totalStudents} icon={Users} />
        <KPICard locale={locale} label={t('enrollmentsThisWeek')} value={kpis.newEnrollmentsThisWeek} icon={TrendingUp} />
        <KPICard locale={locale} label={t('totalLessons')} value={kpis.totalLessons} icon={FileText} />
        <KPICard locale={locale} label={t('activeWebhooks')} value={kpis.activeWebhooks} icon={Webhook} />
      </div>

      {/* Recent enrollments */}
      <section className="rounded-2xl bg-[var(--color-card)] border border-hairline overflow-hidden">
        <div className="px-6 py-5 border-b border-hairline">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-1"> {t('activity')} </p>
          <h2 className="font-display text-xl md:text-2xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight"> {t('recentEnrollments')} </h2>
        </div>
        <div className="overflow-x-auto">
          {enrollments.length === 0 ? (
            <p className="px-6 py-12 text-sm text-[var(--color-muted-foreground)] text-center"> {t('noEnrollments')} </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-muted-foreground)]">
                  <th className="px-6 py-3 text-left">{t('student')}</th>
                  <th className="px-6 py-3 text-left">{t('accessLevel')}</th>
                  <th className="px-6 py-3 text-left">{t('source')}</th>
                  <th className="px-6 py-3 text-left">{t('status')}</th>
                  <th className="px-6 py-3 text-right">{t('date')}</th>
                </tr>
              </thead>
              <motion.tbody
                variants={tableRowContainer}
                initial="hidden"
                animate="show"
              >
                {enrollments.map((e) => (
                  <motion.tr
                    key={e.id}
                    variants={tableRowItem}
                    className="group border-b border-hairline last:border-0 hover:bg-[var(--color-muted)]/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <Link
                          href={`/admin/users/${e.userId}`}
                          className="font-semibold text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
                        >
                          {e.userDisplayName || t('unknownName')}
                        </Link>
                        <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                          {e.userEmail}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[var(--color-foreground)]">
                      {e.accessLevelName || t('unknownAccessLevel')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-[var(--color-muted)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        {t.has(`sources.${e.source}`) ? t(`sources.${e.source}`) : e.source}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          e.isActive
                            ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                            : 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                        }`}
                      >
                        {e.isActive ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-[var(--color-muted-foreground)] text-xs">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums">
                          {format.dateTime(new Date(e.enrolledAt), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            timeZone: browserTimezone ?? 'UTC',
                          })}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[var(--color-muted-foreground)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export function AdminDashboardLoadError() {
  const t = useTranslations('adminOverview');
  return (
    <section role="alert" className="max-w-xl mx-auto rounded-2xl border border-red-500/30 bg-[var(--color-card)] p-6">
      <p className="text-sm text-[var(--color-foreground)]">{t('loadFailed')}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
      >
        {t('retry')}
      </button>
    </section>
  );
}
