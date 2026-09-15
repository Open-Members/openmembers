import { Link } from '@/core/i18n/routing';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { ContentRowArrows } from './ContentRowArrows';

type ContentRowProps = {
  title: string;
  subtitle?: string;
  seeAllHref?: string;
  /** Horizontal card items. */
  children: React.ReactNode;
  /**
   * Extra classes on the scroller. Useful to tune gap or padding per consumer
   * (e.g. LandscapeCard needs less gap than PortraitCard).
   */
  scrollerClassName?: string;
  /** Emits nothing when children is empty. */
  hideWhenEmpty?: boolean;
};

/**
 * Horizontal content row used in the dashboard, browse, and course pages.
 * Mobile: pure swipe with scroll-snap. Desktop: arrow buttons appear on hover.
 */
export function ContentRow({
  title,
  subtitle,
  seeAllHref,
  children,
  scrollerClassName = '',
  hideWhenEmpty = true,
}: ContentRowProps) {
  const t = useTranslations('learningOverview.rows');
  // A heuristic empty check: the component is server-renderable so we can't
  // inspect children count reliably. Consumers that know the row is empty
  // should simply not render this component.
  if (hideWhenEmpty && children === null) return null;

  return (
    <section className="relative group/row">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-5 px-4 md:px-8 lg:px-12">
        <div className="min-w-0">
          <h2 className="font-display text-2xl md:text-3xl font-medium text-[var(--color-foreground)] truncate leading-tight tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs md:text-sm text-[var(--color-muted-foreground)] mt-1 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="flex items-center gap-1 text-[11px] md:text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] shrink-0 transition-colors"
          >
            {t('seeAll')}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {/* Scroller — arrows are client-side siblings */}
      <ContentRowArrows>
        <div
          data-row-scroller
          className={`flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth px-4 md:px-8 lg:px-12 gap-3 md:gap-4 pb-2 ${scrollerClassName}`}
        >
          {children}
        </div>
      </ContentRowArrows>
    </section>
  );
}
