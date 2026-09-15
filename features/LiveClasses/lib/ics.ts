/**
 * Build a minimal iCalendar (.ics) data URL for a live class. Apple
 * Calendar, Google Calendar, and Outlook all accept the same payload
 * when served via `data:text/calendar` with a `download` attribute.
 *
 * Lines are CRLF-joined per RFC 5545; the `UID` pairs with the class
 * row so re-adding the same event updates the user's existing entry
 * instead of creating a duplicate.
 */
type BuildIcsInput = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string; // ISO
  durationMinutes: number;
  url: string;
};

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toIcsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function icsEscape(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildIcsDataUrl(input: BuildIcsInput): string {
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const lines: Array<string | null> = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Open Members//Live Class//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.id}@members-live-class`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    input.description ? `DESCRIPTION:${icsEscape(input.description)}` : null,
    `URL:${input.url}`,
    `LOCATION:${input.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const payload = lines.filter((l): l is string => l !== null).join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(payload)}`;
}

export function icsFileName(title: string): string {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'live-class';
  return `${safe}.ics`;
}
