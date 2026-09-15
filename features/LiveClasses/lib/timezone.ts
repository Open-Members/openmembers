/**
 * Timezone helpers — convert admin-entered wall clock values to UTC
 * correctly regardless of the admin's browser zone, and format stored
 * UTC instants back into any IANA zone for display.
 *
 * No new dependencies; uses `Intl.DateTimeFormat` end-to-end.
 */

/** Curated shortlist surfaced at the top of the admin picker. */
export const CURATED_TIMEZONES: Array<{ id: string; label: string }> = [
  { id: 'Europe/London',       label: 'London (UK)' },
  { id: 'Europe/Lisbon',       label: 'Lisbon (Portugal)' },
  { id: 'Europe/Madrid',       label: 'Madrid (Spain)' },
  { id: 'Europe/Berlin',       label: 'Berlin (Germany)' },
  { id: 'UTC',                 label: 'UTC' },
  { id: 'America/Sao_Paulo',   label: 'São Paulo (Brazil)' },
  { id: 'America/New_York',    label: 'New York (US East)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (US West)' },
  { id: 'Asia/Tokyo',          label: 'Tokyo (Japan)' },
  { id: 'Asia/Singapore',      label: 'Singapore' },
  { id: 'Asia/Kolkata',        label: 'Mumbai / Delhi (India)' },
  { id: 'Australia/Sydney',    label: 'Sydney (Australia)' },
];

export const DEFAULT_ORIGIN_TIMEZONE = 'Europe/London';

/** Full list of every IANA zone the runtime supports. Empty on older targets. */
export function getAllTimezones(): string[] {
  try {
    // supportedValuesOf is modern; falls back to [] on ancient runtimes.
    const fn = (Intl as unknown as {
      supportedValuesOf?: (k: string) => string[];
    }).supportedValuesOf;
    return fn ? fn('timeZone') : [];
  } catch {
    return [];
  }
}

/** "18:30" on May 1 2026 in "Europe/London" → the exact UTC instant. */
export function zonedWallClockToUtcIso(wallLocal: string, tz: string): string {
  const match = wallLocal.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return new Date(wallLocal).toISOString();
  const [, y, mo, d, h, mi, s] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = s ? Number(s) : 0;

  // First guess: treat the wall clock as if it were UTC.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Then measure what offset that instant has in the target zone, and
  // shift. One step is always enough unless the wall clock lands in a
  // DST gap — for a ±1h correction that second pass catches.
  const offset1 = offsetMinutes(tz, new Date(utcGuess));
  let result = utcGuess - offset1 * 60_000;
  const offset2 = offsetMinutes(tz, new Date(result));
  if (offset2 !== offset1) {
    result = utcGuess - offset2 * 60_000;
  }
  return new Date(result).toISOString();
}

/** Offset in minutes that `tz` is ahead of UTC at `date` (e.g. +60 for BST). */
export function offsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Format a UTC instant in a target zone, e.g. "Fri, May 1 · 6:30 PM BST". */
export function formatInZone(
  utcIso: string,
  tz: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  },
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz }).format(
    new Date(utcIso),
  );
}

/** Short time only — "6:30 PM BST". */
export function formatTimeInZone(utcIso: string, tz: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(utcIso));
}

/** Safe lookup of the browser's IANA zone. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
