// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { notificationDay, notificationTime, notificationTimeAgo } from './formatting';
const labels = { today: 'Today fixture', yesterday: 'Yesterday fixture', unknownDate: 'Unknown fixture' };
describe.each(['en', 'pt', 'es'])('notification dates in %s', locale => {
  it('groups by browser calendar day and formats time in that same zone', () => {
    const now = new Date('2026-09-12T02:00:00Z');
    const iso = '2026-09-11T23:30:00Z';
    expect(notificationDay(iso, now, locale, 'America/Sao_Paulo', labels)).toEqual({ key: '2026-09-11', label: labels.today });
    expect(notificationDay(iso, now, locale, 'UTC', labels)).toEqual({ key: '2026-09-11', label: labels.yesterday });
    expect(notificationTime(iso, locale, 'America/Sao_Paulo', labels.unknownDate)).toBe(new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)));
  });
  it('handles month/year transitions and daylight saving by calendar date', () => {
    expect(notificationDay('2025-12-31T18:00:00Z', new Date('2026-01-01T15:00:00Z'), locale, 'America/New_York', labels).label).toBe(labels.yesterday);
    expect(notificationDay('2026-03-08T12:00:00Z', new Date('2026-03-09T12:00:00Z'), locale, 'America/New_York', labels).label).toBe(labels.yesterday);
  });
  it('localizes older dates and relative time, safely handling invalid timestamps', () => {
    const date = '2025-09-01T12:00:00Z';
    expect(notificationDay(date, new Date('2026-09-12T12:00:00Z'), locale, 'UTC', labels).label).toBe(new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date)));
    expect(notificationTimeAgo('2026-09-12T11:58:00Z', new Date('2026-09-12T12:00:00Z'), locale, 'Now fixture', labels.unknownDate)).toBe(new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-2, 'minute'));
    expect(notificationDay('invalid', new Date(), locale, 'UTC', labels).label).toBe(labels.unknownDate);
    expect(notificationTime('invalid', locale, 'UTC', labels.unknownDate)).toBe(labels.unknownDate);
  });
});
