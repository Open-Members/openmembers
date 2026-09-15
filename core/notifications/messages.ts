import { isLocale, type Locale } from '@/core/i18n/config';
import en from '@/core/i18n/locales/en/notifications.json';
import es from '@/core/i18n/locales/es/notifications.json';
import pt from '@/core/i18n/locales/pt/notifications.json';

export type NotificationMessageParams = {
  'enrollment.singleCourse': { levelName: string; courseTitle: string };
  'enrollment.dashboard': { levelName: string };
  'content.coursePublished': { courseTitle: string };
  'content.lessonPublished': { courseTitle: string; lessonTitle: string };
  'content.dripLesson': { courseTitle: string; contentTitle: string };
  'content.dripModule': { courseTitle: string; contentTitle: string };
  'content.dripCourse': { courseTitle: string };
  'engagement.commentReply': { replierName: string; excerpt: string };
  'engagement.commentReplyAnonymous': { excerpt: string };
  'engagement.certificateEarned': { courseTitle: string };
};

export type NotificationMessageKey = keyof NotificationMessageParams;

export type NotificationDescriptor = {
  [Key in NotificationMessageKey]: {
    key: Key;
    params: NotificationMessageParams[Key];
  };
}[NotificationMessageKey];

type MessageSpec<Key extends NotificationMessageKey> = {
  params: readonly (keyof NotificationMessageParams[Key])[];
  path: string;
};

const specs: { [Key in NotificationMessageKey]: MessageSpec<Key> } = {
  'enrollment.singleCourse': { params: ['levelName', 'courseTitle'], path: 'automatic.enrollment.singleCourse' },
  'enrollment.dashboard': { params: ['levelName'], path: 'automatic.enrollment.dashboard' },
  'content.coursePublished': { params: ['courseTitle'], path: 'automatic.content.coursePublished' },
  'content.lessonPublished': { params: ['courseTitle', 'lessonTitle'], path: 'automatic.content.lessonPublished' },
  'content.dripLesson': { params: ['courseTitle', 'contentTitle'], path: 'automatic.content.dripLesson' },
  'content.dripModule': { params: ['courseTitle', 'contentTitle'], path: 'automatic.content.dripModule' },
  'content.dripCourse': { params: ['courseTitle'], path: 'automatic.content.dripCourse' },
  'engagement.commentReply': { params: ['replierName', 'excerpt'], path: 'automatic.engagement.commentReply' },
  'engagement.commentReplyAnonymous': { params: ['excerpt'], path: 'automatic.engagement.commentReplyAnonymous' },
  'engagement.certificateEarned': { params: ['courseTitle'], path: 'automatic.engagement.certificateEarned' },
};

const catalogs: Record<Locale, unknown> = { en, es, pt };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(root: unknown, path: string): string | null {
  let value = root;
  for (const segment of path.split('.')) {
    if (!isRecord(value)) return null;
    value = value[segment];
  }
  return typeof value === 'string' ? value : null;
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (token, name: string) =>
    Object.hasOwn(params, name) ? params[name] : token,
  );
}

export function parseNotificationDescriptor(key: unknown, params: unknown): NotificationDescriptor | null {
  if (typeof key !== 'string' || !Object.hasOwn(specs, key) || !isRecord(params)) return null;
  const typedKey = key as NotificationMessageKey;
  const expected = specs[typedKey].params as readonly string[];
  const actual = Object.keys(params);
  if (
    actual.length !== expected.length ||
    actual.some((name) => !expected.includes(name)) ||
    expected.some((name) => {
      const value = params[name];
      return typeof value !== 'string' || value.length === 0 || value.length > 1_000;
    })
  ) return null;
  return { key: typedKey, params } as NotificationDescriptor;
}

export function renderNotificationDescriptor(
  descriptor: NotificationDescriptor,
  requestedLocale: unknown,
): { title: string; message: string } | null {
  const parsed = parseNotificationDescriptor(descriptor.key, descriptor.params);
  if (!parsed) return null;
  const spec = specs[parsed.key];
  const locale = isLocale(requestedLocale) ? requestedLocale : 'en';
  const params = parsed.params as Record<string, string>;
  const title = readString(catalogs[locale], `${spec.path}.title`) ?? readString(catalogs.en, `${spec.path}.title`);
  const message = readString(catalogs[locale], `${spec.path}.message`) ?? readString(catalogs.en, `${spec.path}.message`);
  if (!title || !message) return null;
  return { title: interpolate(title, params), message: interpolate(message, params) };
}

export function resolveNotificationContent(
  notification: {
    title: string | null;
    message: string;
    messageKey?: string | null;
    messageParams?: Record<string, unknown> | null;
  },
  locale: unknown,
): { title: string | null; message: string } {
  const descriptor = parseNotificationDescriptor(notification.messageKey, notification.messageParams);
  if (!descriptor) return { title: notification.title, message: notification.message };
  return renderNotificationDescriptor(descriptor, locale) ?? { title: notification.title, message: notification.message };
}
