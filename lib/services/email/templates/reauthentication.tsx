import { Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { EmailLayout } from './shared/EmailLayout';
import { applyVarsToContent } from './substitute';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  resolveEmailLocale,
  type EmailRenderContext,
  type ReauthenticationContent,
} from './localization';

export interface ReauthenticationVars extends EmailRenderContext {
  token: string;
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export async function renderReauthentication(
  vars: ReauthenticationVars,
  content?: ReauthenticationContent,
) {
  if (!/^\d{6,10}$/.test(vars.token)) throw new Error('invalidReauthenticationCode');
  const locale = resolveEmailLocale(vars.locale);
  const now = vars.now ?? new Date();
  const resolved = applyVarsToContent(
    content ?? EMAIL_TEMPLATE_DEFAULTS.reauthentication[locale],
    { siteName: vars.siteName },
  );
  const element = <EmailLayout preview={resolved.subject} {...vars} locale={locale} now={now}>
    <Heading>{resolved.heading}</Heading>
    <Text>{resolved.intro}</Text>
    <Text style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '5px' }}>{vars.token}</Text>
    <Text>{resolved.ignoreNote}</Text>
  </EmailLayout>;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: resolved.subject, html, text };
}
