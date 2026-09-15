import { useTranslations } from 'next-intl';
import { useReportPresentation } from '../report-presentation';
import {
  BarChart3,
  Users,
  UserPlus,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarClock,
  BookOpen,
  ArrowRight,
  Activity,
  UserX,
  Hourglass,
  Clock,
  Trophy,
  Flame,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  Radio,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import type {
  ReportsData,
  ReportsKpis,
  AccessesBreakdown,
  CoursePerformance,
  ExpiringEnrollment,
  RecentEnrollment,
  ResolvedPeriod,
  TopStudent,
  LessonEngagement,
  LessonEngagementDive,
  ChatUsage,
  LiveClassAttendance,
  LiveClassAttendanceRow,
  PointsLeaderboard,
  CertificatesReport,
  QuizzesReport,
  UsersLifecycleReport,
  LifecycleSegment,
  EmailReport,
} from '../reports-queries';
import { Award, ClipboardCheck, Mail, ShieldAlert } from 'lucide-react';
import { ScoringRulesEditor } from './ScoringRulesEditor';
import { AdminPageHeader } from './AdminPageHeader';
import { ReportsPeriodSwitcher } from './ReportsPeriodSwitcher';
import {
  getEmailDeliverySummary,
  isKnownEmailEventType,
} from '../report-i18n';
import { AdminCsvDownloadButton } from './AdminCsvDownloadButton';

export const REPORTS_TABS = [
  'overview',
  'courses',
  'users',
  'certificates',
  'quizzes',
  'engagement',
  'emails',
] as const;
export type ReportsTab = (typeof REPORTS_TABS)[number];



type Props = {
  data: ReportsData;
  compare: boolean;
  activeTab: ReportsTab;
};

function ReportsTabNav({
  active,
  period,
  compare,
}: {
  active: ReportsTab;
  period: ResolvedPeriod;
  compare: boolean;
}) {
  const t = useTranslations('adminReports');
  const TAB_LABELS: Record<ReportsTab, string> = {
  overview: t('overview'),
  courses: t('courses'),
  users: t('users'),
  certificates: t('certificates'),
  quizzes: t('quizzes'),
  engagement: t('engagement'),
  emails: t('emails'),
};

  function href(tab: ReportsTab): string {
    const params = new URLSearchParams({ period: period.key, tab });
    if (period.key === 'custom') {
      params.set('from', period.from.slice(0, 10));
      params.set('to', period.to.slice(0, 10));
    }
    if (compare) params.set('compare', '1');
    return `/admin/reports?${params.toString()}`;
  }
  return (
    <div className="border-b border-[var(--color-border)] -mx-4 md:mx-0">
      <nav className="flex gap-1 overflow-x-auto px-4 md:px-0 no-scrollbar">
        {REPORTS_TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <Link
              key={tab}
              href={href(tab)}
              scroll={false}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                isActive
                  ? 'border-[var(--color-primary)] text-[var(--color-foreground)]'
                  : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              }`}
            >
              {TAB_LABELS[tab]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}


function CompareToggle({
  period,
  compare,
}: {
  period: ResolvedPeriod;
  compare: boolean;
}) {
  const t = useTranslations('adminReports');
  const params = new URLSearchParams({ period: period.key });
  if (period.key === 'custom') {
    params.set('from', period.from.slice(0, 10));
    params.set('to', period.to.slice(0, 10));
  }
  if (!compare) params.set('compare', '1');
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)] md:invisible md:select-none"> {t('compare')} </span>
      <Link
        href={`/admin/reports?${params.toString()}`}
        title={
          compare
            ? t('hideComparison')
            : t('showComparison')
        }
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
          compare
            ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
            : 'bg-[var(--color-card)] text-[var(--color-foreground)] border-[var(--color-border)] hover:bg-[var(--color-muted)]'
        }`}
      >
        <TrendingUp className="w-3.5 h-3.5" />
        {compare ? t('comparing') : t('compare')}
      </Link>
    </div>
  );
}

function ExportCsvButton({
  period,
  compare,
}: {
  period: ResolvedPeriod;
  compare: boolean;
}) {
  const t = useTranslations('adminReports');
  const params = new URLSearchParams({ period: period.key });
  if (period.key === 'custom') {
    params.set('from', period.from.slice(0, 10));
    params.set('to', period.to.slice(0, 10));
  }
  if (compare) params.set('compare', '1');
  const endpoint = `/api/admin/reports/export?${params.toString()}`;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)] md:invisible md:select-none"> {t('export')} </span>
      <AdminCsvDownloadButton
        endpoint={endpoint}
        fallbackFileName={`reports-${period.key}.csv`}
        label={t('exportCsv')}
        loadingLabel={t('download.loading')}
        title={t('downloadReport')}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition whitespace-nowrap"
        copy={{
          title: t('download.title'),
          unauthenticated: t('download.unauthenticated'),
          accessDenied: t('download.accessDenied'),
          rateLimited: t('download.rateLimited'),
          invalidResponse: t('download.invalidResponse'),
          failed: t('download.failed'),
        }}
      />
    </div>
  );
}

export function AdminReports({ data, compare, activeTab }: Props) {
  const t = useTranslations('adminReports');
  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full pb-16">
      <AdminPageHeader
        eyebrow={t('overview')}
        title={t('reports')}
        description={t('reportsDescription')}
        actions={
          <div className="flex flex-col md:flex-row items-start gap-3 flex-wrap">
            <ReportsPeriodSwitcher current={data.period} />
            <CompareToggle period={data.period} compare={compare} />
            <ExportCsvButton period={data.period} compare={compare} />
          </div>
        }
      />

      <ReportsTabNav active={activeTab} period={data.period} compare={compare} />

      <div className="flex flex-col gap-10 md:gap-12">
        {activeTab === 'overview' && (
          <>
            <KpiStrip kpis={data.kpis} period={data.period} compare={compare} />
            <AccessesSection breakdown={data.accesses} />
            <RecentActivitySection items={data.recentEnrollments} />
            <ExpiringSection items={data.expiringSoon} />
          </>
        )}

        {activeTab === 'courses' && (
          <>
            <CoursesSection courses={data.courses} />
            <LessonDiveSection dive={data.lessonDive} period={data.period} />
          </>
        )}

        {activeTab === 'users' && (
          <>
            <UsersLifecycleSection report={data.usersLifecycle} />
            <LeaderboardSection
              students={data.topStudents}
              period={data.period}
            />
            <PointsLeaderboardSection
              leaderboard={data.pointsLeaderboard}
              period={data.period}
            />
          </>
        )}

        {activeTab === 'certificates' && (
          <CertificatesSection
            report={data.certificates}
            period={data.period}
          />
        )}

        {activeTab === 'quizzes' && (
          <QuizzesSection report={data.quizzes} />
        )}

        {activeTab === 'engagement' && (
          <>
            <ChatUsageSection usage={data.chatUsage} period={data.period} />
            <LiveAttendanceSection
              attendance={data.liveClassAttendance}
              period={data.period}
            />
          </>
        )}

        {activeTab === 'emails' && <EmailsSection report={data.emails} />}
      </div>
    </div>
  );
}

export function AdminReportsLoadError() {
  const t = useTranslations('adminReports');
  return (
    <section role="alert" className="max-w-xl mx-auto rounded-2xl border border-red-500/30 bg-[var(--color-card)] p-6">
      <p className="text-sm text-[var(--color-foreground)]">{t('loadFailed')}</p>
      <Link
        href="/admin/reports"
        className="mt-4 inline-flex rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
      >
        {t('retry')}
      </Link>
    </section>
  );
}


/* ─── KPI strip ─────────────────────────────────────────────────── */

function KpiStrip({
  kpis,
  period,
  compare,
}: {
  kpis: ReportsKpis;
  period: ResolvedPeriod;
  compare: boolean;
}) {
  const t = useTranslations('adminReports');
  const { decimal, number, periodName } = useReportPresentation();
  const activeDelta = computeDelta(
    kpis.activeInPeriod,
    kpis.activePreviousPeriod,
  );
  const newEnrollDelta = computeDelta(
    kpis.newEnrollmentsInPeriod,
    kpis.newEnrollmentsPreviousPeriod,
  );
  const shortLabel = periodName(period);

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <KpiCard
        icon={Users}
        label={t('totalStudents')}
        value={number(kpis.totalStudents)}
      />
      <KpiCard
        icon={Activity}
        label={t('activePeriod', { period: shortLabel })}
        value={number(kpis.activeInPeriod)}
        delta={activeDelta}
        previous={
          compare ? number(kpis.activePreviousPeriod) : undefined
        }
      />
      <KpiCard
        icon={UserPlus}
        label={t('newEnrollmentsPeriod', { period: shortLabel })}
        value={number(kpis.newEnrollmentsInPeriod)}
        delta={newEnrollDelta}
        previous={
          compare
            ? number(kpis.newEnrollmentsPreviousPeriod)
            : undefined
        }
      />
      <KpiCard
        icon={Star}
        label={t('avgRating')}
        value={kpis.avgRating !== null ? decimal(kpis.avgRating) : '—'}
        sublabel={
          kpis.totalRatings > 0
            ? t('ratingsCount', { count: kpis.totalRatings })
            : t('noRatings')
        }
      />
    </section>
  );
}

function computeDelta(current: number, previous: number): {
  pct: number;
  direction: 'up' | 'down' | 'flat';
} | null {
  if (previous === 0) return current === 0 ? { pct: 0, direction: 'flat' } : null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return { pct: 0, direction: 'flat' };
  return { pct: Math.round(pct), direction: pct > 0 ? 'up' : 'down' };
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  delta,
  previous,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  sublabel?: string;
  delta?: { pct: number; direction: 'up' | 'down' | 'flat' } | null;
  /** When set, the card shows a second line "prev: X" below the value. */
  previous?: string;
}) {
  const t = useTranslations('adminReports');
  const { percent } = useReportPresentation();
  const DeltaIcon =
    delta?.direction === 'up'
      ? TrendingUp
      : delta?.direction === 'down'
        ? TrendingDown
        : Minus;
  const deltaColor =
    delta?.direction === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : delta?.direction === 'down'
        ? 'text-red-500'
        : 'text-[var(--color-muted-foreground)]';

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4 md:px-5 md:py-5">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{
          backgroundColor:
            'color-mix(in oklab, var(--color-primary) 12%, transparent)',
          color: 'var(--color-primary)',
        }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl md:text-3xl font-bold text-[var(--color-foreground)] tabular-nums leading-tight">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${deltaColor}`}>
            <DeltaIcon className="w-3 h-3" />
            {delta.direction === 'flat' ? t('steady') : percent(Math.abs(delta.pct))}
          </span>
        )}
      </div>
      {previous !== undefined && (
        <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1 tabular-nums">
          {t('previousValue', { value: previous })}
        </p>
      )}
      {sublabel && (
        <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">
          {sublabel}
        </p>
      )}
    </div>
  );
}

/* ─── Accesses breakdown ─────────────────────────────────────────── */

function AccessesSection({ breakdown }: { breakdown: AccessesBreakdown }) {
  const t = useTranslations('adminReports');
  const { number, percent } = useReportPresentation();
  const segments = [
    { key: 'today', label: t('today'), value: breakdown.today, color: '#22c55e' },
    { key: 'yesterday', label: t('yesterday'), value: breakdown.yesterday, color: '#4ade80' },
    { key: '2-7', label: t('days2to7'), value: breakdown.twoToSeven, color: '#60a5fa' },
    { key: '7-14', label: t('days7to14'), value: breakdown.sevenToFourteen, color: '#a78bfa' },
    { key: '14-30', label: t('days14to30'), value: breakdown.fourteenToThirty, color: '#f59e0b' },
    { key: '30+', label: t('days30OrNever'), value: breakdown.inactiveOrNever, color: '#64748b' },
  ];
  const total = breakdown.total || 1;

  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('studentActivity')} </h2>
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto"> {t('byLastLogin')} </span>
      </header>

      {/* Stacked bar */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <div className="flex h-8 rounded-lg overflow-hidden">
          {segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.key}
                title={t('metricShare', {
                  label: s.label,
                  value: number(s.value),
                  percent: percent((s.value / total) * 100),
                })}
                style={{
                  width: `${(s.value / total) * 100}%`,
                  backgroundColor: s.color,
                }}
                className="transition-all hover:opacity-80"
              />
            ) : null,
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          {segments.map((s) => (
            <div key={s.key} className="flex items-start gap-2">
              <span
                className="w-3 h-3 rounded-full mt-0.5 shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <div className="min-w-0">
                <p className="font-semibold text-[var(--color-foreground)] tabular-nums">
                  {s.value}
                </p>
                <p className="text-[var(--color-muted-foreground)] truncate">
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shortcut cards */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <ShortcutCard
          icon={<UserX className="w-4 h-4" />}
          label={t('neverAccessed')}
          value={breakdown.inactiveOrNever}
          href="/admin/users?inactive=never"
          tone="slate"
        />
        <ShortcutCard
          icon={<Hourglass className="w-4 h-4" />}
          label={t('inactive7Days')}
          value={
            breakdown.sevenToFourteen +
            breakdown.fourteenToThirty +
            breakdown.inactiveOrNever
          }
          href="/admin/users?inactive=inactive_7"
          tone="amber"
        />
        <ShortcutCard
          icon={<Clock className="w-4 h-4" />}
          label={t('inactive30Days')}
          value={breakdown.inactiveOrNever}
          href="/admin/users?inactive=inactive_30"
          tone="red"
        />
      </div>
    </section>
  );
}

function ShortcutCard({
  icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  tone: 'slate' | 'amber' | 'red';
}) {
  const { number } = useReportPresentation();
  const color = { slate: '#64748b', amber: '#f59e0b', red: '#ef4444' }[tone];
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4 flex items-center gap-4 hover:border-[var(--color-primary)]/40 transition-colors"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
          color,
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xl font-bold text-[var(--color-foreground)] tabular-nums leading-tight">
          {number(value)}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] group-hover:translate-x-0.5 transition" />
    </Link>
  );
}

/* ─── Courses performance ───────────────────────────────────────── */

function CoursesSection({ courses }: { courses: CoursePerformance[] }) {
  const t = useTranslations('adminReports');
  const { decimal, percent } = useReportPresentation();
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('coursePerformance')} </h2>
      </header>

      {courses.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)] italic"> {t('noPublishedCourses')} </p>
      ) : (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('course')}</th>
                  <th
                    className="px-4 py-3 text-left"
                    title={t('studentsWithAccessHelp')}
                  > {t('students')} </th>
                  <th className="px-4 py-3 text-left">{t('avgProgress')}</th>
                  <th className="px-4 py-3 text-left">{t('avgRating')}</th>
                  <th className="px-4 py-3 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const engagement =
                    c.totalAccess > 0
                      ? Math.round((c.withProgress / c.totalAccess) * 100)
                      : 0;
                  return (
                    <tr
                      key={c.courseId}
                      className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-muted)]/30"
                    >
                      <td className="px-4 py-3 font-semibold text-[var(--color-foreground)]">
                        {c.title}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-[var(--color-foreground)] tabular-nums">
                            {c.withProgress}
                          </span>
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            / {c.totalAccess}
                          </span>
                          {c.totalAccess > 0 && (
                            <span
                              className="text-[11px] tabular-nums"
                              style={{
                                color:
                                  engagement >= 50
                                    ? '#22c55e'
                                    : 'var(--color-muted-foreground)',
                              }}
                            >
                              ({percent(engagement)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.avgProgressPercent !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 rounded-full bg-[var(--color-muted)] overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{
                                  width: `${c.avgProgressPercent}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-[var(--color-foreground)]">
                              {percent(c.avgProgressPercent)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.avgRating !== null ? (
                          <div className="flex items-center gap-1.5">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span className="font-semibold text-[var(--color-foreground)] tabular-nums">
                              {decimal(c.avgRating)}
                            </span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              ({c.totalRatings})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/content/${c.slug}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80"
                        > {t('open')} <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Expiring soon ─────────────────────────────────────────────── */

function ExpiringSection({ items }: { items: ExpiringEnrollment[] }) {
  const t = useTranslations('adminReports');
  const { absoluteDate } = useReportPresentation();
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <CalendarClock className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('expiringSoon')} </h2>
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto"> {t('next30Days')} </span>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]"> {t('noExpiringEnrollments')} </p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
          {items.map((e) => (
            <li
              key={e.enrollmentId}
              className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                  {e.userName ?? t('unknownName')}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                  {e.userEmail} · {e.accessLevelName ?? t('unknownAccessLevel')}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs shrink-0">
                <div className="text-right">
                  <p className="font-semibold text-[var(--color-foreground)] tabular-nums">
                    {absoluteDate(e.expiresAt)}
                  </p>
                  <p
                    className={
                      e.daysUntilExpiry <= 7
                        ? 'text-red-500 font-semibold'
                        : 'text-[var(--color-muted-foreground)]'
                    }
                  >
                    {e.daysUntilExpiry === 0
                      ? t('todayShort')
                      : t('expiresInDays', { count: e.daysUntilExpiry })}
                  </p>
                </div>
                <Link
                  href={`/admin/users?q=${encodeURIComponent(e.userEmail || e.userName || '')}`}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
                > {t('viewUser')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── Top students leaderboard ─────────────────────────────────── */

function LeaderboardSection({
  students,
  period,
}: {
  students: TopStudent[];
  period: ResolvedPeriod;
}) {
  const t = useTranslations('adminReports');
  const { periodName } = useReportPresentation();
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('topStudents')} </h2>
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">
          {periodName(period)} {t('byLessonsCompleted')} </span>
      </header>

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]"> {t('noCompletedLessons')} </p>
        </div>
      ) : (
        <ol className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
          {students.map((s, idx) => (
            <li
              key={s.userId}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-muted)]/30 transition-colors"
            >
              <RankBadge rank={idx + 1} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                  {s.userName ?? t('unknownName')}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                  {s.userEmail}
                </p>
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">{t('lessonCount', { count: s.lessonsCompleted })}</div>
              <span className="text-xs text-[var(--color-muted-foreground)] shrink-0">
                · {t('courseCount', { count: s.coursesTouched })}
              </span>
              <Link
                href={`/admin/users?q=${encodeURIComponent(s.userEmail || s.userName || '')}`}
                className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
                aria-label={t('viewStudent')}
              >
                <ArrowRight className="w-4 h-4" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colour =
    rank === 1
      ? '#f59e0b'
      : rank === 2
        ? '#94a3b8'
        : rank === 3
          ? '#cd7f32'
          : 'var(--color-muted-foreground)';
  const bg =
    rank <= 3
      ? `color-mix(in oklab, ${colour} 18%, transparent)`
      : 'var(--color-muted)';
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 tabular-nums"
      style={{ backgroundColor: bg, color: rank <= 3 ? colour : undefined }}
    >
      {rank}
    </span>
  );
}

/* ─── Points leaderboard (configurable scoring) ────────────────── */

function PointsLeaderboardSection({
  leaderboard,
  period,
}: {
  leaderboard: PointsLeaderboard;
  period: ResolvedPeriod;
}) {
  const t = useTranslations('adminReports');
  const { number, periodName } = useReportPresentation();
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('pointsLeaderboard')} </h2>
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">
          {periodName(period)} {t('weightedByRules')} </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ranking — 2/3 of the row */}
        <div className="lg:col-span-2">
          {leaderboard.students.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]"> {t('noScoringEvents')} </p>
            </div>
          ) : (
            <ol className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
              {leaderboard.students.map((s, idx) => (
                <li
                  key={s.userId}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <RankBadge rank={idx + 1} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                      {s.userName ?? t('unknownName')}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted-foreground)] truncate">
                      {s.userEmail}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted-foreground)] truncate mt-0.5 tabular-nums">
                      {[
                        s.breakdown.lesson_completed > 0 &&
                          t('lessonCount', { count: s.breakdown.lesson_completed }),
                        s.breakdown.rating_given > 0 &&
                          t('ratingsCount', { count: s.breakdown.rating_given }),
                        s.breakdown.enrollment_new > 0 &&
                          t('enrollmentCount', { count: s.breakdown.enrollment_new }),
                        s.breakdown.chat_message > 0 &&
                          t('messageCount', { count: s.breakdown.chat_message }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-1 shrink-0">
                    <span className="text-lg font-bold text-[var(--color-foreground)] tabular-nums">
                      {number(s.totalPoints)}
                    </span>
                    <span className="text-xs text-[var(--color-muted-foreground)]"> {t('pointsUnit')} </span>
                  </div>
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(s.userEmail || s.userName || '')}`}
                    className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
                    aria-label={t('viewStudent')}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
        {/* Rules editor — 1/3 */}
        <div className="lg:col-span-1">
          <ScoringRulesEditor rules={leaderboard.rules} />
        </div>
      </div>
    </section>
  );
}

/* ─── Lesson engagement dive ───────────────────────────────────── */

function LessonDiveSection({
  dive,
  period,
}: {
  dive: LessonEngagementDive;
  period: ResolvedPeriod;
}) {
  const t = useTranslations('adminReports');
  const { periodName } = useReportPresentation();
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('lessonEngagement')} </h2>
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">
          {periodName(period)}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LessonList
          icon={<Flame className="w-4 h-4" />}
          title={t('mostWatched')}
          subtitle={t('topDistinctViewers')}
          lessons={dive.mostWatched}
          rankMode="position"
          emptyText={t('noWatchedLessons')}
        />
        <LessonList
          icon={<AlertTriangle className="w-4 h-4" />}
          title={t('lowestCompletion')}
          subtitle={t('abandonedLessons')}
          lessons={dive.lowestCompletion}
          rankMode="rate"
          emptyText={t('notEnoughEngagement')}
          danger
        />
      </div>
    </section>
  );
}

function LessonList({
  icon,
  title,
  subtitle,
  lessons,
  rankMode,
  emptyText,
  danger = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  lessons: LessonEngagement[];
  rankMode: 'position' | 'rate';
  emptyText: string;
  danger?: boolean;
}) {
  const t = useTranslations('adminReports');
  const { decimal, percent } = useReportPresentation();
  const accent = danger ? '#ef4444' : 'var(--color-primary)';
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-foreground)]">
            {title}
          </p>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {subtitle}
          </p>
        </div>
      </header>

      {lessons.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-[var(--color-muted-foreground)] italic">
            {emptyText}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {lessons.map((l, idx) => (
            <li key={l.lessonId} className="px-4 py-3 flex items-center gap-3">
              <span
                className="text-sm font-bold tabular-nums shrink-0 w-5 text-center"
                style={{ color: accent }}
              >
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                  {l.title}
                </p>
                <p className="text-[11px] text-[var(--color-muted-foreground)] truncate">
                  {l.courseTitle ?? t('unknownCourse')}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs shrink-0">
                {rankMode === 'position' ? (
                  <div className="text-right">
                    <p className="font-bold text-[var(--color-foreground)] tabular-nums">
                      {l.started}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted-foreground)] uppercase"> {t('viewers')} </p>
                  </div>
                ) : (
                  <div className="text-right">
                    <p className="font-bold tabular-nums" style={{ color: accent }}>
                      {percent(l.completionRate ?? 0)}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted-foreground)] tabular-nums">
                      {l.completed}/{l.started}
                    </p>
                  </div>
                )}
                {l.avgRating !== null && (
                  <div className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {decimal(l.avgRating)}
                  </div>
                )}
                {l.courseSlug && l.lessonSlug && (
                  <Link
                    href={`/courses/${l.courseSlug}/${l.lessonSlug}`}
                    className="p-1 rounded-md text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
                    aria-label={t('openLesson')}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Ask the Course chat usage ────────────────────────────────── */

function ChatUsageSection({
  usage,
  period,
}: {
  usage: ChatUsage;
  period: ResolvedPeriod;
}) {
  const t = useTranslations('adminReports');
  const { decimal, number, periodName } = useReportPresentation();
  const noData = usage.conversations === 0;
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('chatUsage')} </h2>
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">
          {periodName(period)}
        </span>
      </header>

      {noData ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]"> {t('noChatActivity')} </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left — headline stats */}
          <div className="lg:col-span-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 flex flex-col gap-4">
            <Stat
              icon={<MessageSquare className="w-4 h-4" />}
              label={t('conversations')}
              value={number(usage.conversations)}
            />
            <Stat
              icon={<Users className="w-4 h-4" />}
              label={t('activeUsers')}
              value={number(usage.uniqueUsers)}
            />
            <Stat
              icon={<Activity className="w-4 h-4" />}
              label={t('userMessages')}
              value={number(usage.userMessages)}
              sublabel={t('answeredCount', { count: usage.assistantMessages })}
            />
            <Stat
              icon={<Sparkles className="w-4 h-4" />}
              label={t('avgMessages')}
              value={
                usage.avgMessagesPerConversation !== null
                  ? decimal(usage.avgMessagesPerConversation)
                  : '—'
              }
            />
          </div>

          {/* Right — top courses */}
          <div className="lg:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
            <header className="px-4 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-bold text-[var(--color-foreground)]"> {t('mostAskedCourses')} </p>
              <p className="text-[11px] text-[var(--color-muted-foreground)]"> {t('mostAskedDescription')} </p>
            </header>
            {usage.topCourses.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-[var(--color-muted-foreground)] italic"> {t('noCourseBreakdown')} </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {usage.topCourses.map((c, idx) => (
                  <li
                    key={c.courseId}
                    className="px-4 py-3 flex items-center gap-3"
                  >
                    <span className="text-sm font-bold text-[var(--color-primary)] tabular-nums shrink-0 w-5 text-center">
                      {idx + 1}
                    </span>
                    <p className="flex-1 min-w-0 text-sm font-semibold text-[var(--color-foreground)] truncate">
                      {c.courseTitle ?? t('unknownCourse')}
                    </p>
                    <div className="text-sm font-semibold tabular-nums shrink-0">{t('conversationCount', { count: c.conversations })}</div>
                    <span className="text-xs text-[var(--color-muted-foreground)] shrink-0">
                      · {t('userCount', { count: c.uniqueUsers })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          backgroundColor:
            'color-mix(in oklab, var(--color-primary) 12%, transparent)',
          color: 'var(--color-primary)',
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-[var(--color-foreground)] tabular-nums leading-tight">
          {value}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
        {sublabel && (
          <p className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5">
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Live class attendance ────────────────────────────────────── */

function LiveAttendanceSection({
  attendance,
  period,
}: {
  attendance: LiveClassAttendance;
  period: ResolvedPeriod;
}) {
  const t = useTranslations('adminReports');
  const { periodName } = useReportPresentation();
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <Radio className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('liveAttendance')} </h2>
        <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">
          {periodName(period)} {t('trackedViaClicks')} </span>
      </header>

      {attendance.totalSessions === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]"> {t('noLiveClasses')} </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AttendanceTable
            title={t('pastSessions')}
            subtitle={t('historicalTurnout')}
            rows={attendance.past}
            emptyText={t('noEndedSessions')}
            historical
          />
          <AttendanceTable
            title={t('upcoming')}
            subtitle={t('scheduledPreclicks')}
            rows={attendance.upcoming}
            emptyText={t('nothingScheduled')}
          />
        </div>
      )}
    </section>
  );
}

function AttendanceTable({
  title,
  subtitle,
  rows,
  emptyText,
  historical = false,
}: {
  title: string;
  subtitle: string;
  rows: LiveClassAttendanceRow[];
  emptyText: string;
  historical?: boolean;
}) {
  const t = useTranslations('adminReports');
  const { absoluteDate } = useReportPresentation();
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <header className="px-4 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-bold text-[var(--color-foreground)]">
          {title}
        </p>
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          {subtitle}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-[var(--color-muted-foreground)] italic">
            {emptyText}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <li key={r.liveClassId} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                    {r.title}
                  </p>
                  {r.isLive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {t('live')} </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-muted-foreground)] truncate">
                  {absoluteDate(r.startsAt)} ·{' '}
                  {r.courseTitles.slice(0, 2).join(', ') || t('noCourseLinked')}
                  {r.courseTitles.length > 2
                    ? ` + ${r.courseTitles.length - 2}`
                    : ''}
                </p>
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {historical ? t('attendeeCount', { count: r.clickedUsers }) : t('clickCount', { count: r.clickedUsers })}
                </span>
              </div>
              {r.totalClicks > r.clickedUsers && (
                <span className="text-[10px] text-[var(--color-muted-foreground)] shrink-0 tabular-nums">
                  ({t('totalCount', { count: r.totalClicks })})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Recent enrollments ────────────────────────────────────────── */

function RecentActivitySection({ items }: { items: RecentEnrollment[] }) {
  const t = useTranslations('adminReports');
  const { relativeTime } = useReportPresentation();
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-xl md:text-2xl font-bold font-display text-[var(--color-foreground)]"> {t('recentEnrollments')} </h2>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)] italic"> {t('noEnrollments')} </p>
      ) : (
        <ul className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
          {items.map((e) => (
            <li key={e.enrollmentId} className="px-4 py-2.5 flex items-center gap-3">
              <UserPlus className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <p className="text-sm text-[var(--color-foreground)] flex-1 min-w-0 truncate">
                <span className="font-semibold">{e.userName ?? t('unknownName')}</span>{' '}
                <span className="text-[var(--color-muted-foreground)]">{t('enrolledIn', { level: e.accessLevelName ?? t('unknownAccessLevel') })}</span>
              </p>
              <span className="text-xs text-[var(--color-muted-foreground)] shrink-0 tabular-nums">
                {relativeTime(e.enrolledAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── Certificates ─────────────────────────────────────────────── */

function CertificatesSection({
  report,
}: {
  report: CertificatesReport;
  period: ResolvedPeriod;
}) {
  const t = useTranslations('adminReports');
  const { absoluteDate } = useReportPresentation();
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2">
          <Award className="w-5 h-5 text-[var(--color-primary)]" /> {t('certificates')} </h2>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1"> {t('certificatesDescription')} </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"> {t('inThisPeriod')} </p>
          <p className="text-3xl font-bold text-[var(--color-foreground)] mt-1">
            {report.totalInPeriod}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"> {t('allTime')} </p>
          <p className="text-3xl font-bold text-[var(--color-foreground)] mt-1">
            {report.totalAllTime}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-bold">{t('byCourse')}</h3>
          <span className="text-[11px] text-[var(--color-muted-foreground)]"> {t('allTimeTotals')} </span>
        </header>
        {report.byCourse.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)] text-center"> {t('noCertificates')} </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {report.byCourse.map((c) => (
              <li
                key={c.courseId}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="text-[var(--color-foreground)] truncate">
                  {c.courseTitle ?? t('unknownCourse')}
                </span>
                <span className="font-semibold tabular-nums">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-bold">{t('recentIssuances')}</h3>
        </header>
        {report.recent.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)] text-center"> {t('nothingYet')} </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('student')}</th>
                  <th className="px-4 py-3 text-left">{t('course')}</th>
                  <th className="px-4 py-3 text-left">{t('code')}</th>
                  <th className="px-4 py-3 text-right">{t('issued')}</th>
                </tr>
              </thead>
              <tbody>
                {report.recent.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-[var(--color-foreground)]">
                          {row.studentName ?? t('unknownName')}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {row.studentEmail}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-foreground)]">
                      {row.courseTitle ?? t('unknownCourse')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted-foreground)]">
                      {row.verificationCode}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-muted-foreground)]">
                      {absoluteDate(row.issuedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Quizzes ──────────────────────────────────────────────────── */

function QuizzesSection({ report }: { report: QuizzesReport }) {
  const t = useTranslations('adminReports');
  const { percent, relativeTime } = useReportPresentation();
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-[var(--color-primary)]" /> {t('quizzes')} </h2>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1"> {t('quizzesDescription')} </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"> {t('attemptsInPeriod')} </p>
          <p className="text-3xl font-bold text-[var(--color-foreground)] mt-1">
            {report.totalAttemptsInPeriod}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"> {t('quizzesPublished')} </p>
          <p className="text-3xl font-bold text-[var(--color-foreground)] mt-1">
            {report.totalQuizzes}
          </p>
        </div>
      </div>

      {report.perQuiz.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]"> {t('noQuizzes')} </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('quiz')}</th>
                  <th className="px-4 py-3 text-right">{t('attempts')}</th>
                  <th className="px-4 py-3 text-right">{t('students')}</th>
                  <th className="px-4 py-3 text-right">{t('passRate')}</th>
                  <th className="px-4 py-3 text-right">{t('avgScore')}</th>
                  <th className="px-4 py-3 text-right">{t('threshold')}</th>
                  <th className="px-4 py-3 text-right">{t('lastAttempt')}</th>
                </tr>
              </thead>
              <tbody>
                {report.perQuiz.map((q) => (
                  <tr
                    key={q.quizId}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-foreground)]">
                        {q.lessonTitle ?? t('unknownLesson')}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {q.courseTitle ?? t('unknownCourse')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {q.attempts}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {q.uniqueStudents}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {q.attempts > 0 ? (
                        <span
                          className={`tabular-nums font-semibold ${
                            q.passRatePercent >= 70
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : q.passRatePercent >= 40
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {percent(q.passRatePercent)}
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {q.avgScorePercent !== null
                        ? percent(q.avgScorePercent)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-muted-foreground)] tabular-nums">
                      {percent(q.passThresholdPercent)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-muted-foreground)]">
                      {q.lastAttemptAt
                        ? relativeTime(q.lastAttemptAt)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Users lifecycle ──────────────────────────────────────────── */



const SEGMENT_TONES: Record<LifecycleSegment, string> = {
  new: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  engaged: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  inactive: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  dormant: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  never: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
};

function UsersLifecycleSection({ report }: { report: UsersLifecycleReport }) {
  const t = useTranslations('adminReports');
  const { percent } = useReportPresentation();
  const SEGMENT_LABELS: Record<LifecycleSegment, { title: string; help: string }> = {
  new: {
    title: t('new'),
    help: t('joinedLastWeek'),
  },
  active: {
    title: t('active'),
    help: t('loggedLastWeek'),
  },
  engaged: {
    title: t('engaged'),
    help: t('logged8to30'),
  },
  inactive: {
    title: t('inactive'),
    help: t('logged31to90'),
  },
  dormant: {
    title: t('dormant'),
    help: t('loggedOver90'),
  },
  never: {
    title: t('neverLogged'),
    help: t('accountNotAccessed'),
  },
};

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--color-primary)]" /> {t('lifecycleSegments')} </h2>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          {t('lifecycleTotal', { count: report.totalStudents })}
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {report.segments.map((s) => {
          const meta = SEGMENT_LABELS[s.segment];
          return (
            <div
              key={s.segment}
              className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 ${
                s.count === 0 ? 'opacity-50' : ''
              }`}
            >
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEGMENT_TONES[s.segment]}`}
              >
                {meta.title}
              </span>
              <p className="text-3xl font-bold text-[var(--color-foreground)] mt-2 tabular-nums">
                {s.count}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 tabular-nums">
                {t('percentageOfBase', { percent: percent(s.percent) })}
              </p>
              <p className="text-[11px] text-[var(--color-muted-foreground)] mt-2 leading-tight">
                {meta.help}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── Emails ───────────────────────────────────────────── */

function EmailsSection({ report }: { report: EmailReport }) {
  const t = useTranslations('adminReports');
  const { percent, relativeTime } = useReportPresentation();
  const deliverySummaryCopy = {
    hard_bounce: t('emailDeliverySummaries.hard_bounce'),
    soft_bounce: t('emailDeliverySummaries.soft_bounce'),
    blocked: t('emailDeliverySummaries.blocked'),
    invalid: t('emailDeliverySummaries.invalid'),
    spam: t('emailDeliverySummaries.spam'),
    complaint: t('emailDeliverySummaries.complaint'),
    unknown: t('emailDeliverySummaries.unknown'),
  };
  const eventLabel = (eventType: string) =>
    isKnownEmailEventType(eventType) && t.has(`emailEvents.${eventType}`)
      ? t(`emailEvents.${eventType}`)
      : eventType;
  if (!report.configured) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2">
            <Mail className="w-5 h-5 text-[var(--color-primary)]" /> {t('emailDeliverability')} </h2>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1"> {t('emailDescription')} </p>
        </header>
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <h3 className="text-sm font-bold text-[var(--color-foreground)]"> {t('resendNotConnected')} </h3>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-2"> {t('populateReport')} </p>
          <ol className="text-sm text-[var(--color-muted-foreground)] mt-2 list-decimal list-inside space-y-1">
            <li>
              {t('webhookStep', { url: 'https://example.org/api/webhooks/resend' })}{' '}
              <a href="https://resend.com/webhooks" target="_blank" rel="noopener noreferrer" className="underline">Resend → Webhooks</a>
            </li>
            <li>{t('subscribeEvents', { events: 'email.sent, email.delivered, email.bounced, email.complained' })}</li>
            <li>{t('signingSecretStep', { prefix: 'whsec_…', variable: 'RESEND_WEBHOOK_SECRET', file: '.env.production' })}</li>
            <li>{t('sendTestEmail')}</li>
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2">
          <Mail className="w-5 h-5 text-[var(--color-primary)]" /> {t('emailDeliverability')} </h2>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1"> {t('transactionalEvents')} </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <EmailKpi
          label={t('sent')}
          value={report.totalSentInPeriod}
          tone="muted"
        />
        <EmailKpi
          label={t('bounced')}
          value={report.totalBouncedInPeriod}
          tone={report.totalBouncedInPeriod > 0 ? 'amber' : 'muted'}
        />
        <EmailKpi
          label={t('blockedSpam')}
          value={report.totalBlockedInPeriod}
          tone={report.totalBlockedInPeriod > 0 ? 'red' : 'muted'}
        />
        <EmailKpi
          label={t('bounceRate')}
          value={percent(report.bounceRatePercent)}
          tone={
            report.bounceRatePercent >= 5
              ? 'red'
              : report.bounceRatePercent >= 2
                ? 'amber'
                : 'green'
          }
        />
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-bold">{t('recentActivity')}</h3>
          <span className="text-[11px] text-[var(--color-muted-foreground)]"> {t('allEventTypes')} </span>
        </header>
        {report.recentActivity.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)] text-center"> {t('noEmailEvents')} </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('recipient')}</th>
                  <th className="px-4 py-3 text-left">{t('event')}</th>
                  <th className="px-4 py-3 text-left">{t('subject')}</th>
                  <th className="px-4 py-3 text-left">{t('tag')}</th>
                  <th className="px-4 py-3 text-right">{t('when')}</th>
                </tr>
              </thead>
              <tbody>
                {report.recentActivity.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{row.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${eventBadgeClass(row.eventType)}`}
                      >
                        {eventLabel(row.eventType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] max-w-xs truncate">
                      {row.subject ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                      {row.tag ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-muted-foreground)]">
                      {relativeTime(row.occurredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-bold">{t('eventsInPeriod')}</h3>
          </header>
          {report.byEventType.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-muted-foreground)] text-center"> {t('noEvents')} </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {report.byEventType.map((e) => (
                <li
                  key={e.eventType}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-[var(--color-foreground)] font-mono text-xs">
                    {eventLabel(e.eventType)}
                  </span>
                  <span className="font-semibold tabular-nums">{e.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold">{t('invalidAddresses')}</h3>
            <span className="text-[11px] text-[var(--color-muted-foreground)] ml-auto">
              {report.invalidEmails.length}
            </span>
          </header>
          {report.invalidEmails.length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-muted-foreground)] text-center"> {t('noInvalidAddresses')} </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] max-h-72 overflow-y-auto">
              {report.invalidEmails.map((email) => (
                <li
                  key={email}
                  className="px-4 py-2 text-xs font-mono text-[var(--color-muted-foreground)]"
                >
                  {email}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-bold">{t('recentBounces')}</h3>
        </header>
        {report.recentBounces.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)] text-center"> {t('noBounces')} </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('email')}</th>
                  <th className="px-4 py-3 text-left">{t('event')}</th>
                  <th className="px-4 py-3 text-left">
                    {t('deliverySummary')}
                  </th>
                  <th className="px-4 py-3 text-left">{t('subject')}</th>
                  <th className="px-4 py-3 text-right">{t('when')}</th>
                </tr>
              </thead>
              <tbody>
                {report.recentBounces.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{row.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-red-500/15 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        {eventLabel(row.eventType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] max-w-xs truncate">
                      {getEmailDeliverySummary(
                        row.eventType,
                        deliverySummaryCopy,
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] max-w-xs truncate">
                      {row.subject ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-muted-foreground)]">
                      {relativeTime(row.occurredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function eventBadgeClass(eventType: string): string {
  if (eventType === 'delivered' || eventType === 'sent') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  }
  if (eventType === 'opened' || eventType === 'clicked') {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
  }
  if (eventType === 'soft_bounce' || eventType === 'delayed') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  if (
    eventType === 'hard_bounce' ||
    eventType === 'blocked' ||
    eventType === 'invalid' ||
    eventType === 'spam' ||
    eventType === 'complaint'
  ) {
    return 'bg-red-500/15 text-red-700 dark:text-red-300';
  }
  // unsubscribed, unknown — neutral
  return 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]';
}

function EmailKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'muted' | 'green' | 'amber' | 'red';
}) {
  const toneClasses = {
    muted: 'text-[var(--color-foreground)]',
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${toneClasses}`}>
        {value}
      </p>
    </div>
  );
}
