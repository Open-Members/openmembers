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
import type { Locale } from '@/core/i18n/config';

export interface ExpirationWarningVars extends EmailRenderContext {
  studentName: string | null;
  courseTitle: string | null;
  /** Absolute expiration date, ISO string. */
  expiresAt: string;
  /** Where to send them to renew — course checkout URL or dashboard fallback. */
  renewUrl: string;
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface ExpirationWarningContent {
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  fallbackLinkNote: string;
}

export const EXPIRATION_WARNING_VAR_KEYS = [
  'firstName',
  'studentName',
  'courseTitle',
  'expiresDate',
  'daysUntilExpiration',
  'renewUrl',
  'siteName',
] as const;

export const EXPIRATION_WARNING_DEFAULT_CONTENT: ExpirationWarningContent =
  EMAIL_TEMPLATE_DEFAULTS.expiration_warning_7d.en;

function formatExpiresDate(iso: string, locale: Locale): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(d);
  } catch {
    return iso;
  }
}

function daysUntil(iso: string, now: Date): number {
  try {
    const diff = new Date(iso).getTime() - now.getTime();
    return Math.max(0, Math.round(diff / 86_400_000));
  } catch {
    return 0;
  }
}

function buildVars(vars: ExpirationWarningVars) {
  const locale = resolveEmailLocale(vars.locale);
  const frame = getEmailFrameContent(locale);
  const now = vars.now ?? new Date();
  return {
    firstName: vars.studentName?.split(' ')[0] ?? frame.firstNameFallback,
    studentName: vars.studentName ?? '',
    courseTitle: vars.courseTitle ?? frame.courseFallback,
    expiresDate: formatExpiresDate(vars.expiresAt, locale),
    daysUntilExpiration: String(daysUntil(vars.expiresAt, now)),
    renewUrl: vars.renewUrl,
    siteName: vars.siteName,
  };
}

interface RenderArgs extends ExpirationWarningVars {
  content: ExpirationWarningContent;
}

export function ExpirationWarningEmail(args: RenderArgs) {
  const locale = resolveEmailLocale(args.locale);
  const frame = getEmailFrameContent(locale);
  const colors = getEmailColors(args.primaryColor);
  const actionUrl = requireEmailActionUrl(args.renewUrl);
  return (
    <EmailLayout
      preview={renderEmailFrameText(locale, frame.previews.expirationWarning, {
        courseTitle: args.courseTitle ?? frame.courseFallback,
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

export async function renderExpirationWarning(
  vars: ExpirationWarningVars,
  content?: ExpirationWarningContent,
): Promise<{ subject: string; html: string; text: string }> {
  const locale = resolveEmailLocale(vars.locale);
  const now = vars.now ?? new Date();
  const resolvedVars = buildVars(vars);
  const resolvedContent = applyVarsToContent(
    content ?? EMAIL_TEMPLATE_DEFAULTS.expiration_warning_7d[locale],
    resolvedVars,
  );

  const element = <ExpirationWarningEmail {...vars} locale={locale} now={now} content={resolvedContent} />;
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
