import {
  EXPIRATION_WARNING_VAR_KEYS,
  MEMBERSHIP_WELCOME_VAR_KEYS,
  PURCHASE_CONFIRMED_VAR_KEYS,
  TEMPLATE_KEYS,
  WELCOME_VAR_KEYS,
  type TemplateKey,
} from '@/lib/services/email/templates';

type TemplateFieldType = 'subject' | 'short' | 'long';

export interface AdminTemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
}

export interface AdminEmailTemplate {
  key: TemplateKey;
  displayName: string;
  description: string;
  varKeys: readonly string[];
  fields: AdminTemplateField[];
  content: Record<string, string>;
  /** Fields explicitly authored in the global saved override row. */
  overrideFields: string[];
  /** True only when no saved override row exists. */
  isDefault: boolean;
}

export type AdminEmailTemplateDescriptor = Pick<
  AdminEmailTemplate,
  'key' | 'displayName' | 'description' | 'varKeys' | 'fields'
>;

/** Closed registry used by both the admin service and translation gate. */
export const ADMIN_EMAIL_TEMPLATE_CATALOG: AdminEmailTemplateDescriptor[] = [
  {
    key: TEMPLATE_KEYS.WELCOME_WITH_PASSWORD,
    displayName: 'Welcome — new student',
    description:
      'Sent on the first purchase. Includes the generated temporary password and login link.',
    varKeys: WELCOME_VAR_KEYS,
    fields: [
      { key: 'subject', label: 'Subject', type: 'subject' },
      { key: 'heading', label: 'Heading', type: 'short' },
      { key: 'intro', label: 'Intro paragraph', type: 'long' },
      { key: 'credentialsIntro', label: 'After the credentials', type: 'long' },
      { key: 'ctaLabel', label: 'Button label', type: 'short' },
      { key: 'fallbackLinkNote', label: 'Fallback link note', type: 'short' },
    ],
  },
  {
    key: TEMPLATE_KEYS.PURCHASE_CONFIRMED,
    displayName: 'Purchase confirmed — existing student',
    description:
      'Sent when an existing student is granted access to a new course via webhook.',
    varKeys: PURCHASE_CONFIRMED_VAR_KEYS,
    fields: [
      { key: 'subject', label: 'Subject', type: 'subject' },
      { key: 'heading', label: 'Heading', type: 'short' },
      { key: 'body', label: 'Body', type: 'long' },
      { key: 'ctaLabel', label: 'Button label', type: 'short' },
      { key: 'fallbackLinkNote', label: 'Fallback link note', type: 'short' },
    ],
  },
  {
    key: TEMPLATE_KEYS.MEMBERSHIP_WELCOME,
    displayName: 'Membership welcome — onboarding',
    description:
      'Sent when someone buys the membership (and used for the retroactive backfill). Edit the live-session dates here to keep them current — no deploy needed.',
    varKeys: MEMBERSHIP_WELCOME_VAR_KEYS,
    fields: [
      { key: 'subject', label: 'Subject', type: 'subject' },
      { key: 'greeting', label: 'Greeting line', type: 'short' },
      { key: 'heading', label: 'Heading', type: 'short' },
      { key: 'intro', label: 'Intro', type: 'long' },
      { key: 'credentialsIntro', label: 'Credentials intro (new buyers only)', type: 'long' },
      { key: 'step1Title', label: 'Step 1 — title', type: 'short' },
      { key: 'step1Body', label: 'Step 1 — body', type: 'long' },
      { key: 'step1Cta', label: 'Step 1 — button label', type: 'short' },
      { key: 'step2Title', label: 'Step 2 — title', type: 'short' },
      { key: 'step2Body', label: 'Step 2 — body', type: 'long' },
      { key: 'step2Cta', label: 'Step 2 — button label', type: 'short' },
      { key: 'liveSessionsTitle', label: 'Live sessions — title', type: 'short' },
      { key: 'liveSessionsBody', label: 'Live sessions — body', type: 'long' },
      { key: 'conversationClubTitle', label: 'Conversation Club — title', type: 'short' },
      { key: 'conversationClubBody', label: 'Conversation Club — body + dates', type: 'long' },
      { key: 'feedbackClubTitle', label: 'Feedback Club — title', type: 'short' },
      { key: 'feedbackClubBody', label: 'Feedback Club — body + dates', type: 'long' },
      { key: 'zoomNote', label: 'Zoom links note', type: 'short' },
      { key: 'personalHelpTitle', label: 'Personal help — title', type: 'short' },
      { key: 'personalHelpBody', label: 'Personal help — body', type: 'long' },
      { key: 'personalHelpCta', label: 'Personal help — button label', type: 'short' },
      { key: 'tipsTitle', label: 'Tips — title', type: 'short' },
      { key: 'tipsBody', label: 'Tips — body', type: 'long' },
      { key: 'closing', label: 'Closing', type: 'long' },
      { key: 'signoff', label: 'Sign-off', type: 'long' },
    ],
  },
  {
    key: TEMPLATE_KEYS.EXPIRATION_WARNING_7D,
    displayName: 'Expiration warning — 7 days out',
    description:
      'Sent once by the nightly cron to students whose access expires in the next 7 days. Encourages renewal before access lapses.',
    varKeys: EXPIRATION_WARNING_VAR_KEYS,
    fields: [
      { key: 'subject', label: 'Subject', type: 'subject' },
      { key: 'heading', label: 'Heading', type: 'short' },
      { key: 'body', label: 'Body', type: 'long' },
      { key: 'ctaLabel', label: 'Button label', type: 'short' },
      { key: 'fallbackLinkNote', label: 'Fallback link note', type: 'short' },
    ],
  },
];
