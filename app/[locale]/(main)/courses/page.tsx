import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { fetchBrowseCatalogServer } from '@/features/Courses/queries.server';
import { ContentRow } from '@/shared/components/student/ContentRow';
import {
  PortraitCard,
  LandscapeCard,
} from '@/shared/components/student/CourseCard';
import { BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BrowsePage() {
  const t = await getTranslations('learningOverview.catalog');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { all, enrolled, featured, newReleases } = await fetchBrowseCatalogServer(
    user.id,
  );

  const hasAnything = all.length > 0;

  return (
    <div className="flex flex-col gap-10 md:gap-14 pb-20">
      {/* Page header */}
      <div className="px-4 md:px-8 lg:px-12 pt-8 md:pt-12">
        <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-muted-foreground)] mb-2">
          {t('eyebrow')}
        </p>
        <h1 className="font-display text-4xl md:text-6xl font-medium text-[var(--color-foreground)] leading-[1.05] tracking-tight">
          {t('title')}
        </h1>
        <p className="text-sm md:text-base text-[var(--color-muted-foreground)] mt-3 max-w-xl leading-relaxed">
          {hasAnything
            ? t('description')
            : t('unpublished')}
        </p>
      </div>

      {/* Rows */}
      {enrolled.length > 0 && (
        <ContentRow title={t('yourCourses')}>
          {enrolled.map((c) => (
            <LandscapeCard key={c.id} course={c} />
          ))}
        </ContentRow>
      )}

      {featured.length > 0 && (
        <ContentRow title={t('featured')}>
          {featured.map((c) => (
            <PortraitCard key={c.id} course={c} />
          ))}
        </ContentRow>
      )}

      {newReleases.length > 0 && (
        <ContentRow title={t('newReleases')}>
          {newReleases.map((c) => (
            <PortraitCard key={c.id} course={c} />
          ))}
        </ContentRow>
      )}

      {/* Full catalog grid */}
      {hasAnything ? (
        <section className="px-4 md:px-8 lg:px-12 space-y-5">
          <div>
            <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2">
              {t('fullCatalog')}
            </p>
            <h2 className="font-display text-2xl md:text-3xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight">
              {t('allCourses')}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-5">
            {all.map((c) => (
              <PortraitCard key={c.id} course={c} variant="grid" />
            ))}
          </div>
        </section>
      ) : (
        <section className="mx-4 md:mx-8 lg:mx-12 rounded-2xl border border-hairline bg-[var(--color-card)] px-6 py-16 md:py-20 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)] mb-5">
            <BookOpen className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2">
            {t('empty.eyebrow')}
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight mb-3">
            {t('empty.title')}
          </h2>
          <p className="text-sm md:text-base text-[var(--color-muted-foreground)] max-w-md mx-auto leading-relaxed">
            {t('empty.description')}
          </p>
        </section>
      )}
    </div>
  );
}
