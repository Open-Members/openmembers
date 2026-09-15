import type { Locale } from '@/core/i18n/config';
import en from '@/core/i18n/locales/en/adminReports.json';
import es from '@/core/i18n/locales/es/adminReports.json';
import pt from '@/core/i18n/locales/pt/adminReports.json';
import type { ReportsData, ResolvedPeriod } from './reports-queries';
import { getEmailDeliverySummary } from './report-i18n';
import { csvRow as row } from './csv';

type ReportCsvCopy = typeof en.csv;
type ReportCatalog = typeof en;

const CATALOGS: Record<Locale, ReportCatalog> = {
  en,
  es,
  pt,
};

const DATE_LOCALES: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
};

function utcCivilDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function periodLabel(
  period: ResolvedPeriod,
  locale: Locale,
  copy: ReportCsvCopy,
): string {
  switch (period.key) {
    case '30d':
      return copy.periods.last30Days;
    case 'month':
      return copy.periods.thisMonth;
    case 'last_month':
      return copy.periods.lastMonth;
    case '90d':
      return copy.periods.last90Days;
    case 'custom':
      return `${utcCivilDate(period.from, locale)} – ${utcCivilDate(period.to, locale)}`;
  }
}

/**
 * Localize only the product-authored report frame. Technical headers, enum
 * codes, UTC timestamps and administrator-authored values remain literal.
 */
export function buildReportCsv(
  data: ReportsData,
  locale: Locale,
  generatedAt: Date,
): string {
  const catalog = CATALOGS[locale];
  const copy = catalog.csv;
  const label = periodLabel(data.period, locale, copy);
  const lines: string[] = [];

  lines.push(`# ${copy.reportTitle} — ${label}`);
  lines.push(
    row([
      `# ${copy.generatedAt}`,
      generatedAt.toISOString(),
      copy.period,
      label,
      copy.from,
      data.period.from,
      copy.to,
      data.period.to,
      copy.timeZone,
      'UTC',
    ]),
  );
  lines.push('');

  lines.push(`## ${copy.sections.kpis}`);
  lines.push(row(['metric', 'value', 'previous_period']));
  lines.push(row([copy.metrics.totalStudents, data.kpis.totalStudents, '']));
  lines.push(
    row([
      copy.metrics.activeInPeriod,
      data.kpis.activeInPeriod,
      data.kpis.activePreviousPeriod,
    ]),
  );
  lines.push(
    row([
      copy.metrics.newEnrollments,
      data.kpis.newEnrollmentsInPeriod,
      data.kpis.newEnrollmentsPreviousPeriod,
    ]),
  );
  lines.push(
    row([
      copy.metrics.averageRating,
      data.kpis.avgRating ?? '',
      data.kpis.totalRatings,
    ]),
  );
  lines.push('');

  lines.push(`## ${copy.sections.studentActivity}`);
  lines.push(row(['bucket', 'count']));
  lines.push(row([copy.metrics.today, data.accesses.today]));
  lines.push(row([copy.metrics.yesterday, data.accesses.yesterday]));
  lines.push(row([copy.metrics.days2to7, data.accesses.twoToSeven]));
  lines.push(row([copy.metrics.days7to14, data.accesses.sevenToFourteen]));
  lines.push(row([copy.metrics.days14to30, data.accesses.fourteenToThirty]));
  lines.push(row([copy.metrics.days30OrNever, data.accesses.inactiveOrNever]));
  lines.push('');

  lines.push(`## ${copy.sections.courses}`);
  lines.push(
    row([
      'course',
      'slug',
      'students_with_progress',
      'students_with_access',
      'avg_progress_percent',
      'avg_rating',
      'total_ratings',
    ]),
  );
  for (const course of data.courses) {
    lines.push(
      row([
        course.title,
        course.slug,
        course.withProgress,
        course.totalAccess,
        course.avgProgressPercent ?? '',
        course.avgRating ?? '',
        course.totalRatings,
      ]),
    );
  }
  lines.push('');

  lines.push(`## ${copy.sections.topStudents}`);
  lines.push(row(['rank', 'name', 'email', 'lessons_completed', 'courses_touched']));
  data.topStudents.forEach((student, index) => {
    lines.push(
      row([
        index + 1,
        student.userName,
        student.userEmail,
        student.lessonsCompleted,
        student.coursesTouched,
      ]),
    );
  });
  lines.push('');

  lines.push(`## ${copy.sections.mostWatched}`);
  lines.push(
    row([
      'rank',
      'lesson',
      'course',
      'viewers',
      'completed',
      'completion_rate',
      'avg_rating',
    ]),
  );
  data.lessonDive.mostWatched.forEach((lesson, index) => {
    lines.push(
      row([
        index + 1,
        lesson.title,
        lesson.courseTitle,
        lesson.started,
        lesson.completed,
        lesson.completionRate ?? '',
        lesson.avgRating ?? '',
      ]),
    );
  });
  lines.push('');

  lines.push(`## ${copy.sections.lowestCompletion}`);
  lines.push(
    row([
      'rank',
      'lesson',
      'course',
      'completed',
      'started',
      'completion_rate',
      'avg_rating',
    ]),
  );
  data.lessonDive.lowestCompletion.forEach((lesson, index) => {
    lines.push(
      row([
        index + 1,
        lesson.title,
        lesson.courseTitle,
        lesson.completed,
        lesson.started,
        lesson.completionRate ?? '',
        lesson.avgRating ?? '',
      ]),
    );
  });
  lines.push('');

  lines.push(`## ${copy.sections.chatUsage}`);
  lines.push(row(['metric', 'value']));
  lines.push(row([copy.metrics.conversations, data.chatUsage.conversations]));
  lines.push(row([copy.metrics.userMessages, data.chatUsage.userMessages]));
  lines.push(row([copy.metrics.assistantMessages, data.chatUsage.assistantMessages]));
  lines.push(row([copy.metrics.uniqueUsers, data.chatUsage.uniqueUsers]));
  lines.push(
    row([
      copy.metrics.averageMessages,
      data.chatUsage.avgMessagesPerConversation ?? '',
    ]),
  );
  lines.push('');
  lines.push(row(['course', 'conversations', 'unique_users']));
  for (const course of data.chatUsage.topCourses) {
    lines.push(row([course.courseTitle, course.conversations, course.uniqueUsers]));
  }
  lines.push('');

  lines.push(`## ${copy.sections.expiring}`);
  lines.push(
    row(['user', 'email', 'access_level', 'expires_at', 'days_until_expiry']),
  );
  for (const enrollment of data.expiringSoon) {
    lines.push(
      row([
        enrollment.userName,
        enrollment.userEmail,
        enrollment.accessLevelName,
        enrollment.expiresAt,
        enrollment.daysUntilExpiry,
      ]),
    );
  }
  lines.push('');

  lines.push(`## ${copy.sections.emailEvents}`);
  lines.push(row(['event_type', 'count']));
  for (const event of data.emails.byEventType) {
    lines.push(row([event.eventType, event.count]));
  }
  lines.push('');

  lines.push(`## ${copy.sections.emailBounces}`);
  lines.push(
    row(['email', 'event', 'delivery_summary', 'subject', 'occurred_at']),
  );
  for (const bounce of data.emails.recentBounces) {
    lines.push(
      row([
        bounce.email,
        bounce.eventType,
        getEmailDeliverySummary(
          bounce.eventType,
          catalog.emailDeliverySummaries,
        ),
        bounce.subject ?? '',
        bounce.occurredAt,
      ]),
    );
  }
  lines.push('');

  lines.push(`## ${copy.sections.lifecycle}`);
  lines.push(row(['segment', 'count', 'percent_of_base']));
  for (const segment of data.usersLifecycle.segments) {
    lines.push(row([segment.segment, segment.count, segment.percent]));
  }
  lines.push('');

  lines.push(`## ${copy.sections.quizzes}`);
  lines.push(
    row([
      'lesson',
      'course',
      'attempts',
      'unique_students',
      'pass_rate_percent',
      'avg_score_percent',
      'threshold_percent',
      'last_attempt_at',
    ]),
  );
  for (const quiz of data.quizzes.perQuiz) {
    lines.push(
      row([
        quiz.lessonTitle,
        quiz.courseTitle,
        quiz.attempts,
        quiz.uniqueStudents,
        quiz.attempts > 0 ? quiz.passRatePercent : '',
        quiz.avgScorePercent ?? '',
        quiz.passThresholdPercent,
        quiz.lastAttemptAt ?? '',
      ]),
    );
  }
  lines.push('');

  lines.push(`## ${copy.sections.certificatesAllTime}`);
  lines.push(row(['course', 'count']));
  for (const course of data.certificates.byCourse) {
    lines.push(row([course.courseTitle, course.count]));
  }
  lines.push('');

  lines.push(`## ${copy.sections.certificatesRecent}`);
  lines.push(
    row(['student_name', 'student_email', 'course', 'verification_code', 'issued_at']),
  );
  for (const certificate of data.certificates.recent) {
    lines.push(
      row([
        certificate.studentName,
        certificate.studentEmail,
        certificate.courseTitle,
        certificate.verificationCode,
        certificate.issuedAt,
      ]),
    );
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}
