import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import overviewEn from '@/core/i18n/locales/en/adminOverview.json';
import overviewPt from '@/core/i18n/locales/pt/adminOverview.json';
import overviewEs from '@/core/i18n/locales/es/adminOverview.json';
import reportsEn from '@/core/i18n/locales/en/adminReports.json';
import reportsPt from '@/core/i18n/locales/pt/adminReports.json';
import reportsEs from '@/core/i18n/locales/es/adminReports.json';
import { AdminDashboard } from './AdminDashboard';
import { AdminReports } from './AdminReports';
import { ReportsPeriodSwitcher } from './ReportsPeriodSwitcher';
import { ScoringRulesEditor } from './ScoringRulesEditor';
import type { ReportsData } from '../reports-queries';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  saveRule: vi.fn(),
  danger: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../actions', () => ({ updateScoringRule: mocks.saveRule }));
vi.mock('@/shared/lib/toast', () => ({
  appToast: { danger: mocks.danger, success: mocks.success },
}));
vi.mock('@/core/i18n/routing', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}));

const catalogs = {
  en: { adminOverview: overviewEn, adminReports: reportsEn },
  pt: { adminOverview: overviewPt, adminReports: reportsPt },
  es: { adminOverview: overviewEs, adminReports: reportsEs },
};

function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={catalogs[locale]}
        now={new Date('2026-09-12T12:00:00Z')}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

function emailReportsData(providerDiagnostic: string): ReportsData {
  const recentBounces = [
    {
      email: 'known@example.test',
      eventType: 'hard_bounce',
      reason: providerDiagnostic,
      subject: 'Authored subject',
      occurredAt: '2026-09-12T10:00:00.000Z',
    },
    {
      email: 'legacy@example.test',
      eventType: 'legacy_provider_bounce',
      reason: providerDiagnostic,
      subject: 'Legacy authored subject',
      occurredAt: '2026-09-11T10:00:00.000Z',
    },
  ];

  return {
    period: {
      key: '30d',
      from: '2026-08-13T12:00:00.000Z',
      to: '2026-09-12T12:00:00.000Z',
      previousFrom: '2026-07-14T12:00:00.000Z',
      previousTo: '2026-08-13T12:00:00.000Z',
    },
    kpis: {
      totalStudents: 0,
      activeInPeriod: 0,
      activePreviousPeriod: 0,
      newEnrollmentsInPeriod: 0,
      newEnrollmentsPreviousPeriod: 0,
      avgRating: null,
      totalRatings: 0,
    },
    accesses: {
      today: 0,
      yesterday: 0,
      twoToSeven: 0,
      sevenToFourteen: 0,
      fourteenToThirty: 0,
      inactiveOrNever: 0,
      total: 0,
    },
    courses: [],
    expiringSoon: [],
    recentEnrollments: [],
    topStudents: [],
    lessonDive: { mostWatched: [], lowestCompletion: [] },
    chatUsage: {
      conversations: 0,
      userMessages: 0,
      assistantMessages: 0,
      uniqueUsers: 0,
      avgMessagesPerConversation: null,
      topCourses: [],
    },
    liveClassAttendance: { totalSessions: 0, upcoming: [], past: [] },
    pointsLeaderboard: { rules: [], students: [] },
    certificates: {
      totalInPeriod: 0,
      totalAllTime: 0,
      byCourse: [],
      recent: [],
    },
    quizzes: { totalAttemptsInPeriod: 0, totalQuizzes: 0, perQuiz: [] },
    usersLifecycle: { totalStudents: 0, segments: [] },
    emails: {
      configured: true,
      totalSentInPeriod: 0,
      totalBouncedInPeriod: 2,
      totalBlockedInPeriod: 0,
      bounceRatePercent: 100,
      byEventType: [],
      recentBounces,
      recentActivity: [],
      invalidEmails: [],
    },
  };
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe.each(['en', 'pt', 'es'] as const)('admin overview and report controls in %s', (locale) => {
  const overview = catalogs[locale].adminOverview;
  const reports = catalogs[locale].adminReports;
  const options = { wrapper: wrapper(locale) };

  it('localizes the overview while preserving authored names', () => {
    render(
      <AdminDashboard
        initialKpis={{
          totalCourses: 2,
          publishedCourses: 1,
          totalStudents: 12,
          newEnrollmentsThisWeek: 3,
          totalLessons: 4,
          activeWebhooks: 1,
        }}
        initialEnrollments={[{
          id: 'enrollment',
          userId: 'student',
          userEmail: 'student@example.test',
          userDisplayName: 'Authored English student',
          accessLevelName: 'Authored Gold access',
          source: 'manual',
          enrolledAt: '2026-09-10T15:00:00Z',
          isActive: true,
        }]}
      />,
      options,
    );

    expect(screen.getByRole('heading', { name: overview.dashboard })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Authored English student' })).toBeInTheDocument();
    expect(screen.getByText('Authored Gold access')).toBeInTheDocument();
    expect(screen.getByText(overview.sources.manual)).toBeInTheDocument();
    expect(screen.getByText(overview.active)).toBeInTheDocument();
  });

  it('validates civil custom dates before changing the report URL', () => {
    render(
      <ReportsPeriodSwitcher
        current={{
          key: '30d',
          from: '2026-08-13T12:00:00Z',
          to: '2026-09-12T12:00:00Z',
          previousFrom: '2026-07-14T12:00:00Z',
          previousTo: '2026-08-13T12:00:00Z',
        }}
      />,
      options,
    );

    fireEvent.click(screen.getByRole('button', { name: reports.custom }));
    fireEvent.change(screen.getByLabelText(reports.from), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText(reports.to), { target: { value: '2026-09-10' } });
    expect(screen.getByRole('alert')).toHaveTextContent(reports.invalidRange);
    expect(screen.getByRole('button', { name: reports.applyRange })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(reports.to), { target: { value: '2026-09-11' } });
    fireEvent.click(screen.getByRole('button', { name: reports.applyRange }));
    expect(mocks.push).toHaveBeenCalledWith(
      '/admin/reports?period=custom&from=2026-09-10&to=2026-09-11',
    );
  });

  it('uses localized validation and hides mutation diagnostics', async () => {
    mocks.saveRule.mockResolvedValue({ error: 'PRIVATE database diagnostic' });
    render(
      <ScoringRulesEditor
        rules={[{ trigger: 'lesson_completed', points: 10 }]}
      />,
      options,
    );

    fireEvent.click(screen.getByRole('button', {
      name: reports.editRule.replace('{rule}', reports.lessonCompleted),
    }));
    const input = screen.getByRole('spinbutton', {
      name: reports.pointsLabel.replace('{rule}', reports.lessonCompleted),
    });
    fireEvent.change(input, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: reports.save }));
    expect(mocks.saveRule).not.toHaveBeenCalled();
    expect(mocks.danger).toHaveBeenLastCalledWith(reports.invalidPoints);

    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: reports.save }));
    await waitFor(() => expect(mocks.danger).toHaveBeenLastCalledWith(reports.scoringFailed));
    expect(mocks.danger).not.toHaveBeenCalledWith('PRIVATE database diagnostic');
  });

  it('localizes delivery summaries and hides provider diagnostics', () => {
    const providerDiagnostic = 'PRIVATE provider mailbox diagnostic';
    render(
      <AdminReports
        data={emailReportsData(providerDiagnostic)}
        compare={false}
        activeTab="emails"
      />,
      options,
    );

    expect(
      screen.getByRole('columnheader', { name: reports.deliverySummary }),
    ).toBeVisible();
    expect(
      screen.getByText(reports.emailDeliverySummaries.hard_bounce),
    ).toBeVisible();
    expect(
      screen.getByText(reports.emailDeliverySummaries.unknown),
    ).toBeVisible();
    expect(screen.queryByText(providerDiagnostic)).not.toBeInTheDocument();
    expect(screen.getByText('Authored subject')).toBeVisible();
    expect(screen.getByText('known@example.test')).toBeVisible();
  });
});
