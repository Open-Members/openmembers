export {
  renderWelcomeWithPassword,
  WelcomeWithPasswordEmail,
  WELCOME_DEFAULT_CONTENT,
  WELCOME_VAR_KEYS,
  type WelcomeWithPasswordVars,
  type WelcomeWithPasswordContent,
} from './welcome-with-password';

export {
  renderPurchaseConfirmed,
  PurchaseConfirmedEmail,
  PURCHASE_CONFIRMED_DEFAULT_CONTENT,
  PURCHASE_CONFIRMED_VAR_KEYS,
  type PurchaseConfirmedVars,
  type PurchaseConfirmedContent,
} from './purchase-confirmed';

export {
  renderMembershipWelcome,
  MembershipWelcomeEmail,
  MEMBERSHIP_WELCOME_DEFAULT_CONTENT,
  MEMBERSHIP_WELCOME_VAR_KEYS,
  MEMBERSHIP_LINKS,
  type MembershipWelcomeVars,
  type MembershipWelcomeContent,
} from './membership-welcome';

export {
  renderExpirationWarning,
  ExpirationWarningEmail,
  EXPIRATION_WARNING_DEFAULT_CONTENT,
  EXPIRATION_WARNING_VAR_KEYS,
  type ExpirationWarningVars,
  type ExpirationWarningContent,
} from './expiration-warning';

export {
  renderWelcomeMigration,
  WelcomeMigrationEmail,
  WELCOME_MIGRATION_DEFAULT_CONTENT,
  WELCOME_MIGRATION_VAR_KEYS,
  type WelcomeMigrationVars,
  type WelcomeMigrationContent,
} from './welcome-migration';

export {
  renderPasswordRecovery,
  PasswordRecoveryEmail,
  PASSWORD_RECOVERY_DEFAULT_CONTENT,
  PASSWORD_RECOVERY_VAR_KEYS,
  type PasswordRecoveryVars,
  type PasswordRecoveryContent,
} from './password-recovery';

export {
  renderMagicLinkLogin,
  MagicLinkLoginEmail,
  MAGIC_LINK_LOGIN_DEFAULT_CONTENT,
  MAGIC_LINK_LOGIN_VAR_KEYS,
  type MagicLinkLoginVars,
  type MagicLinkLoginContent,
} from './magic-link-login';

export {
  renderEmailConfirmation,
  EmailConfirmationEmail,
  EMAIL_CONFIRMATION_DEFAULT_CONTENT,
  EMAIL_CONFIRMATION_VAR_KEYS,
  type EmailConfirmationVars,
  type EmailConfirmationContent,
} from './email-confirmation';

export {
  renderAdminInvite,
  AdminInviteEmail,
  ADMIN_INVITE_DEFAULT_CONTENT,
  ADMIN_INVITE_VAR_KEYS,
  type AdminInviteVars,
  type AdminInviteContent,
} from './admin-invite';

export {
  renderEmailChange,
  EmailChangeEmail,
  EMAIL_CHANGE_DEFAULT_CONTENT,
  EMAIL_CHANGE_VAR_KEYS,
  type EmailChangeVars,
  type EmailChangeContent,
} from './email-change';

export {
  loadTemplateContent,
  loadTemplateOverride,
  loadLocalizedTemplateContent,
  resolveTemplateContent,
  saveTemplateContent,
  resetTemplateContent,
} from './load';
export { substituteVars, applyVarsToContent } from './substitute';
export {
  EMAIL_FRAME_CONTENT,
  EMAIL_TEMPLATE_DEFAULTS,
  getEmailFrameContent,
  getEmailTemplateDefaults,
  type EmailFrameContent,
  type EmailTemplateContent,
  type EmailTemplateKey,
  type ReauthenticationContent,
  type SupportNewTicketContent,
} from './localization';

/**
 * Canonical template keys. Match the DB column `email_sends.template_key`
 * and `email_templates.template_key`. Never rename — persisted everywhere.
 */
export const TEMPLATE_KEYS = {
  WELCOME_WITH_PASSWORD: 'welcome_with_password',
  WELCOME_MIGRATION: 'welcome_migration',
  PURCHASE_CONFIRMED: 'purchase_confirmed',
  MEMBERSHIP_WELCOME: 'membership_welcome',
  EXPIRATION_WARNING_7D: 'expiration_warning_7d',
  PASSWORD_RECOVERY: 'password_recovery',
  MAGIC_LINK_LOGIN: 'magic_link_login',
  EMAIL_CONFIRMATION: 'email_confirmation',
  ADMIN_INVITE: 'admin_invite',
  EMAIL_CHANGE: 'email_change',
  REAUTHENTICATION: 'reauthentication',
  SUPPORT_NEW_TICKET: 'support_new_ticket',
} as const;

export type TemplateKey = typeof TEMPLATE_KEYS[keyof typeof TEMPLATE_KEYS];
