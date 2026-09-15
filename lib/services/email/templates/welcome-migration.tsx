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

export interface WelcomeMigrationVars extends EmailRenderContext {
  studentName: string | null;
  studentEmail: string;
  temporaryPassword: string;
  loginUrl: string;
  /** One title per granted product. Single-product migrations pass [one]; bulk migrations can pass several. */
  productTitles: string[];
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface WelcomeMigrationContent {
  subject: string;
  heading: string;
  intro: string;
  credentialsIntro: string;
  ctaLabel: string;
  fallbackLinkNote: string;
}

export const WELCOME_MIGRATION_VAR_KEYS = [
  'firstName',
  'studentName',
  'studentEmail',
  'temporaryPassword',
  'loginUrl',
  'productList',
  'siteName',
] as const;

export const WELCOME_MIGRATION_DEFAULT_CONTENT: WelcomeMigrationContent =
  EMAIL_TEMPLATE_DEFAULTS.welcome_migration.en;

function buildVars(vars: WelcomeMigrationVars) {
  const frame = getEmailFrameContent(resolveEmailLocale(vars.locale));
  return {
    firstName: vars.studentName?.split(' ')[0] ?? frame.firstNameFallback,
    studentName: vars.studentName ?? '',
    studentEmail: vars.studentEmail,
    temporaryPassword: vars.temporaryPassword,
    loginUrl: vars.loginUrl,
    productList: vars.productTitles.join(', '),
    siteName: vars.siteName,
  };
}

interface RenderArgs extends WelcomeMigrationVars {
  content: WelcomeMigrationContent;
}

export function WelcomeMigrationEmail(args: RenderArgs) {
  const locale = resolveEmailLocale(args.locale);
  const frame = getEmailFrameContent(locale);
  const colors = getEmailColors(args.primaryColor);
  const actionUrl = requireEmailActionUrl(args.loginUrl);
  return (
    <EmailLayout
      preview={renderEmailFrameText(locale, frame.previews.welcomeMigration, { siteName: args.siteName })}
      siteName={args.siteName}
      logoUrl={args.logoUrl}
      primaryColor={colors.primary}
      locale={locale}
      now={args.now}
    >
      <Heading style={h1}>{args.content.heading}</Heading>

      <Text style={paragraph}>{args.content.intro}</Text>

      {args.productTitles.length > 0 && (
        <Section style={productsBox}>
          <Text style={credentialsLabel}>{frame.accessLabel}</Text>
          {args.productTitles.map((title) => (
            <Text key={title} style={productItem}>
              • {title}
            </Text>
          ))}
        </Section>
      )}

      <Section style={credentialsBox}>
        <Text style={credentialsLabel}>{frame.emailLabel}</Text>
        <Text style={credentialsValue}>{args.studentEmail}</Text>

        <Text style={credentialsLabel}>{frame.temporaryPasswordLabel}</Text>
        <Text style={credentialsValueMono}>{args.temporaryPassword}</Text>
      </Section>

      <Text style={paragraph}>{args.content.credentialsIntro}</Text>

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

export async function renderWelcomeMigration(
  vars: WelcomeMigrationVars,
  content?: WelcomeMigrationContent,
): Promise<{ subject: string; html: string; text: string }> {
  const locale = resolveEmailLocale(vars.locale);
  const now = vars.now ?? new Date();
  const resolvedVars = buildVars(vars);
  const resolvedContent = applyVarsToContent(content ?? EMAIL_TEMPLATE_DEFAULTS.welcome_migration[locale], resolvedVars);

  const element = (
    <WelcomeMigrationEmail {...vars} locale={locale} now={now} content={resolvedContent} />
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

const credentialsBox: React.CSSProperties = {
  backgroundColor: '#f4f6fb',
  border: '1px solid #e6e9f0',
  borderRadius: '10px',
  padding: '16px 20px',
  margin: '16px 0 20px',
};

const productsBox: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e6e9f0',
  borderRadius: '10px',
  padding: '12px 20px 16px',
  margin: '0 0 16px',
};

const productItem: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 4px',
};

const credentialsLabel: React.CSSProperties = {
  color: '#7a869a',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: '8px 0 2px',
};

const credentialsValue: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '15px',
  margin: '0 0 8px',
};

const credentialsValueMono: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '17px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.02em',
  margin: '0',
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
