import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/liveClasses.json';
import pt from '@/core/i18n/locales/pt/liveClasses.json';
import es from '@/core/i18n/locales/es/liveClasses.json';
import { UpcomingLiveCard } from './UpcomingLiveCard';
import { UpcomingLiveStrip } from './UpcomingLiveStrip';
import { LiveClassesCalendar } from './LiveClassesCalendar';
import type { UpcomingLiveClass } from '../types';

const catalogs = { en, pt, es };
const serverNow = new Date('2026-09-01T00:30:00Z');
const event: UpcomingLiveClass = {
  id: 'fixture-event', title: 'Authored event', description: 'Authored description',
  startsAt: '2026-09-01T00:31:00Z', durationMinutes: 60,
  meetingUrl: 'https://example.test/meeting', originTimezone: 'Europe/London',
  createdAt: serverNow.toISOString(), updatedAt: serverNow.toISOString(),
  courses: [{ id: 'course', title: 'Authored course', slug: 'authored-course' }],
  courseId: 'course', courseTitle: 'Authored course', courseSlug: 'authored-course',
  msUntilStart: 60_000, isLive: false,
};
let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(serverNow);
  // The real browser-timezone hook returns null on the server and this zone after hydration.
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) {
    return new OriginalDateTimeFormat(locales, options ?? { timeZone: 'America/Sao_Paulo' });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['en', 'pt', 'es'] as const)('Live class SSR hydration in %s', locale => {
  const t = createTranslator({ locale, messages: catalogs[locale] });

  it('hydrates the same request clock despite a later browser clock, then transitions to live', async () => {
    const tree = <NextIntlClientProvider locale={locale} messages={{ liveClasses: catalogs[locale] }} now={serverNow} timeZone="UTC">
      <UpcomingLiveCard liveClass={event} />
      <UpcomingLiveStrip events={[event]} hasAnyEnrollment />
    </NextIntlClientProvider>;
    container.innerHTML = renderToString(tree);
    expect(container).toHaveTextContent(t('countdown.starting', { time: '01:00' }));
    expect(container).toHaveTextContent(t('countdown.minutes', { count: 1 }));
    vi.setSystemTime(new Date('2026-09-01T00:31:30Z'));
    const onRecoverableError = vi.fn();
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError }); });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container).toHaveTextContent(t('countdown.starting', { time: '01:00' }));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(container).toHaveTextContent(catalogs[locale].liveNow);
    expect(container).not.toHaveTextContent(t('countdown.starting', { time: '01:00' }));
    expect(container.querySelectorAll('a a')).toHaveLength(0);
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it('uses one civil timezone for the current month, event grouping and date labels', async () => {
    const tree = <NextIntlClientProvider locale={locale} messages={{ liveClasses: catalogs[locale] }} now={serverNow} timeZone="UTC">
      <LiveClassesCalendar events={[event]} hasAnyEnrollment />
    </NextIntlClientProvider>;
    container.innerHTML = renderToString(tree);
    const september = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(serverNow);
    expect(container.querySelector('[role="grid"]')).toHaveAccessibleName(t('calendar.grid', { month: september }));
    const onRecoverableError = vi.fn();
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError }); });
    const augustDate = new Date('2026-08-31T00:00:00Z');
    const august = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(augustDate);
    expect(container.querySelector('[role="grid"]')).toHaveAccessibleName(t('calendar.grid', { month: august }));
    const dayLabel = t('calendar.dayEvents', { date: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', dateStyle: 'full' }).format(augustDate), count: 1 });
    const eventCell = Array.from(container.querySelectorAll('[role="gridcell"]')).find(cell => cell.getAttribute('aria-label') === dayLabel);
    expect(eventCell).toHaveTextContent('Authored event');
    // Agenda stays in the visible local month even though the event's UTC date is September 1.
    expect(container.querySelector('ul')).toHaveTextContent('Authored description');
    expect(container).not.toHaveTextContent(t('calendar.empty', { month: august }));
    expect(onRecoverableError).not.toHaveBeenCalled();
  });
});
