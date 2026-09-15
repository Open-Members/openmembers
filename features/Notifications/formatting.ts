function calendarParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function notificationDay(iso: string, now: Date, locale: string, timeZone: string, labels: { today: string; yesterday: string; unknownDate: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { key: 'unknown', label: labels.unknownDate };
  const current = calendarParts(now, timeZone);
  const day = calendarParts(date, timeZone);
  const key = `${day.year}-${day.month}-${day.day}`;
  const today = `${current.year}-${current.month}-${current.day}`;
  const yesterday = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) - 1)).toISOString().slice(0, 10);
  if (key === today) return { key, label: labels.today };
  if (key === yesterday) return { key, label: labels.yesterday };
  return { key, label: new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric', year: current.year !== day.year ? 'numeric' : undefined, timeZone }).format(date) };
}

export function notificationTime(iso: string, locale: string, timeZone: string, unknownDate: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? unknownDate : new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(date);
}

export function notificationTimeAgo(iso: string, now: Date, locale: string, justNow: string, unknownDate: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return unknownDate;
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return justNow;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  if (minutes < 1440) return formatter.format(-Math.floor(minutes / 60), 'hour');
  return formatter.format(-Math.floor(minutes / 1440), 'day');
}
