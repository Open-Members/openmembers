import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/learningOverview.json';
import pt from '@/core/i18n/locales/pt/learningOverview.json';
import es from '@/core/i18n/locales/es/learningOverview.json';
import { DashboardPage } from '@/features/Dashboard/components/DashboardPage';
import { CourseProgressPage } from './CourseProgressPage';
import { LearningStats } from './LearningStats';
import { ActivityHeatmap } from './ActivityHeatmap';
import { EpisodeListItem } from '@/shared/components/student/EpisodeListItem';
import { DurationChip, ProgressBar, ProgressChip, CompletedBadge } from '@/shared/components/student/Badges';
import { LandscapeCard, type CardCourse } from '@/shared/components/student/CourseCard';
import { ContentRow } from '@/shared/components/student/ContentRow';
import type { CourseWithProgress } from '@/features/Courses/types';

vi.mock('@/core/i18n/routing', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock('motion/react', async importOriginal => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => true,
}));

const catalogs = { en, pt, es };
function wrapper(locale: keyof typeof catalogs) {
  return function LocaleProvider({ children }: { children: ReactNode }) {
    // A non-UTC viewer exposes regressions that shift day-only activity keys.
    return <NextIntlClientProvider locale={locale} messages={{ learningOverview: catalogs[locale] }} timeZone="America/Los_Angeles">{children}</NextIntlClientProvider>;
  };
}
const hero = { imageUrl: null, trailerYoutubeId: null, title: null, subtitle: null, siteName: 'Open Members', overlayOpacity: 70, showText: true };
const course: CourseWithProgress = {
  id: 'authored-course', slug: 'authored-course', title: 'Authored English title',
  totalLessons: 2, completedLessons: 1, progressPercent: 50, resumeLessonSlug: 'authored-lesson',
  isPublished: true, sortOrder: 0, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
};
const card: CardCourse = {
  id: 'card', slug: 'author-slug', title: 'An authored title', shortDescription: null,
  thumbnailLandscapeUrl: null, thumbnailPortraitUrl: null, instructorName: 'Maria Example',
  durationMinutes: 90, isNew: true, isFeatured: false, isFree: true, isComingSoon: false,
  isAccessible: true, isOwned: true, progressPercent: 50, isCompleted: false, checkoutUrl: null,
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe.each(['en', 'pt', 'es'] as const)('Learning overview in %s', locale => {
  const copy = catalogs[locale];
  const options = { wrapper: wrapper(locale) };

  it('translates default hero and empty state, preserving an explicitly authored English hero', () => {
    const { rerender } = render(<DashboardPage displayName="Alex" hero={hero} collections={[]} upcomingLive={null} />, options);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.dashboard.title.replace('{siteName}', hero.siteName));
    expect(screen.getByRole('heading', { name: copy.dashboard.empty.title })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: copy.dashboard.browse }).every(link => link.getAttribute('href') === '/courses')).toBe(true);
    rerender(<DashboardPage displayName="Alex" hero={{ ...hero, title: 'Welcome to Open Members', subtitle: 'Custom English subtitle' }} collections={[]} upcomingLive={null} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Open Members');
    expect(screen.getByText('Custom English subtitle')).toBeVisible();
    rerender(<DashboardPage displayName="Alex" hero={{ ...hero, trailerYoutubeId: 'authored-trailer' }} collections={[]} upcomingLive={null} />);
    const trailer = document.querySelector('iframe')!;
    expect(new URL(trailer.src).searchParams.get('hl')).toBe(locale);
    expect(trailer.title).toBe(copy.dashboard.title.replace('{siteName}', hero.siteName));
  });

  it('preserves authored row/card titles and instructor names while translating the surrounding controls', () => {
    render(<ContentRow title="Demo courses" subtitle="Author subtitle" seeAllHref="/courses"><LandscapeCard course={card} /></ContentRow>, options);
    expect(screen.getByRole('heading', { name: 'Demo courses' })).toBeVisible();
    expect(screen.getByRole('heading', { name: card.title })).toBeVisible();
    expect(screen.getByText(copy.cards.instructor.replace('{name}', 'Maria Example'))).toBeVisible();
    expect(screen.getByRole('link', { name: copy.rows.seeAll })).toHaveAttribute('href', '/courses');
    expect(screen.getByRole('button', { name: copy.rows.scrollLeft })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.rows.scrollRight })).toBeDisabled();
    expect(screen.getByText(copy.badges.free)).toBeVisible();
    expect(screen.getByText(copy.badges.new)).toBeVisible();
  });

  it('formats UTC activity day labels and singular/plural counts in the chosen language', () => {
    const { rerender } = render(<ActivityHeatmap days={[{ date: '2026-09-01', count: 1 }]} />, options);
    const singular = { en: '1 lesson across 1 day', pt: '1 aula em 1 dia', es: '1 lección en 1 día' };
    expect(screen.getByText(singular[locale])).toBeVisible();
    const day = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date('2026-09-01T00:00:00Z'));
    const expected = { en: `${day} — 1 lesson`, pt: `${day} — 1 aula`, es: `${day} — 1 lección` };
    expect(screen.getByTitle(expected[locale])).toBeInTheDocument();
    rerender(<ActivityHeatmap days={[{ date: '2026-09-01', count: 1 }, { date: '2026-09-02', count: 2 }]} />);
    const plural = { en: '3 lessons across 2 days', pt: '3 aulas em 2 dias', es: '3 lecciones en 2 días' };
    expect(screen.getByText(plural[locale])).toBeVisible();
    rerender(<ActivityHeatmap days={[{ date: '2026-09-01', count: 0 }]} />);
    expect(screen.getByText(copy.activity.empty)).toBeVisible();
  });

  it('keeps progress destinations, count plurals and percentage calculations while localizing display', () => {
    const { rerender } = render(<CourseProgressPage courses={[course]} />, options);
    expect(screen.getByRole('heading', { name: copy.progress.inProgress.title })).toBeVisible();
    const label = { en: '1 of 2 lessons', pt: '1 de 2 aulas', es: '1 de 2 lecciones' };
    expect(screen.getByText(label[locale])).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/courses/authored-course/authored-lesson');
    expect(link).toHaveTextContent('Authored English title');
    expect(link).toHaveTextContent(new Intl.NumberFormat(locale, { style: 'percent' }).format(0.5).replace(/\s/g, ' '));
    // Localized percent text must never become an invalid CSS value (e.g. "50 %").
    expect(document.querySelector('[style*="width"]')?.getAttribute('style')).not.toMatch(/width:.*\s%/);
    rerender(<CourseProgressPage courses={[{ ...course, completedLessons: 2, progressPercent: 100 }]} />);
    expect(screen.getByRole('heading', { name: copy.progress.completed.title })).toBeVisible();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/courses/authored-course');
    expect(screen.getByText(copy.progress.course.allDone, { exact: false })).toBeInTheDocument();
  });

  it('uses the selected locale for animated numbers instead of the browser locale', async () => {
    render(<LearningStats stats={{ streakDays: 1, streakLongest: 3, minutesThisWeek: 12345, lessonsThisWeek: 2, activeCourse: null }} totals={{ lessonsDone: 2, overallPercent: 50 }} />, options);
    await waitFor(() => expect(screen.getByText(new Intl.NumberFormat(locale).format(12345))).toBeVisible());
    expect(screen.getByText(new Intl.NumberFormat(locale, { style: 'percent' }).format(0.5).replace(/\s/g, ' '))).toBeInTheDocument();
    expect(screen.getByText(copy.stats.longest.replace('{count, number}', '3'))).toBeVisible();
    expect(screen.getByRole('link', { name: copy.dashboard.browse })).toHaveAttribute('href', '/courses');
  });

  it('translates episode status, unlock plurals and toggle accessibility without changing destinations', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    const toggle = vi.fn();
    const { rerender } = render(<EpisodeListItem index={1} title="Authored lesson" durationSeconds={65} href="/courses/a/b" onToggleComplete={toggle} />, options);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/courses/a/b');
    fireEvent.click(screen.getByRole('button', { name: copy.episode.markWatched }));
    await waitFor(() => expect(toggle).toHaveBeenCalledWith(true));
    rerender(<EpisodeListItem index={1} title="Authored lesson" isDripLocked dripUnlockDate="2026-09-02T12:00:00Z" href="/courses/a/b" />);
    const oneDay = { en: 'Unlocks in 1 day', pt: 'Disponível em 1 dia', es: 'Disponible en 1 día' };
    expect(screen.getByText(oneDay[locale])).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<EpisodeListItem index={1} title="Authored lesson" isDripLocked dripUnlockDate="2026-09-04T12:00:00Z" />);
    const threeDays = { en: 'Unlocks in 3 days', pt: 'Disponível em 3 dias', es: 'Disponible en 3 días' };
    expect(screen.getByText(threeDays[locale])).toBeVisible();
  });

  it('formats duration/progress badges while preserving authored labels and numeric progress bounds', () => {
    render(<><DurationChip minutes={90} /><CompletedBadge label="Custom status" /><ProgressChip percent={125} /><ProgressBar percent={125} /></>, options);
    expect(screen.getByText('1h 30min')).toBeVisible();
    expect(screen.getByText('Custom status')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: copy.badges.progress })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText(new Intl.NumberFormat(locale, { style: 'percent' }).format(1).replace(/\s/g, ' '))).toBeVisible();
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '100%' });
  });
});
