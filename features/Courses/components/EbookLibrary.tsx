import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BookOpen, Lock, Download } from 'lucide-react';
import { HeroBanner } from '@/shared/components/student/HeroBanner';
import type { CourseDetailView } from '@/features/Courses/queries.server';
import { courseAccessHref } from '@/shared/config/sales';

type Props = {
  course: CourseDetailView;
};

// Generic cover placeholders when no illustration has been configured.
const PALETTES = [
  { from: '#2b1b4e', to: '#5b3fa8', accent: '#d9c4ff' }, // deep purple
  { from: '#0e2e3a', to: '#1f6f7c', accent: '#9de5d0' }, // teal
  { from: '#3d1a1a', to: '#8a2c2c', accent: '#ffc8b0' }, // cranberry
  { from: '#1a2d3d', to: '#2f5b7f', accent: '#a6d2ff' }, // navy
  { from: '#2d2410', to: '#7a5a1f', accent: '#ffe5a6' }, // ochre
  { from: '#1c3320', to: '#3e7a42', accent: '#c6e7ac' }, // forest
];

export function EbookLibrary({ course }: Props) {
  const t = useTranslations('learningMedia.library');
  const canRead = course.isAccessible;
  const eyebrow = course.instructor?.name
    ? t('withInstructor', { name: course.instructor.name })
    : t('title');

  const firstReadable = course.modules
    .flatMap((m) => m.lessons)
    .find((l) => !l.isDripLocked);
  const lockedHref = courseAccessHref(course.checkoutUrl);
  const primaryCta =
    canRead && firstReadable
      ? {
          label: course.progressPercent > 0 ? t('resume') : t('start'),
          href: `/courses/${course.slug}/${firstReadable.slug}`,
        }
      : !canRead
        ? {
            label: t('getAccess'),
            href: lockedHref,
            external: /^https?:\/\//i.test(lockedHref),
          }
        : null;

  return (
    <div className="flex flex-col gap-10 md:gap-16 pb-20">
      {/* ── Hero — reuses the admin-configured banner so the ebook course
             visually matches every other course on the platform. ─────── */}
      <HeroBanner
        imageUrl={course.heroBannerUrl ?? course.thumbnailLandscapeUrl}
        trailerYoutubeId={course.trailerYoutubeId}
        eyebrow={eyebrow}
        title={course.title}
        subtitle={course.shortDescription ?? undefined}
        primaryCta={primaryCta}
        overlayOpacity={course.heroOverlayOpacity}
        showText={course.heroShowText}
      />

      {/* ── Meta strip ───────────────────────────────────── */}
      <section className="px-4 md:px-8 lg:px-12">
        <div className="flex items-center flex-wrap gap-x-5 gap-y-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] font-medium">
            <BookOpen className="w-4 h-4" />
            {t('ebooks', { count: course.totalLessons })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] font-medium">
            {t('accessSchedule')}
          </span>
        </div>
      </section>

      {/* ── Library grouped by module ─────────────────────── */}
      <div className="flex flex-col gap-14 px-4 md:px-8 lg:px-12">
        {course.modules.map((mod, mIdx) => (
          <section key={mod.id}>
            <div className="mb-6 max-w-3xl">
              <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2">
                {t('collection', { number: mIdx + 1 })}
              </p>
              <h2 className="font-display text-2xl md:text-3xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight mb-2">
                {mod.title}
              </h2>
              {mod.description && (
                <p className="text-sm md:text-base text-[var(--color-muted-foreground)] leading-relaxed">
                  {mod.description}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 md:gap-7">
              {mod.lessons.map((lesson, lIdx) => {
                const palette = PALETTES[(mIdx * 3 + lIdx) % PALETTES.length];
                return (
                  <BookCard
                    key={lesson.id}
                    href={
                      canRead
                        ? `/courses/${course.slug}/${lesson.slug}`
                        : null
                    }
                    title={lesson.title}
                    locked={!canRead}
                    palette={palette}
                    coverUrl={lesson.coverUrl}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {!canRead && (
        <section className="px-4 md:px-8 lg:px-12">
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">
            {t('enrollHelp')}
          </p>
        </section>
      )}
    </div>
  );
}

function BookCard({
  href,
  title,
  locked,
  palette,
  coverUrl,
}: {
  href: string | null;
  title: string;
  locked: boolean;
  palette: { from: string; to: string; accent: string };
  coverUrl: string | null;
}) {
  const inner = (
    <div className="group relative flex flex-col gap-3">
      <div
        className="relative aspect-[2/3] rounded-md overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_14px_36px_rgba(0,0,0,0.45)]"
        style={{
          background: `linear-gradient(155deg, ${palette.from} 0%, ${palette.to} 100%)`,
        }}
      >
        {coverUrl ? (
          // object-contain: show the full PDF page inside the 2:3 book
          // card. The palette gradient behind fills the letterbox so the
          // card still reads as a book.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={title}
            className="absolute inset-0 w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-between p-4">
            <BookOpen className="w-5 h-5 opacity-60" style={{ color: palette.accent }} />
            <p
              className="font-display text-[13px] md:text-sm font-medium leading-snug tracking-tight line-clamp-4"
              style={{ color: palette.accent }}
            >
              {title}
            </p>
          </div>
        )}

        <div
          className="absolute inset-y-0 left-0 w-[6px] pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 100%)',
          }}
        />

        {locked && (
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center">
            <Lock className="w-5 h-5 text-white/80" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] md:text-xs text-[var(--color-muted-foreground)] line-clamp-2 leading-snug">
          {title}
        </span>
        {!locked && (
          <Download className="shrink-0 w-3.5 h-3.5 text-[var(--color-muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );

  if (!href) {
    return <div className="cursor-not-allowed">{inner}</div>;
  }
  return (
    <Link href={href} prefetch={false} className="block">
      {inner}
    </Link>
  );
}
