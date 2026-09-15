import { describe, expect, it } from 'vitest';
import { locales } from './config';
import en from './locales/en';
import es from './locales/es';
import pt from './locales/pt';
import { messageLeaves } from './audit/catalog-utils';
import { openDynamicCatalogDomains } from './audit/open-dynamic-domains';
import { commentErrorCodes } from '@/features/Comments/errors';
import { notificationErrorCodes } from '@/features/Notifications/errors';
import {
  adminCommandGroups,
  adminNavGroups,
} from '@/shared/components/navigation/adminNav';
import { FONT_CATALOG } from '@/core/theme/branding';
import { WEBHOOK_PROVIDERS } from '@/lib/webhooks/providers';
import { localizeWebhookProvider } from '@/features/Admin/operations-presentation';
import { contentErrorCodes } from '@/features/Admin/content-errors';
import { ADMIN_EMAIL_TEMPLATE_CATALOG } from '@/features/Admin/email-template-catalog';
import { knownEmailEventTypes } from '@/features/Admin/report-i18n';
import { videoErrorCodes } from '@/features/Courses/media-i18n';
import { EMAIL_TEMPLATE_DEFAULTS } from '@/lib/services/email/templates/localization';
import type { ChatError } from '@/features/CourseChat/errors';
import type { SupportActionErrorCode } from '@/features/Support/actions';
import type { SupportTicketStatus } from '@/features/Support/types';
import type { BroadcastErrorCode } from '@/features/Notifications/admin-actions';
import type { ActivityKind } from '@/features/Admin/user-detail-queries';
import type {
  AdminDeadLetter,
  WebhookAnomaly,
} from '@/features/Admin/actions';
import type { RowType } from '@/features/Collections/types';
import type {
  NotificationType,
  UserRole,
  UserStatus,
} from '@/shared/types/interfaces';
import type { WebhookProviderId } from '@/lib/webhooks/providers';
import type { logWebhook } from '@/lib/webhooks/processor';
import type {
  changePassword,
  deleteAccount,
  requestEmailChange,
  saveAvatarUrl,
  updateAutoplayPreference,
  updateDisplayName,
  updatePreferredLanguage,
} from '@/features/Settings/actions';

const catalogs = { en, es, pt } as const;

type ErrorCode<Result> = Result extends { error: infer Code extends string }
  ? Code
  : never;

type ActionError<Action> = Action extends (...args: never[]) => infer Result
  ? ErrorCode<Awaited<Result>>
  : never;

type SettingsActionError =
  | ActionError<typeof saveAvatarUrl>
  | ActionError<typeof updateDisplayName>
  | ActionError<typeof requestEmailChange>
  | ActionError<typeof changePassword>
  | ActionError<typeof updatePreferredLanguage>
  | ActionError<typeof updateAutoplayPreference>
  | ActionError<typeof deleteAccount>;

const chatErrors = {
  sendFailed: true,
  resumeFailed: true,
  historyFailed: true,
  loadFailed: true,
  deleteFailed: true,
  archiveFailed: true,
  notConfigured: true,
  notAuthenticated: true,
  accessDenied: true,
  notFound: true,
  rateLimited: true,
  contextUnavailable: true,
  secretDetected: true,
  invalidQuestion: true,
  unavailable: true,
  noResponse: true,
  interrupted: true,
} satisfies Record<ChatError, true>;

const supportErrors = {
  notAuthenticated: true,
  accountInactive: true,
  notAuthorized: true,
  invalidInput: true,
  notFound: true,
  operationFailed: true,
} satisfies Record<SupportActionErrorCode, true>;

const supportStatuses = {
  open: true,
  in_progress: true,
  closed: true,
} satisfies Record<SupportTicketStatus, true>;

const broadcastErrors = {
  invalidInput: true,
  titleRequired: true,
  messageRequired: true,
  titleTooLong: true,
  messageTooLong: true,
  invalidActionUrl: true,
  noAudience: true,
  operationFailed: true,
} satisfies Record<BroadcastErrorCode, true>;

const notificationFilters = {
  all: true,
  enrollment: true,
  drip_unlock: true,
  comment_reply: true,
  announcement: true,
  new_course: true,
  new_lesson: true,
  certificate: true,
} satisfies Record<'all' | NotificationType, true>;

const userRoles = {
  user: true,
  admin: true,
  super_admin: true,
} satisfies Record<UserRole, true>;

const userStatuses = {
  active: true,
  suspended: true,
} satisfies Record<UserStatus, true>;

const activityKinds = {
  lesson_completed: true,
  rating_given: true,
  enrollment_new: true,
  chat_started: true,
  live_class_clicked: true,
} satisfies Record<ActivityKind, true>;

const rowTypes = {
  manual: true,
  continue_watching: true,
  enrolled: true,
  featured: true,
  new: true,
  free: true,
} satisfies Record<RowType, true>;

const providerIds = {
  stripe: true,
  guru: true,
  generic: true,
} satisfies Record<WebhookProviderId, true>;

const retryStatuses = {
  pending: true,
  processed: true,
  abandoned: true,
} satisfies Record<AdminDeadLetter['status'], true>;

const anomalyKinds = {
  probing: true,
  retry_storm: true,
} satisfies Record<WebhookAnomaly['kind'], true>;

const settingsActionErrors = {
  notAuthenticated: true,
  invalidAvatar: true,
  saveAvatar: true,
  invalidName: true,
  updateName: true,
  invalidEmail: true,
  currentEmail: true,
  updateEmail: true,
  invalidPassword: true,
  updatePassword: true,
  unsupportedLanguage: true,
  updateLanguage: true,
  updatePreference: true,
  deleteAccount: true,
} satisfies Record<SettingsActionError, true>;

type WebhookLogStatus = Parameters<typeof logWebhook>[0]['status'];
const webhookLogStatuses = {
  received: true,
  processed: true,
  failed: true,
} satisfies Record<WebhookLogStatus, true>;

function keysOf<T extends string>(record: Record<T, true>): T[] {
  return Object.keys(record) as T[];
}

const closedDomains: Array<{ name: string; keys: string[] }> = [
  {
    name: 'comment action errors',
    keys: commentErrorCodes.map((key) => `comments.errors.${key}`),
  },
  {
    name: 'notification action errors',
    keys: notificationErrorCodes.map((key) => `notifications.errors.${key}`),
  },
  {
    name: 'notification filters',
    keys: keysOf(notificationFilters).map((key) => `notifications.filters.${key}`),
  },
  {
    name: 'profile language options',
    keys: locales.map((locale) => `settings.language.options.${locale}`),
  },
  {
    name: 'settings action errors',
    keys: keysOf(settingsActionErrors).map((key) => `settings.errors.${key}`),
  },
  {
    name: 'self-hosted video errors',
    keys: videoErrorCodes.map((key) => `learningMedia.video.errors.${key}`),
  },
  {
    name: 'course chat errors',
    keys: keysOf(chatErrors).map((key) => `courseChat.errors.${key}`),
  },
  {
    name: 'support action errors',
    keys: keysOf(supportErrors).map(
      (key) => `support.admin.detail.errors.${key}`,
    ),
  },
  {
    name: 'support statuses',
    keys: keysOf(supportStatuses).map((key) => `support.status.${key}`),
  },
  {
    name: 'announcement errors',
    keys: keysOf(broadcastErrors).map(
      (key) => `adminOperations.errors.${key}`,
    ),
  },
  {
    name: 'admin content errors',
    keys: contentErrorCodes.map((key) => `adminContent.errors.${key}`),
  },
  {
    name: 'admin user roles',
    keys: keysOf(userRoles).map((key) => `adminPeople.roles.${key}`),
  },
  {
    name: 'admin user statuses',
    keys: keysOf(userStatuses).map((key) => `adminPeople.statuses.${key}`),
  },
  {
    name: 'admin activity kinds',
    keys: keysOf(activityKinds).map((key) => `adminPeople.activity.${key}`),
  },
  {
    name: 'home row types',
    keys: keysOf(rowTypes).map(
      (key) => `adminOperations.home.types.${key}.source`,
    ),
  },
  {
    name: 'branding fonts',
    keys: Object.keys(FONT_CATALOG).map(
      (key) => `adminOperations.branding.identity.fonts.${key}`,
    ),
  },
  {
    name: 'webhook retry statuses',
    keys: keysOf(retryStatuses).map(
      (key) => `adminOperations.integrations.retries.status.${key}`,
    ),
  },
  {
    name: 'webhook log statuses',
    keys: keysOf(webhookLogStatuses).map(
      (key) => `adminOperations.integrations.status.${key}`,
    ),
  },
  {
    name: 'webhook anomaly kinds',
    keys: keysOf(anomalyKinds).map(
      (key) => `adminOperations.integrations.anomalies.${key}`,
    ),
  },
  {
    name: 'admin command groups',
    keys: adminCommandGroups.map(
      (key) => `navigation.commands.groups.${key}`,
    ),
  },
  {
    name: 'known email report events',
    keys: knownEmailEventTypes.map((key) => `adminReports.emailEvents.${key}`),
  },
  ...openDynamicCatalogDomains.map(({ name, namespace, knownValues }) => ({
    name,
    keys: knownValues.map((value) => `${namespace}.${value}`),
  })),
];

function webhookTranslationKeys(): string[] {
  const requested = new Set<string>();
  const translate = ((key: string) => {
    requested.add(`adminOperations.${key}`);
    return key;
  }) as ((key: string) => string) & { has(key: string): boolean };
  translate.has = () => true;

  for (const provider of WEBHOOK_PROVIDERS) {
    localizeWebhookProvider(provider, translate);
  }
  return [...requested].sort();
}

describe('closed dynamic translation-key domains', () => {
  it('keeps every declared webhook provider represented in its runtime registry', () => {
    expect(WEBHOOK_PROVIDERS.map(({ id }) => id).sort()).toEqual(
      keysOf(providerIds).sort(),
    );
  });

  it('keeps admin navigation registry keys present', () => {
    const navigationKeys = adminNavGroups.flatMap((group) => [
      `navigation.${group.labelKey}`,
      ...group.items.map((item) => `navigation.${item.labelKey}`),
    ]);
    for (const locale of locales) {
      const leaves = messageLeaves(catalogs[locale]);
      expect(
        navigationKeys.filter((key) => !Object.hasOwn(leaves, key)),
        `${locale} admin navigation`,
      ).toEqual([]);
    }
  });

  it.each(closedDomains)('keeps $name keys present in EN/PT/ES', ({ name, keys }) => {
    for (const locale of locales) {
      const leaves = messageLeaves(catalogs[locale]);
      expect(
        keys.filter((key) => !Object.hasOwn(leaves, key)),
        `${locale} ${name}`,
      ).toEqual([]);
    }
  });

  it('covers every provider key requested by the localization adapter', () => {
    const keys = webhookTranslationKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of locales) {
      const leaves = messageLeaves(catalogs[locale]);
      expect(
        keys.filter((key) => !Object.hasOwn(leaves, key)),
        `${locale} webhook provider copy`,
      ).toEqual([]);
    }
  });

  it('keeps dynamic admin email descriptor keys and fields translated', () => {
    const descriptorKeys = ADMIN_EMAIL_TEMPLATE_CATALOG.map(({ key }) => key);
    expect(new Set(descriptorKeys).size).toBe(descriptorKeys.length);

    const keys = ADMIN_EMAIL_TEMPLATE_CATALOG.flatMap((template) => {
      const fieldKeys = template.fields.map(({ key }) => key);
      expect(new Set(fieldKeys).size, `${template.key} fields`).toBe(
        fieldKeys.length,
      );
      expect(fieldKeys.slice().sort(), `${template.key} content contract`).toEqual(
        Object.keys(EMAIL_TEMPLATE_DEFAULTS[template.key].en).sort(),
      );
      return [
        `adminOperations.email.templates.catalog.${template.key}.name`,
        `adminOperations.email.templates.catalog.${template.key}.description`,
        ...fieldKeys.map(
          (field) =>
            `adminOperations.email.templates.catalog.${template.key}.fields.${field}`,
        ),
      ];
    });

    for (const locale of locales) {
      const leaves = messageLeaves(catalogs[locale]);
      expect(
        keys.filter((key) => !Object.hasOwn(leaves, key)),
        `${locale} admin email catalog`,
      ).toEqual([]);
    }
  });

  it('keeps every open dynamic domain classified with an explicit fallback', () => {
    for (const domain of openDynamicCatalogDomains) {
      expect(domain.knownValues.length, domain.name).toBeGreaterThan(0);
      expect(domain.fallback.trim(), domain.name).not.toBe('');
    }
  });
});
