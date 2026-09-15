import { Button, Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { EmailLayout } from './shared/EmailLayout';
import { requireEmailActionUrl, getEmailColors } from './shared/branding';
import { applyVarsToContent } from './substitute';
import { EMAIL_TEMPLATE_DEFAULTS, getEmailFrameContent, renderEmailFrameText, resolveEmailLocale, type EmailRenderContext } from './localization';

export interface PasswordRecoveryVars extends EmailRenderContext {
  studentName: string | null;
  studentEmail: string;
  recoveryUrl: string;
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface PasswordRecoveryContent {
  subject: string;
  heading: string;
  intro: string;
  ctaLabel: string;
  fallbackLinkNote: string;
  ignoreNote: string;
}

export const PASSWORD_RECOVERY_VAR_KEYS = [
  'firstName',
  'studentName',
  'studentEmail',
  'recoveryUrl',
  'siteName',
] as const;

export const PASSWORD_RECOVERY_DEFAULT_CONTENT: PasswordRecoveryContent =
  EMAIL_TEMPLATE_DEFAULTS.password_recovery.en;

function buildVars(vars: PasswordRecoveryVars) {
  const frame = getEmailFrameContent(resolveEmailLocale(vars.locale));
  return {
    firstName: vars.studentName?.split(' ')[0] ?? frame.firstNameFallback,
    studentName: vars.studentName ?? '',
    studentEmail: vars.studentEmail,
    recoveryUrl: vars.recoveryUrl,
    siteName: vars.siteName,
  };
}

interface RenderArgs extends PasswordRecoveryVars {
  content: PasswordRecoveryContent;
}

export function PasswordRecoveryEmail(args: RenderArgs) {
  const locale = resolveEmailLocale(args.locale);
  const frame = getEmailFrameContent(locale);
  const colors = getEmailColors(args.primaryColor);
  const actionUrl = requireEmailActionUrl(args.recoveryUrl);
  return (
    <EmailLayout
      preview={renderEmailFrameText(locale, frame.previews.passwordRecovery, { siteName: args.siteName })}
      siteName={args.siteName}
      logoUrl={args.logoUrl}
      primaryColor={colors.primary}
      locale={locale}
      now={args.now}
    >
      <Heading style={h1}>{args.content.heading}</Heading>

      <Text style={paragraph}>{args.content.intro}</Text>

      <Section style={{ textAlign: 'center', padding: '8px 0 16px' }}>
        <Button href={actionUrl} style={{ ...button, backgroundColor: colors.primary, color: colors.foreground }}>
          {args.content.ctaLabel}
        </Button>
      </Section>

      <Text style={smallNote}>
        {args.content.fallbackLinkNote}{' '}
        <a href={actionUrl} style={{ ...inlineLink, color: colors.link }}>
          {actionUrl}
        </a>
      </Text>

      <Text style={smallMuted}>{args.content.ignoreNote}</Text>
    </EmailLayout>
  );
}

export async function renderPasswordRecovery(
  vars: PasswordRecoveryVars,
  content?: PasswordRecoveryContent,
): Promise<{ subject: string; html: string; text: string }> {
  const locale = resolveEmailLocale(vars.locale);
  const now = vars.now ?? new Date();
  const resolvedVars = buildVars(vars);
  const resolvedContent = applyVarsToContent(content ?? EMAIL_TEMPLATE_DEFAULTS.password_recovery[locale], resolvedVars);

  const element = <PasswordRecoveryEmail {...vars} locale={locale} now={now} content={resolvedContent} />;
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { subject: resolvedContent.subject, html, text };
}

const h1: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '26px',
  fontWeight: 700,
  lineHeight: '32px',
  letterSpacing: '-0.02em',
  margin: '0 0 16px',
};

const paragraph: React.CSSProperties = {
  color: '#2c3a52',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const button: React.CSSProperties = {
  borderRadius: '999px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  padding: '12px 28px',
  textDecoration: 'none',
  display: 'inline-block',
};

const smallNote: React.CSSProperties = {
  color: '#7a869a',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '8px 0 0',
  wordBreak: 'break-all',
};

const smallMuted: React.CSSProperties = {
  color: '#7a869a',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
};

const inlineLink: React.CSSProperties = {
  textDecoration: 'underline',
};
