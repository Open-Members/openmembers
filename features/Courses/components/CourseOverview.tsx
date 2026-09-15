import { useTranslations } from 'next-intl';
import { HeroBanner } from '@/shared/components/student/HeroBanner';
import { ContentRow } from '@/shared/components/student/ContentRow';
import { PortraitCard } from '@/shared/components/student/CourseCard';
import {
  NewBadge,
  CompletedBadge,
  LockBadge,
  DurationChip,
} from '@/shared/components/student/Badges';
import { BookOpen, Clock } from 'lucide-react';
import type { CourseDetailView } from '@/features/Courses/queries.server';
import { ModuleAccordion } from '@/features/Courses/components/ModuleAccordion';
import { courseAccessHref } from '@/shared/config/sales';
import { EbookLibrary } from '@/features/Courses/components/EbookLibrary';
import { SegmentedProgressBar } from '@/features/Courses/components/SegmentedProgressBar';
import { CertificateDownloadButton } from '@/features/Courses/components/CertificateDownloadButton';

type Props = {
  course: CourseDetailView;
};

export function CourseOverview({ course }: Props) {
  const t = useTranslations('learning.course');
  if (course.contentFormat === 'ebook') {
    return <EbookLibrary course={course} />;
  }
  const primaryCta = buildPrimaryCta(course, t);
  const heroTitle = course.title;
  const heroSubtitle = course.shortDescription ?? undefined;
  const eyebrow = course.instructor?.name
    ? t('withInstructor', { name: course.instructor.name })
    : null;

  return (
    <div className="flex flex-col gap-10 md:gap-16 pb-20">
      {/* ── Hero ─────────────────────────────────────── */}
      <HeroBanner
        imageUrl={course.heroBannerUrl ?? course.thumbnailLandscapeUrl}
        trailerYoutubeId={course.trailerYoutubeId}
        eyebrow={eyebrow}
        title={heroTitle}
        subtitle={heroSubtitle}
        primaryCta={primaryCta}
        overlayOpacity={course.heroOverlayOpacity}
        showText={course.heroShowText}
      />

      {/* ── Meta strip ───────────────────────────────── */}
      <section className="px-4 md:px-8 lg:px-12">
        <div className="flex items-center flex-wrap gap-x-5 gap-y-3 text-sm">
          {course.durationMinutes && (
            <MetaItem icon={<Clock className="w-4 h-4" />}>
              <DurationLabel minutes={course.durationMinutes} />
            </MetaItem>
          )}
          <MetaItem icon={<BookOpen className="w-4 h-4" />}>
            {t('lessons', { count: course.totalLessons })}
          </MetaItem>
          {course.isNew && <NewBadge />}
          {course.isAccessible && course.isCompleted && (
            <CompletedBadge label={t('completed')} />
          )}
          {course.isAccessible &&
            course.isCompleted &&
            course.certificateAvailable && (
              <CertificateDownloadButton courseId={course.id} />
            )}
          {!course.isAccessible && (
            <span className="inline-flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
              <LockBadge className="!p-1" />
              {t('locked')}
            </span>
          )}
        </div>

        {/* Progress bar (enrolled + in-progress) — segmented by module
            so students can see where the gaps are, not just an overall
            ratio. */}
        {course.isAccessible &&
          course.totalLessons > 0 &&
          !course.isCompleted &&
          course.progressPercent > 0 && (
            <SegmentedProgressBar
              modules={course.modules}
              totalLessons={course.totalLessons}
              completedLessons={course.completedLessons}
            />
          )}
      </section>

      {/* ── About ────────────────────────────────────── */}
      {course.description && (
        <section className="px-4 md:px-8 lg:px-12 max-w-3xl">
          <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-3">
            {t('about')}
          </p>
          <p className="font-display text-lg md:text-xl text-[var(--color-foreground)] whitespace-pre-wrap leading-relaxed">
            {course.description}
          </p>
        </section>
      )}

      {/* ── {t('content')} ───────────────────────────── */}
      <section className="px-4 md:px-8 lg:px-12">
        <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2">
          {t('content')}
        </p>
        <h2 className="font-display text-2xl md:text-4xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight mb-8">
          {t('summary', { lessons: course.totalLessons, modules: course.modules.length })}
        </h2>

        {course.modules.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('empty')}
          </p>
        ) : (
          <ModuleAccordion
            modules={course.modules}
            courseSlug={course.slug}
            courseAccessible={course.isAccessible}
            thumbnailUrl={
              course.thumbnailLandscapeUrl ??
              course.heroBannerUrl ??
              course.thumbnailPortraitUrl
            }
          />
        )}
      </section>

      {/* ── Related ──────────────────────────────────── */}
      {course.related.length >= 2 && (
        <ContentRow title={t('related')}>
          {course.related.map((c) => (
            <PortraitCard key={c.id} course={c} />
          ))}
        </ContentRow>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildPrimaryCta(course: CourseDetailView, t: ReturnType<typeof useTranslations<'learning.course'>>) {
  if (!course.isAccessible) {
    const href = courseAccessHref(course.checkoutUrl);
    return {
      label: t('getAccess'),
      href,
      external: /^https?:\/\//i.test(href),
    };
  }

  if (course.isCompleted && course.firstLessonSlug) {
    return {
      label: t('watchAgain'),
      href: `/courses/${course.slug}/${course.firstLessonSlug}`,
    };
  }

  const target = course.resumeLessonSlug ?? course.firstLessonSlug;
  if (!target) return null;

  const hasProgress = course.progressPercent > 0;
  return {
    label: hasProgress ? t('resume') : t('start'),
    href: `/courses/${course.slug}/${target}`,
  };
}

function MetaItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] font-medium">
      {icon}
      {children}
    </span>
  );
}

function DurationLabel({ minutes }: { minutes: number }) {
  const t = useTranslations('learning.course');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return <>{t('minutesTotal', { minutes: m })}</>;
  if (m === 0) return <>{t('hoursTotal', { hours: h })}</>;
  return <>{t('hoursMinutesTotal', { hours: h, minutes: m })}</>;
}

// DurationChip and CompletedBadge imports above.
// (Re-exported for potential future variants — keep tree-shake-friendly.)
export { DurationChip };
