import { useTranslations } from 'next-intl';
import { HeroBanner } from '@/shared/components/student/HeroBanner';
import { ContentRow } from '@/shared/components/student/ContentRow';
import {
  PortraitCard,
  LandscapeCard,
} from '@/shared/components/student/CourseCard';
import { ContinueWatchingCard } from '@/shared/components/student/ContinueWatchingCard';
import type { ResolvedCollection } from '@/features/Collections/types';
import { UpcomingLiveCard } from '@/features/LiveClasses';
import type { UpcomingLiveClass } from '@/features/LiveClasses';
import { DashboardEmptyState } from './DashboardEmptyState';

type HeroProps = {
  imageUrl: string | null;
  trailerYoutubeId: string | null;
  title: string | null;
  subtitle: string | null;
  siteName: string;
  overlayOpacity: number;
  showText: boolean;
};

type Props = {
  displayName: string;
  hero: HeroProps;
  collections: ResolvedCollection[];
  upcomingLive: UpcomingLiveClass | null;
};

/** Primary CTA points at the first continue-watching lesson, if any. */
function firstContinueTarget(collections: ResolvedCollection[]) {
  const c = collections.find((r) => r.kind === 'continue');
  if (!c || c.kind !== 'continue' || c.items.length === 0) return null;
  return c.items[0];
}

/** Landscape cards look better for "your enrolled courses"; portrait for everything else. */
function cardVariantFor(rowType: ResolvedCollection['rowType']): 'portrait' | 'landscape' {
  return rowType === 'enrolled' ? 'landscape' : 'portrait';
}

export function DashboardPage({ displayName, hero, collections, upcomingLive }: Props) {
  const t = useTranslations('learningOverview.dashboard');
  const resume = firstContinueTarget(collections);
  const hasAnyRow = collections.length > 0;

  return (
    <div className="flex flex-col gap-8 md:gap-12 pb-16">
      {/* Hero */}
      <HeroBanner
        imageUrl={hero.imageUrl}
        trailerYoutubeId={hero.trailerYoutubeId}
        overlayOpacity={hero.overlayOpacity}
        showText={hero.showText}
        centerTextMobile
        eyebrowBelowOnMobile
        eyebrow={t('greeting', { name: displayName })}
        title={hero.title ?? t('title', { siteName: hero.siteName })}
        subtitle={hero.subtitle ?? undefined}
        primaryCta={
          resume
            ? {
                label: t('resume'),
                href: `/courses/${resume.courseSlug}/${resume.lessonSlug}`,
              }
            : { label: t('browse'), href: '/courses' }
        }
        secondaryCta={
          hasAnyRow ? { label: t('viewCatalog'), href: '/courses' } : null
        }
      />

      {/* Upcoming live class — only when the student has one within the window */}
      {upcomingLive && <UpcomingLiveCard liveClass={upcomingLive} />}

      {/* Collections */}
      {collections.map((row) => {
        if (row.kind === 'continue') {
          return (
            <ContentRow
              key={row.id}
              title={row.title}
              subtitle={row.subtitle ?? undefined}
            >
              {row.items.map((it) => (
                <ContinueWatchingCard
                  key={`${it.courseSlug}-${it.lessonSlug}`}
                  courseSlug={it.courseSlug}
                  lessonSlug={it.lessonSlug}
                  courseTitle={it.courseTitle}
                  lessonTitle={it.lessonTitle}
                  thumbnailUrl={it.thumbnailUrl}
                  progressPercent={it.progressPercent}
                />
              ))}
            </ContentRow>
          );
        }

        const variant = cardVariantFor(row.rowType);
        return (
          <ContentRow
            key={row.id}
            title={row.title}
            subtitle={row.subtitle ?? undefined}
            seeAllHref="/courses"
          >
            {row.cards.map((c) =>
              variant === 'landscape' ? (
                <LandscapeCard key={c.id} course={c} />
              ) : (
                <PortraitCard key={c.id} course={c} />
              ),
            )}
          </ContentRow>
        );
      })}

      {/* Empty state — every row resolved to zero or admin disabled everything */}
      {!hasAnyRow && <DashboardEmptyState />}
    </div>
  );
}
