import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/liveClasses.json';
import pt from '@/core/i18n/locales/pt/liveClasses.json';
import es from '@/core/i18n/locales/es/liveClasses.json';
import { UpcomingLiveCard } from './UpcomingLiveCard';
import { UpcomingLiveStrip } from './UpcomingLiveStrip';
import { LiveClassesCalendar } from './LiveClassesCalendar';
import { formatInZone, formatTimeInZone, offsetMinutes, zonedWallClockToUtcIso } from '../lib/timezone';
import { buildIcsDataUrl } from '../lib/ics';
import type { LiveClassWithCourse, UpcomingLiveClass } from '../types';

const mocks = vi.hoisted(() => ({ track: vi.fn(), timezone: vi.fn((): string | null => 'America/Sao_Paulo') }));
vi.mock('../lib/track-click', () => ({ trackLiveClassClick: mocks.track }));
vi.mock('@/shared/hooks/useBrowserTimezone', () => ({ useBrowserTimezone: mocks.timezone }));

const catalogs = { en, pt, es };
const now = new Date('2026-09-12T12:00:00Z');
const base: LiveClassWithCourse = {
  id: 'fixture-event', title: 'Authored English event', description: 'Authored description stays unchanged.',
  startsAt: '2026-09-12T15:24:00Z', durationMinutes: 60,
  meetingUrl: 'https://example.test/meeting?authored=yes', originTimezone: 'Europe/London',
  createdAt: now.toISOString(), updatedAt: now.toISOString(),
  courses: [{ id: 'course-one', title: 'Authored course', slug: 'authored-course' }],
  courseId: 'course-one', courseTitle: 'Authored course', courseSlug: 'authored-course',
};
function eventIn(minutes: number, overrides: Partial<LiveClassWithCourse> = {}): LiveClassWithCourse {
  return { ...base, startsAt: new Date(now.getTime() + minutes * 60_000).toISOString(), ...overrides };
}
function upcoming(event: LiveClassWithCourse): UpcomingLiveClass {
  return { ...event, msUntilStart: new Date(event.startsAt).getTime() - now.getTime(), isLive: false };
}
function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={{ liveClasses: catalogs[locale] }} timeZone="UTC">{children}</NextIntlClientProvider>;
  };
}
function clickLink(link: HTMLElement) {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(now);
  mocks.timezone.mockReturnValue('America/Sao_Paulo');
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe.each(['en', 'pt', 'es'] as const)('Live sessions in %s', (locale) => {
  const copy = catalogs[locale];
  const t = createTranslator({ locale, messages: copy });
  const options = { wrapper: wrapper(locale) };

  it.each([false, true])('translates empty states with enrollment=%s', (hasAnyEnrollment) => {
    render(<UpcomingLiveStrip events={[]} hasAnyEnrollment={hasAnyEnrollment} />, options);
    expect(screen.getByText(copy.upcoming)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: hasAnyEnrollment ? t('strip.emptyEnrolled', { days: 30 }) : copy.strip.emptyVisitor })).toBeInTheDocument();
    if (hasAnyEnrollment) expect(screen.queryByRole('link')).toBeNull();
    else expect(screen.getByRole('link', { name: copy.browseCourses })).toHaveAttribute('href', '/courses');
  });

  it('preserves authored content, separate links, browser zone, display locale and tracking', () => {
    render(<UpcomingLiveStrip events={[base, eventIn(-120, { id: 'ended', title: 'Ended event' }), eventIn(31 * 24 * 60, { id: 'distant', title: 'Distant event' })]} hasAnyEnrollment />, options);
    expect(screen.queryByText('Ended event')).toBeNull();
    expect(screen.queryByText('Distant event')).toBeNull();
    expect(screen.getByRole('heading', { name: base.title })).toBeInTheDocument();
    expect(screen.getByText(base.courseTitle)).toBeInTheDocument();
    expect(screen.getByText(t('strip.window', { days: 30, timezone: 'America/Sao_Paulo' }))).toBeInTheDocument();
    expect(screen.getByText(formatTimeInZone(base.startsAt, 'America/Sao_Paulo', locale))).toBeInTheDocument();
    const meeting = screen.getByRole('link', { name: new RegExp(base.title) });
    const course = screen.getByRole('link', { name: copy.viewCourse });
    expect(meeting).toHaveAttribute('href', base.meetingUrl);
    expect(meeting).toHaveAttribute('rel', 'noopener noreferrer');
    expect(course).toHaveAttribute('href', '/courses/authored-course');
    expect(document.querySelector('a a')).toBeNull();
    clickLink(course);
    expect(mocks.track).not.toHaveBeenCalled();
    clickLink(meeting);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith(base.id);
  });

  it('uses UTC until the browser timezone is known', () => {
    mocks.timezone.mockReturnValue(null);
    const { rerender } = render(<UpcomingLiveStrip events={[base]} hasAnyEnrollment />, options);
    expect(screen.getByText(t('strip.window', { days: 30, timezone: 'UTC' }))).toBeInTheDocument();
    mocks.timezone.mockReturnValue('America/Sao_Paulo');
    rerender(<UpcomingLiveStrip events={[base]} hasAnyEnrollment />);
    expect(screen.getByText(t('strip.window', { days: 30, timezone: 'America/Sao_Paulo' }))).toBeInTheDocument();
    expect(screen.getByText(formatTimeInZone(base.startsAt, 'America/Sao_Paulo', locale))).toBeInTheDocument();
  });

  it.each([
    [7 * 24 * 60, 'countdown.weeks', { count: 1 }],
    [14 * 24 * 60, 'countdown.weeks', { count: 2 }],
    [2 * 24 * 60, 'countdown.days', { count: 2 }],
    [24 * 60, 'countdown.tomorrow', {}],
    [204, 'countdown.hoursMinutes', { hours: 3, minutes: 24 }],
    [2, 'countdown.minutes', { count: 2 }],
    [-2, 'liveNow', {}],
  ] as const)('localizes countdown %s minutes without changing the window', (minutes, key, values) => {
    render(<UpcomingLiveStrip events={[eventIn(minutes)]} hasAnyEnrollment />, options);
    expect(screen.getByText(t(key, values))).toBeInTheDocument();
    expect(screen.getByText(minutes < 0 ? `● ${copy.live}` : copy.starts)).toBeInTheDocument();
  });

  it('translates upcoming card, dates, course count and calendar action while preserving ICS content', () => {
    const event = { ...base, courses: [...base.courses, { id: 'two', title: 'Another authored course', slug: 'another-course' }] };
    render(<UpcomingLiveCard liveClass={upcoming(event)} />, options);
    expect(screen.getByText(copy.upcomingClass)).toBeInTheDocument();
    expect(screen.getByText(t('coursesMore', { title: base.courseTitle, count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t('countdown.hoursMinutes', { hours: 3, minutes: 24 }))).toBeInTheDocument();
    expect(screen.getByText(t('localTime', { time: `${formatInZone(base.startsAt, 'America/Sao_Paulo', { weekday: 'short', month: 'short', day: 'numeric' }, locale)} · ${formatTimeInZone(base.startsAt, 'America/Sao_Paulo', locale)}` }))).toBeInTheDocument();
    const calendar = screen.getByRole('link', { name: copy.addCalendar });
    expect(calendar).toHaveAttribute('download', 'authored-english-event.ics');
    const payload = decodeURIComponent(calendar.getAttribute('href')!.split(',')[1]);
    expect(payload).toContain(`SUMMARY:${base.title}\r\n`);
    expect(payload).toContain(`DESCRIPTION:${base.description}\r\n`);
    expect(payload).toContain('DTSTART:20260912T152400Z\r\nDTEND:20260912T162400Z');
    expect(payload).toContain(`URL:${base.meetingUrl}`);
    clickLink(screen.getByRole('link', { name: copy.openMeeting }));
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith(base.id, 'banner');
  });

  it('transitions imminent to live and removes an ended card without stale English copy', () => {
    render(<UpcomingLiveCard liveClass={upcoming(eventIn(1.5, { durationMinutes: 1 }))} />, options);
    expect(screen.getByText(t('countdown.starting', { time: '01:30' }))).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(91_000));
    expect(screen.getByText(copy.liveNow)).toBeInTheDocument();
    expect(screen.getByText(t('elapsed', { time: '0:01' }))).toBeInTheDocument();
    expect(screen.getByText(t('scheduled', { minutes: 1 }))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.join })).toHaveAttribute('href', base.meetingUrl);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('formats elapsed hours in the product locale', () => {
    render(<UpcomingLiveCard liveClass={upcoming(eventIn(-70, { durationMinutes: 90 }))} />, options);
    expect(screen.getByText(t('elapsed', { time: t('elapsedHours', { hours: 1, minutes: '10' }) }))).toBeInTheDocument();
  });

  it('localizes legacy calendar navigation, week labels, event counts and empty month', () => {
    const events = [base, { ...base, id: 'two', title: 'Second authored event' }, { ...base, id: 'three', title: 'Third authored event' }];
    render(<LiveClassesCalendar events={events} hasAnyEnrollment />, options);
    const month = now.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    expect(screen.getByRole('grid', { name: t('calendar.grid', { month }) })).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    expect(screen.getByRole('gridcell', { name: t('calendar.dayEvents', { date: now.toLocaleDateString(locale, { dateStyle: 'full' }), count: 3 }) })).toBeInTheDocument();
    expect(screen.getByText(t('calendar.more', { count: 1 }))).toBeInTheDocument();
    const monday = new Date('2024-01-01T00:00:00Z').toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
    expect(screen.getAllByText(monday).length).toBeGreaterThan(0);
    expect(screen.getAllByText(base.description!)).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: copy.addCalendar })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: copy.calendar.next }));
    const nextMonth = new Date(2026, 9, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    expect(screen.getByText(t('calendar.empty', { month: nextMonth }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.calendar.today }));
    expect(screen.getByRole('grid', { name: t('calendar.grid', { month }) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.calendar.previous }));
    expect(screen.getByRole('button', { name: copy.calendar.today })).toBeInTheDocument();
  });

  it('localizes legacy calendar enrollment invitation', () => {
    render(<LiveClassesCalendar events={[]} hasAnyEnrollment={false} />, options);
    expect(screen.getByText(copy.calendar.enrollTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.calendar.enrollDescription)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.browseCatalog })).toHaveAttribute('href', '/courses');
  });
});

describe('Presentation locale does not change technical dates', () => {
  it('formats a non-UTC date in each requested locale, independent of browser defaults', () => {
    expect(formatInZone('2026-09-13T01:00:00Z', 'America/Sao_Paulo', { weekday: 'long', month: 'long', day: 'numeric' }, 'en')).toBe('Saturday, September 12');
    expect(formatInZone('2026-09-13T01:00:00Z', 'America/Sao_Paulo', { weekday: 'long', month: 'long', day: 'numeric' }, 'pt')).toBe('sábado, 12 de setembro');
    expect(formatInZone('2026-09-13T01:00:00Z', 'America/Sao_Paulo', { weekday: 'long', month: 'long', day: 'numeric' }, 'es')).toBe('sábado, 12 de septiembre');
    expect(formatTimeInZone('2026-09-13T01:00:00Z', 'America/Sao_Paulo', 'pt')).toBe('22:00 BRT');
  });

  it('preserves daylight-saving conversion, UTC dates and authored escaping in ICS', () => {
    expect(zonedWallClockToUtcIso('2026-05-01T18:30', 'Europe/London')).toBe('2026-05-01T17:30:00.000Z');
    expect(zonedWallClockToUtcIso('2026-01-01T18:30', 'Europe/London')).toBe('2026-01-01T18:30:00.000Z');
    expect(offsetMinutes('America/Sao_Paulo', now)).toBe(-180);
    const payload = decodeURIComponent(buildIcsDataUrl({ id: 'own-id', title: 'Authored, title; one', description: 'Line one\nLine two', startsAt: '2026-09-12T23:30:00Z', durationMinutes: 90, url: base.meetingUrl }).split(',')[1]);
    expect(payload).toContain('DTSTART:20260912T233000Z\r\nDTEND:20260913T010000Z');
    expect(payload).toContain('SUMMARY:Authored\\, title\\; one');
    expect(payload).toContain('DESCRIPTION:Line one\\nLine two');
    expect(payload).toContain('UID:own-id@members-live-class');
  });
});
