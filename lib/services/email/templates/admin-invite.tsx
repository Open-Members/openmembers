import { Button, Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { EmailLayout } from './shared/EmailLayout';
import { requireEmailActionUrl, getEmailColors } from './shared/branding';
import { applyVarsToContent } from './substitute';
import { EMAIL_TEMPLATE_DEFAULTS, getEmailFrameContent, renderEmailFrameText, resolveEmailLocale, type EmailRenderContext } from './localization';

export interface AdminInviteVars extends EmailRenderContext {
  studentName: string | null;
  studentEmail: string;
  acceptUrl: string;
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface AdminInviteContent {
  subject: string;
  heading: string;
  intro: string;
  ctaLabel: string;
  fallbackLinkNote: string;
}

export const ADMIN_INVITE_VAR_KEYS = [
  'firstName',
  'studentName',
  'studentEmail',
  'acceptUrl',
  'siteName',
] as const;

export const ADMIN_INVITE_DEFAULT_CONTENT: AdminInviteContent =
  EMAIL_TEMPLATE_DEFAULTS.admin_invite.en;

function buildVars(vars: AdminInviteVars) {
  const frame = getEmailFrameContent(resolveEmailLocale(vars.locale));
  return {
    firstName: vars.studentName?.split(' ')[0] ?? frame.firstNameFallback,
    studentName: vars.studentName ?? '',
    studentEmail: vars.studentEmail,
    acceptUrl: vars.acceptUrl,
    siteName: vars.siteName,
  };
}

interface RenderArgs extends AdminInviteVars {
  content: AdminInviteContent;
}

export function AdminInviteEmail(args: RenderArgs) {
  const locale = resolveEmailLocale(args.locale);
  const frame = getEmailFrameContent(locale);
  const colors = getEmailColors(args.primaryColor);
  const actionUrl = requireEmailActionUrl(args.acceptUrl);
  return (
    <EmailLayout
      preview={renderEmailFrameText(locale, frame.previews.adminInvite, { siteName: args.siteName })}
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
    </EmailLayout>
  );
}

export async function renderAdminInvite(
  vars: AdminInviteVars,
  content?: AdminInviteContent,
): Promise<{ subject: string; html: string; text: string }> {
  const locale = resolveEmailLocale(vars.locale);
  const now = vars.now ?? new Date();
  const resolvedVars = buildVars(vars);
  const resolvedContent = applyVarsToContent(content ?? EMAIL_TEMPLATE_DEFAULTS.admin_invite[locale], resolvedVars);

  const element = <AdminInviteEmail {...vars} locale={locale} now={now} content={resolvedContent} />;
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

const inlineLink: React.CSSProperties = {
  textDecoration: 'underline',
};
