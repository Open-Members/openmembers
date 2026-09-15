import type { Locale } from '@/core/i18n/config';

export const equalityReasonDescriptions = {
  sharedVocabulary:
    'The same spelling is established vocabulary in the target locale.',
  productOrProtocolName:
    'This is a product, provider, protocol, or standardized technical name.',
  machineTokenOrExample:
    'This is a machine-facing token, example value, or keyboard label.',
  localeNeutralNotation:
    'This numeric, unit, punctuation, or ICU-only notation is locale-neutral here.',
  runtimePassthrough:
    'The message intentionally contains only authored runtime content.',
  optionalEmailSectionDisabled:
    'This optional email section is intentionally disabled with an empty default.',
  organizationNameSignoff:
    'The sign-off intentionally contains only the authored organization name.',
} as const;

export type EqualityReason = keyof typeof equalityReasonDescriptions;
export type AuditedLocale = Exclude<Locale, 'en'>;
export type EqualityGroups = Partial<
  Record<EqualityReason, readonly string[]>
>;

/**
 * Exact exceptions for JSON messages whose complete value may equal English.
 * Moving a key between groups is a reviewed change because each group explains
 * why leaving that specific locale + key unchanged is intentional.
 */
export const catalogEqualityAllowlist = {
  pt: {
    sharedVocabulary: [
      'adminAccess.status',
      'adminAccess.sources.manual',
      'adminOperations.home.header.eyebrow',
      'adminOperations.integrations.logs.columns.status',
      'adminOperations.integrations.retries.columns.status',
      'adminOverview.sources.manual',
      'adminPeople.status',
      'adminPeople.sources.manual',
      'adminReports.sources.manual',
      'certificates.admin.visualSection',
      'certificates.admin.logo',
      'learningMedia.video.volume',
      'learningMedia.video.normalSpeed',
      'learningOverview.stats.total',
      'navigation.adminItems.menu',
      'support.list.columns.status',
      'support.admin.columns.status',
      'support.admin.detail.statusLabel',
    ],
    productOrProtocolName: [
      'adminAccess.sources.youtube',
      'adminAccess.sources.webhook',
      'adminAccess.sources.hotmart',
      'adminAccess.sources.stripe',
      'adminAccess.sources.guru',
      'adminOperations.branding.identity.favicon',
      'adminOverview.sources.webhook',
      'adminOverview.sources.youtube',
      'adminOverview.sources.hotmart',
      'adminOverview.sources.stripe',
      'adminOverview.sources.guru',
      'adminOverview.emailEvents.spam',
      'adminPeople.sources.youtube',
      'adminPeople.sources.webhook',
      'adminPeople.sources.hotmart',
      'adminPeople.sources.stripe',
      'adminPeople.sources.guru',
      'adminReports.sources.webhook',
      'adminReports.sources.stripe',
      'adminReports.sources.guru',
      'adminReports.emailEvents.spam',
    ],
    machineTokenOrExample: [
      'adminAccess.slug',
      'adminAccess.tags',
      'adminContent.slug',
      'adminOperations.menu.dialog.url',
      'adminOperations.integrations.providers.stripe.secretPlaceholder',
      'adminOperations.integrations.providers.stripe.productIdPlaceholder',
      'adminOperations.integrations.providers.guru.producerIdPlaceholder',
      'adminOperations.integrations.providers.generic.productIdPlaceholder',
      'courseChat.input.enter',
      'courseChat.input.shiftEnter',
    ],
    localeNeutralNotation: [
      'adminContent.minutes',
      'adminOverview.pointsCount',
      'adminOverview.customRange',
      'adminPeople.filterValue',
      'adminReports.pointsUnit',
      'adminReports.pointsCount',
      'adminReports.customRange',
      'adminReports.metricShare',
      'footer.copyright',
      'learning.modules.minutes',
      'learning.modules.hours',
      'learning.modules.hoursMinutes',
      'learning.progress.module',
      'learningMedia.video.rate',
      'learningMedia.video.seekSeconds',
      'learningOverview.duration.hoursMinutes',
      'learningOverview.duration.hours',
      'learningOverview.duration.minutes',
      'learningOverview.duration.minutesSeconds',
      'learningOverview.duration.seconds',
      'learningOverview.stats.minutes',
      'liveClasses.duration',
      'notifications.badgeOverflow',
    ],
    runtimePassthrough: [
      'notifications.automatic.engagement.commentReply.message',
      'notifications.automatic.engagement.commentReplyAnonymous.message',
    ],
  },
  es: {
    sharedVocabulary: [
      'adminAccess.sources.manual',
      'adminContent.instructor',
      'adminOperations.integrations.logs.columns.error',
      'adminOverview.sources.manual',
      'adminPeople.error',
      'adminPeople.sources.manual',
      'adminReports.sources.manual',
      'learningMedia.video.normalSpeed',
      'learningOverview.stats.total',
      'settings.danger.eyebrow',
      'system.pageError.eyebrow',
      'system.notFound.eyebrow',
    ],
    productOrProtocolName: [
      'adminAccess.sources.youtube',
      'adminAccess.sources.webhook',
      'adminAccess.sources.hotmart',
      'adminAccess.sources.stripe',
      'adminAccess.sources.guru',
      'adminOperations.branding.identity.favicon',
      'adminOverview.sources.webhook',
      'adminOverview.sources.youtube',
      'adminOverview.sources.hotmart',
      'adminOverview.sources.stripe',
      'adminOverview.sources.guru',
      'adminOverview.emailEvents.spam',
      'adminPeople.sources.youtube',
      'adminPeople.sources.webhook',
      'adminPeople.sources.hotmart',
      'adminPeople.sources.stripe',
      'adminPeople.sources.guru',
      'adminReports.sources.webhook',
      'adminReports.sources.stripe',
      'adminReports.sources.guru',
      'adminReports.emailEvents.spam',
    ],
    machineTokenOrExample: [
      'adminAccess.slug',
      'adminContent.slug',
      'adminOperations.menu.dialog.url',
      'adminOperations.integrations.providers.stripe.secretPlaceholder',
      'adminOperations.integrations.providers.stripe.productIdPlaceholder',
      'adminOperations.integrations.providers.guru.producerIdPlaceholder',
      'adminOperations.integrations.providers.generic.productIdPlaceholder',
      'courseChat.input.enter',
    ],
    localeNeutralNotation: [
      'adminContent.minutes',
      'adminOverview.pointsCount',
      'adminOverview.customRange',
      'adminPeople.filterValue',
      'adminReports.pointsUnit',
      'adminReports.pointsCount',
      'adminReports.customRange',
      'adminReports.metricShare',
      'footer.copyright',
      'learning.modules.minutes',
      'learning.modules.hours',
      'learning.modules.hoursMinutes',
      'learning.progress.module',
      'learningMedia.video.rate',
      'learningMedia.video.seekSeconds',
      'learningOverview.duration.hoursMinutes',
      'learningOverview.duration.hours',
      'learningOverview.duration.minutes',
      'learningOverview.duration.minutesSeconds',
      'learningOverview.duration.seconds',
      'learningOverview.stats.minutes',
      'liveClasses.duration',
      'notifications.badgeOverflow',
    ],
    runtimePassthrough: [
      'notifications.automatic.engagement.commentReply.message',
      'notifications.automatic.engagement.commentReplyAnonymous.message',
    ],
  },
} satisfies Record<AuditedLocale, EqualityGroups>;

/** Exact exceptions for localized strings maintained in TypeScript. */
export const emailEqualityAllowlist = {
  pt: {
    optionalEmailSectionDisabled: [
      'templates.membership_welcome.liveSessionsTitle',
      'templates.membership_welcome.liveSessionsBody',
      'templates.membership_welcome.conversationClubTitle',
      'templates.membership_welcome.conversationClubBody',
      'templates.membership_welcome.feedbackClubTitle',
      'templates.membership_welcome.feedbackClubBody',
      'templates.membership_welcome.zoomNote',
    ],
    organizationNameSignoff: ['templates.membership_welcome.signoff'],
  },
  es: {
    optionalEmailSectionDisabled: [
      'templates.membership_welcome.liveSessionsTitle',
      'templates.membership_welcome.liveSessionsBody',
      'templates.membership_welcome.conversationClubTitle',
      'templates.membership_welcome.conversationClubBody',
      'templates.membership_welcome.feedbackClubTitle',
      'templates.membership_welcome.feedbackClubBody',
      'templates.membership_welcome.zoomNote',
    ],
    organizationNameSignoff: ['templates.membership_welcome.signoff'],
  },
} satisfies Record<AuditedLocale, EqualityGroups>;

export function equalityAllowances(
  groups: EqualityGroups,
): Map<string, EqualityReason> {
  const result = new Map<string, EqualityReason>();
  for (const [reason, keys] of Object.entries(groups) as Array<
    [EqualityReason, readonly string[]]
  >) {
    if (!equalityReasonDescriptions[reason]) {
      throw new Error(`Unknown equality reason: ${reason}`);
    }
    for (const key of keys) {
      if (result.has(key)) {
        throw new Error(`Duplicate equality allowance: ${key}`);
      }
      result.set(key, reason);
    }
  }
  return result;
}
