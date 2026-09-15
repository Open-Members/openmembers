import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { EmailLayout } from './shared/EmailLayout';
import { requireEmailActionUrl, getEmailColors, normalizeEmailUrl } from './shared/branding';
import { applyVarsToContent } from './substitute';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  getEmailFrameContent,
  renderEmailFrameText,
  resolveEmailLocale,
  type EmailRenderContext,
} from './localization';

export interface MembershipWelcomeVars extends EmailRenderContext {
  studentName: string | null;
  studentEmail: string;
  /** When set, the credentials box is shown (brand-new buyer). Null for
   *  existing members — they already have a password and just log in. */
  temporaryPassword: string | null;
  loginUrl: string;
  whatsappUrl: string;
  questionFormUrl: string;
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface MembershipWelcomeContent {
  subject: string;
  greeting: string;
  heading: string;
  intro: string;
  credentialsIntro: string;
  step1Title: string;
  step1Body: string;
  step1Cta: string;
  step2Title: string;
  step2Body: string;
  step2Cta: string;
  liveSessionsTitle: string;
  liveSessionsBody: string;
  conversationClubTitle: string;
  conversationClubBody: string;
  feedbackClubTitle: string;
  feedbackClubBody: string;
  zoomNote: string;
  personalHelpTitle: string;
  personalHelpBody: string;
  personalHelpCta: string;
  tipsTitle: string;
  tipsBody: string;
  closing: string;
  signoff: string;
}

/** Fields available inside `{{...}}` placeholders when authoring content. */
export const MEMBERSHIP_WELCOME_VAR_KEYS = [
  'firstName',
  'studentName',
  'siteName',
] as const;

/** Validated legacy fallbacks for integrations still using the existing contract. */
export const MEMBERSHIP_LINKS = {
  get whatsapp(): string {
    return normalizeEmailUrl(process.env.MEMBERSHIP_COMMUNITY_URL) ?? '';
  },
  get questionForm(): string {
    return normalizeEmailUrl(process.env.MEMBERSHIP_HELP_URL, true) ?? '';
  },
};

export const MEMBERSHIP_WELCOME_DEFAULT_CONTENT: MembershipWelcomeContent =
  EMAIL_TEMPLATE_DEFAULTS.membership_welcome.en;

function buildVars(vars: MembershipWelcomeVars) {
  const frame = getEmailFrameContent(resolveEmailLocale(vars.locale));
  return {
    firstName: vars.studentName?.split(' ')[0] ?? frame.firstNameFallback,
    studentName: vars.studentName ?? '',
    siteName: vars.siteName,
  };
}

/** Renders a content string as paragraphs (split on blank lines), keeping
 *  single line breaks (bullet lists) via `white-space: pre-line`. */
function RichText({ value }: { value: string }) {
  const paragraphs = value.split('\n\n');
  return (
    <>
      {paragraphs.map((p, i) => (
        <Text key={i} style={richParagraph}>
          {p}
        </Text>
      ))}
    </>
  );
}

interface RenderArgs extends MembershipWelcomeVars {
  content: MembershipWelcomeContent;
}

export function MembershipWelcomeEmail(args: RenderArgs) {
  const locale = resolveEmailLocale(args.locale);
  const frame = getEmailFrameContent(locale);
  const colors = getEmailColors(args.primaryColor);
  const actionUrl = requireEmailActionUrl(args.loginUrl);
  const { content } = args;
  const showCredentials = Boolean(args.temporaryPassword);
  const communityUrl = normalizeEmailUrl(args.whatsappUrl);
  const helpUrl = normalizeEmailUrl(args.questionFormUrl, true);
  const showLiveSessions = [
    content.liveSessionsTitle, content.liveSessionsBody,
    content.conversationClubTitle, content.conversationClubBody,
    content.feedbackClubTitle, content.feedbackClubBody, content.zoomNote,
  ].some(Boolean);

  return (
    <EmailLayout
      preview={renderEmailFrameText(locale, frame.previews.membershipWelcome, { siteName: args.siteName })}
      siteName={args.siteName}
      logoUrl={args.logoUrl}
      primaryColor={colors.primary}
      locale={locale}
      now={args.now}
    >
      <Text style={greeting}>{content.greeting}</Text>
      <Heading style={h1}>{content.heading}</Heading>
      <RichText value={content.intro} />

      <Hr style={sectionDivider} />

      {/* Step 1 — Platform */}
      <Heading as="h2" style={h2}>
        {content.step1Title}
      </Heading>
      <RichText value={content.step1Body} />

      {showCredentials && (
        <>
          <Text style={richParagraph}>{content.credentialsIntro}</Text>
          <Section style={credentialsBox}>
            <Text style={credentialsLabel}>{frame.emailLabel}</Text>
            <Text style={credentialsValue}>{args.studentEmail}</Text>
            <Text style={credentialsLabel}>{frame.temporaryPasswordLabel}</Text>
            <Text style={credentialsValueMono}>{args.temporaryPassword}</Text>
          </Section>
        </>
      )}

      <Section style={ctaWrap}>
        <Button href={actionUrl} style={{ ...button, backgroundColor: colors.primary, color: colors.foreground }}>
          {content.step1Cta}
        </Button>
      </Section>

      {communityUrl && (
        <>
          <Hr style={sectionDivider} />
          <Heading as="h2" style={h2}>{content.step2Title}</Heading>
          <RichText value={content.step2Body} />
          <Section style={ctaWrap}>
            <Button href={communityUrl} style={{ ...button, backgroundColor: colors.primary, color: colors.foreground }}>{content.step2Cta}</Button>
          </Section>
        </>
      )}

      {showLiveSessions && (
        <>
          <Hr style={sectionDivider} />
          {content.liveSessionsTitle && <Heading as="h2" style={h2}>{content.liveSessionsTitle}</Heading>}
          {content.liveSessionsBody && <RichText value={content.liveSessionsBody} />}
          {(content.conversationClubTitle || content.conversationClubBody) && (
            <>
              <Heading as="h3" style={{ ...h3, color: colors.link }}>{content.conversationClubTitle}</Heading>
              <RichText value={content.conversationClubBody} />
            </>
          )}
          {(content.feedbackClubTitle || content.feedbackClubBody) && (
            <>
              <Heading as="h3" style={{ ...h3, color: colors.link }}>{content.feedbackClubTitle}</Heading>
              <RichText value={content.feedbackClubBody} />
            </>
          )}
          {content.zoomNote && <Text style={zoomNote}>{content.zoomNote}</Text>}
        </>
      )}

      {helpUrl && (
        <>
          <Hr style={sectionDivider} />
          <Heading as="h2" style={h2}>{content.personalHelpTitle}</Heading>
          <RichText value={content.personalHelpBody} />
          <Section style={ctaWrap}>
            <Button href={helpUrl} style={{ ...buttonOutline, color: colors.link, borderColor: colors.primary }}>{content.personalHelpCta}</Button>
          </Section>
        </>
      )}

      <Hr style={sectionDivider} />

      {/* Tips */}
      <Heading as="h2" style={h2}>
        {content.tipsTitle}
      </Heading>
      <RichText value={content.tipsBody} />

      <Hr style={sectionDivider} />

      <RichText value={content.closing} />
      <Text style={signoff}>{content.signoff}</Text>
    </EmailLayout>
  );
}

export async function renderMembershipWelcome(
  vars: MembershipWelcomeVars,
  content?: MembershipWelcomeContent,
): Promise<{ subject: string; html: string; text: string }> {
  const locale = resolveEmailLocale(vars.locale);
  const now = vars.now ?? new Date();
  const resolvedVars = buildVars(vars);
  const resolvedContent = applyVarsToContent(content ?? EMAIL_TEMPLATE_DEFAULTS.membership_welcome[locale], resolvedVars);

  const element = <MembershipWelcomeEmail {...vars} locale={locale} now={now} content={resolvedContent} />;
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { subject: resolvedContent.subject, html, text };
}

// ── Styles ──────────────────────────────────────────────────────────────────

const greeting: React.CSSProperties = {
  color: '#2c3a52',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 4px',
};

const h1: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '26px',
  fontWeight: 700,
  lineHeight: '32px',
  letterSpacing: '-0.02em',
  margin: '0 0 16px',
};

const h2: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '19px',
  fontWeight: 700,
  lineHeight: '26px',
  letterSpacing: '-0.01em',
  margin: '0 0 10px',
};

const h3: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  lineHeight: '22px',
  margin: '18px 0 6px',
};

const richParagraph: React.CSSProperties = {
  color: '#2c3a52',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 14px',
  whiteSpace: 'pre-line',
};

const zoomNote: React.CSSProperties = {
  color: '#7a869a',
  fontSize: '13px',
  fontStyle: 'italic',
  lineHeight: '20px',
  margin: '12px 0 0',
};

const signoff: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: '24px',
  margin: '4px 0 0',
  whiteSpace: 'pre-line',
};

const sectionDivider: React.CSSProperties = {
  borderColor: '#e6e9f0',
  margin: '24px 0',
};

const ctaWrap: React.CSSProperties = {
  textAlign: 'center',
  padding: '4px 0 4px',
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

const buttonOutline: React.CSSProperties = {
  ...button,
  backgroundColor: '#ffffff',
  border: '2px solid',
  padding: '10px 26px',
};

const credentialsBox: React.CSSProperties = {
  backgroundColor: '#f4f6fb',
  border: '1px solid #e6e9f0',
  borderRadius: '10px',
  padding: '16px 20px',
  margin: '4px 0 18px',
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
