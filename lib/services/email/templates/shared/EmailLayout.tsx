import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import { getEmailColors, normalizeEmailUrl } from './branding';
import type { Locale } from '@/core/i18n/config';
import { getEmailFrameContent, resolveEmailLocale } from '../localization';

interface EmailLayoutProps {
  preview: string;
  siteName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  children: ReactNode;
  unsubscribeUrl?: string;
  locale?: Locale;
  now?: Date;
}

/**
 * Shared wrapper for every outgoing email. Keeps the header, footer,
 * and typography consistent so individual templates focus on content.
 * Plain-text rendering strips the logo image and uses the site name
 * as the header — handled by @react-email/render's plainText option.
 */
export function EmailLayout({
  preview,
  siteName,
  logoUrl,
  primaryColor,
  children,
  unsubscribeUrl,
  locale: localeInput,
  now = new Date(),
}: EmailLayoutProps) {
  const locale = resolveEmailLocale(localeInput);
  const frame = getEmailFrameContent(locale);
  const colors = getEmailColors(primaryColor);
  const safeLogoUrl = normalizeEmailUrl(logoUrl);
  const safeUnsubscribeUrl = normalizeEmailUrl(unsubscribeUrl);
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            {safeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={safeLogoUrl} alt={siteName} style={logo} />
            ) : (
              <Text style={{ ...brand, color: colors.link }}>{siteName}</Text>
            )}
          </Section>

          <Section style={content}>{children}</Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              © {now.getUTCFullYear()} {siteName}. {frame.rightsReserved}
            </Text>
            {safeUnsubscribeUrl && (
              <Text style={footerText}>
                <a href={safeUnsubscribeUrl} style={footerLink}>
                  {frame.unsubscribe}
                </a>{' '}
                {frame.unsubscribeSuffix}
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: '#f4f6fb',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
  margin: 0,
  padding: '40px 0',
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  margin: '0 auto',
  maxWidth: '560px',
  overflow: 'hidden',
  border: '1px solid #e6e9f0',
};

const header: React.CSSProperties = {
  padding: '28px 32px 0',
};

const logo: React.CSSProperties = {
  height: '32px',
  width: 'auto',
  maxWidth: '100%',
  objectFit: 'contain',
};

const brand: React.CSSProperties = {
  color: '#040d1f',
  fontSize: '18px',
  fontWeight: 700,
  margin: 0,
  letterSpacing: '-0.01em',
};

const content: React.CSSProperties = {
  padding: '24px 32px 32px',
};

const divider: React.CSSProperties = {
  borderColor: '#e6e9f0',
  margin: '0 32px',
};

const footer: React.CSSProperties = {
  padding: '20px 32px 28px',
};

const footerText: React.CSSProperties = {
  color: '#7a869a',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '4px 0',
};

const footerLink: React.CSSProperties = {
  color: '#7a869a',
  textDecoration: 'underline',
};
