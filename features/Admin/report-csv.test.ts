import { describe, expect, it } from 'vitest';
import en from '@/core/i18n/locales/en/adminReports.json';
import es from '@/core/i18n/locales/es/adminReports.json';
import pt from '@/core/i18n/locales/pt/adminReports.json';
import type { ReportsData } from './reports-queries';
import { buildReportCsv } from './report-csv';

const catalogs = { en, pt, es };

const fixture: ReportsData = {
  period: {
    key: 'custom',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-03T00:00:00.000Z',
    previousFrom: '2026-08-30T00:00:00.000Z',
    previousTo: '2026-09-01T00:00:00.000Z',
  },
  kpis: {
    totalStudents: 12,
    activeInPeriod: 7,
    activePreviousPeriod: 6,
    newEnrollmentsInPeriod: 3,
    newEnrollmentsPreviousPeriod: 2,
    avgRating: 4.5,
    totalRatings: 8,
  },
  accesses: {
    today: 1,
    yesterday: 2,
    twoToSeven: 3,
    sevenToFourteen: 4,
    fourteenToThirty: 1,
    inactiveOrNever: 1,
    total: 12,
  },
  courses: [
    {
      courseId: 'course-id',
      slug: 'technical-course-slug',
      title: 'Curso, "Autoral"',
      totalAccess: 10,
      withProgress: 7,
      avgProgressPercent: 55.5,
      avgRating: 4.5,
      totalRatings: 8,
    },
  ],
  expiringSoon: [
    {
      enrollmentId: 'enrollment-id',
      userId: 'user-id',
      userName: 'João Autoral',
      userEmail: 'joao@example.test',
      accessLevelName: 'Acesso Autoral',
      expiresAt: '2026-09-20T03:00:00.000Z',
      daysUntilExpiry: 7,
    },
  ],
  recentEnrollments: [],
  topStudents: [
    {
      userId: 'user-id',
      userName: 'João Autoral',
      userEmail: 'joao@example.test',
      lessonsCompleted: 9,
      coursesTouched: 1,
    },
  ],
  lessonDive: {
    mostWatched: [
      {
        lessonId: 'lesson-id',
        title: 'Lección Autoral',
        courseTitle: 'Curso, "Autoral"',
        courseSlug: 'technical-course-slug',
        lessonSlug: 'technical-lesson-slug',
        started: 10,
        completed: 8,
        completionRate: 80,
        avgRating: 4.5,
        totalRatings: 8,
      },
    ],
    lowestCompletion: [],
  },
  chatUsage: {
    conversations: 4,
    userMessages: 9,
    assistantMessages: 8,
    uniqueUsers: 3,
    avgMessagesPerConversation: 4.25,
    topCourses: [
      {
        courseId: 'course-id',
        courseTitle: 'Curso, "Autoral"',
        conversations: 4,
        uniqueUsers: 3,
      },
    ],
  },
  liveClassAttendance: { totalSessions: 0, upcoming: [], past: [] },
  pointsLeaderboard: { rules: [], students: [] },
  certificates: {
    totalInPeriod: 1,
    totalAllTime: 1,
    byCourse: [{ courseId: 'course-id', courseTitle: 'Curso, "Autoral"', count: 1 }],
    recent: [
      {
        id: 'certificate-id',
        studentEmail: 'joao@example.test',
        studentName: 'João Autoral',
        courseTitle: 'Curso, "Autoral"',
        verificationCode: 'TECH-CODE-123',
        issuedAt: '2026-09-02T22:15:00.000Z',
      },
    ],
  },
  quizzes: {
    totalAttemptsInPeriod: 2,
    totalQuizzes: 1,
    perQuiz: [
      {
        quizId: 'quiz-id',
        lessonTitle: 'Lección Autoral',
        courseTitle: 'Curso, "Autoral"',
        passThresholdPercent: 70,
        attempts: 2,
        uniqueStudents: 1,
        passes: 1,
        passRatePercent: 50,
        avgScorePercent: 75,
        lastAttemptAt: '2026-09-02T21:30:00.000Z',
      },
    ],
  },
  usersLifecycle: {
    totalStudents: 12,
    segments: [{ segment: 'new', count: 3, percent: 25 }],
  },
  emails: {
    configured: true,
    totalSentInPeriod: 2,
    totalBouncedInPeriod: 1,
    totalBlockedInPeriod: 0,
    bounceRatePercent: 50,
    byEventType: [{ eventType: 'hard_bounce', count: 1 }],
    recentBounces: [
      {
        email: 'joao@example.test',
        eventType: 'hard_bounce',
        subject: 'Assunto Autoral',
        occurredAt: '2026-09-02T20:00:00.000Z',
      },
      {
        email: 'legacy@example.test',
        eventType: 'legacy_provider_bounce',
        subject: 'Legacy authored subject',
        occurredAt: '2026-09-01T20:00:00.000Z',
      },
    ],
    recentActivity: [],
    invalidEmails: [],
  },
};

describe.each(['en', 'pt', 'es'] as const)('report CSV in %s', (locale) => {
  it('localizes product framing and preserves machine and authored values', () => {
    const privateProviderDiagnostic = 'PRIVATE provider mailbox diagnostic';
    const dataWithPrivateProviderEvidence: ReportsData = {
      ...fixture,
      emails: {
        ...fixture.emails,
        recentBounces: fixture.emails.recentBounces.map((bounce) => ({
          ...bounce,
          reason: privateProviderDiagnostic,
        })),
      },
    };
    const csv = buildReportCsv(
      dataWithPrivateProviderEvidence,
      locale,
      new Date('2026-09-13T12:34:56.000Z'),
    );
    const copy = catalogs[locale].csv;
    const deliveryCopy = catalogs[locale].emailDeliverySummaries;

    expect(csv).toContain(`# ${copy.reportTitle} — `);
    expect(csv).toContain(`## ${copy.sections.studentActivity}`);
    expect(csv).toContain(copy.metrics.averageMessages);
    expect(csv).toContain('2026-09-13T12:34:56.000Z');
    expect(csv).toContain(`${copy.timeZone},UTC`);

    expect(csv).toContain(
      'course,slug,students_with_progress,students_with_access,avg_progress_percent,avg_rating,total_ratings',
    );
    expect(csv).toContain('event_type,count\nhard_bounce,1');
    expect(csv).toContain('segment,count,percent_of_base\nnew,3,25');
    expect(csv).toContain('technical-course-slug');
    expect(csv).toContain('TECH-CODE-123');
    expect(csv).toContain('2026-09-02T22:15:00.000Z');
    expect(csv).toContain('João Autoral');
    expect(csv).toContain('Lección Autoral');
    expect(csv).toContain('Assunto Autoral');
    expect(csv).toContain('"Curso, ""Autoral"""');
    expect(csv).toContain(
      'email,event,delivery_summary,subject,occurred_at',
    );
    expect(csv).toContain(deliveryCopy.hard_bounce);
    expect(csv).toContain(deliveryCopy.unknown);
    expect(csv).not.toContain(privateProviderDiagnostic);
  });

  it('neutralizes spreadsheet formulas in authored text without changing numbers', () => {
    const csv = buildReportCsv(
      {
        ...fixture,
        courses: [
          {
            ...fixture.courses[0],
            title: '=HYPERLINK("https://attacker.invalid")',
            avgProgressPercent: -5,
          },
        ],
        topStudents: [
          {
            ...fixture.topStudents[0],
            userName: '  +cmd|fixture',
          },
        ],
      },
      locale,
      new Date('2026-09-13T12:34:56.000Z'),
    );

    expect(csv).toContain(
      '"\'=HYPERLINK(""https://attacker.invalid"")",technical-course-slug',
    );
    expect(csv).toContain("1,'  +cmd|fixture,joao@example.test");
    expect(csv).toContain(',-5,');
  });
});
