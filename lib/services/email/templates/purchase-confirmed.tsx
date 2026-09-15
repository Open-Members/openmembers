import { Button, Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { EmailLayout } from './shared/EmailLayout';
import { requireEmailActionUrl, getEmailColors } from './shared/branding';
import { applyVarsToContent } from './substitute';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  getEmailFrameContent,
  renderEmailFrameText,
  resolveEmailLocale,
  type EmailRenderContext,
} from './localization';

export interface PurchaseConfirmedVars extends EmailRenderContext {
  studentName: string | null;
  courseTitle: string | null;
  courseUrl: string;
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface PurchaseConfirmedContent {
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  fallbackLinkNote: string;
}

export const PURCHASE_CONFIRMED_VAR_KEYS = [
  'firstName',
  'studentName',
  'courseTitle',
  'courseUrl',
  'siteName',
] as const;

export const PURCHASE_CONFIRMED_DEFAULT_CONTENT: PurchaseConfirmedContent =
  EMAIL_TEMPLATE_DEFAULTS.purchase_confirmed.en;

function buildVars(vars: PurchaseConfirmedVars) {
  const frame = getEmailFrameContent(resolveEmailLocale(vars.locale));
  return {
    firstName: vars.studentName?.split(' ')[0] ?? frame.firstNameFallback,
    studentName: vars.studentName ?? '',
    courseTitle: vars.courseTitle ?? frame.newCourseFallback,
    courseUrl: vars.courseUrl,
    siteName: vars.siteName,
  };
}

interface RenderArgs extends PurchaseConfirmedVars {
  content: PurchaseConfirmedContent;
}

export function PurchaseConfirmedEmail(args: RenderArgs) {
  const locale = resolveEmailLocale(args.locale);
  const frame = getEmailFrameContent(locale);
  const colors = getEmailColors(args.primaryColor);
  const actionUrl = requireEmailActionUrl(args.courseUrl);
  return (
    <EmailLayout
      preview={renderEmailFrameText(locale, frame.previews.purchaseConfirmed, {
        courseTitle: args.courseTitle ?? frame.newCourseFallback,
      })}
      siteName={args.siteName}
      logoUrl={args.logoUrl}
      primaryColor={colors.primary}
      locale={locale}
      now={args.now}
    >
      <Heading style={h1}>{args.content.heading}</Heading>

      <Text style={paragraph}>{args.content.body}</Text>

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

export async function renderPurchaseConfirmed(
  vars: PurchaseConfirmedVars,
  content?: PurchaseConfirmedContent,
): Promise<{ subject: string; html: string; text: string }> {
  const locale = resolveEmailLocale(vars.locale);
  const now = vars.now ?? new Date();
  const resolvedVars = buildVars(vars);
  const resolvedContent = applyVarsToContent(
    content ?? EMAIL_TEMPLATE_DEFAULTS.purchase_confirmed[locale],
    resolvedVars,
  );

  const element = (
    <PurchaseConfirmedEmail {...vars} locale={locale} now={now} content={resolvedContent} />
  );
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
