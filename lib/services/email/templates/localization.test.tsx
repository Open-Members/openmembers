import { describe, expect, it } from 'vitest';
import { locales, type Locale } from '@/core/i18n/config';
import {
  hasMalformedTemplateVariables,
  messageLeaves,
  templateVariables,
  unexpectedTemplateVariables,
} from '@/core/i18n/audit/catalog-utils';
import {
  emailEqualityAllowlist,
  equalityAllowances,
} from '@/core/i18n/audit/equality-allowlist';
import { renderExpirationWarning } from './expiration-warning';
import { renderWelcomeWithPassword } from './welcome-with-password';
import { renderReauthentication } from './reauthentication';
import { EMAIL_FRAME_CONTENT, EMAIL_TEMPLATE_DEFAULTS } from './localization';
import { resolveTemplateContent } from './load';
import {
  ADMIN_INVITE_VAR_KEYS,
  EMAIL_CHANGE_VAR_KEYS,
  EMAIL_CONFIRMATION_VAR_KEYS,
  EXPIRATION_WARNING_VAR_KEYS,
  MAGIC_LINK_LOGIN_VAR_KEYS,
  MEMBERSHIP_WELCOME_VAR_KEYS,
  PASSWORD_RECOVERY_VAR_KEYS,
  PURCHASE_CONFIRMED_VAR_KEYS,
  TEMPLATE_KEYS,
  WELCOME_MIGRATION_VAR_KEYS,
  WELCOME_VAR_KEYS,
} from './index';

const renderNow = new Date('2042-01-01T00:00:00.000Z');
const expirationNow = new Date('2026-09-12T12:00:00.000Z');

const templateVariableRegistry = {
  welcome_with_password: WELCOME_VAR_KEYS,
  welcome_migration: WELCOME_MIGRATION_VAR_KEYS,
  purchase_confirmed: PURCHASE_CONFIRMED_VAR_KEYS,
  membership_welcome: MEMBERSHIP_WELCOME_VAR_KEYS,
  expiration_warning_7d: EXPIRATION_WARNING_VAR_KEYS,
  password_recovery: PASSWORD_RECOVERY_VAR_KEYS,
  magic_link_login: MAGIC_LINK_LOGIN_VAR_KEYS,
  email_confirmation: EMAIL_CONFIRMATION_VAR_KEYS,
  admin_invite: ADMIN_INVITE_VAR_KEYS,
  email_change: EMAIL_CHANGE_VAR_KEYS,
  reauthentication: ['siteName'],
  support_new_ticket: ['userName'],
} satisfies Record<keyof typeof EMAIL_TEMPLATE_DEFAULTS, readonly string[]>;

const frameVariableRegistry: Record<string, readonly string[]> = {
  'previews.welcomeWithPassword': ['siteName'],
  'previews.purchaseConfirmed': ['courseTitle'],
  'previews.membershipWelcome': ['siteName'],
  'previews.expirationWarning': ['courseTitle'],
  'previews.welcomeMigration': ['siteName'],
  'previews.passwordRecovery': ['siteName'],
  'previews.magicLinkLogin': ['siteName'],
  'previews.emailConfirmation': ['siteName'],
  'previews.adminInvite': ['siteName'],
  'previews.emailChange': ['siteName'],
};

function emailLeaves(locale: Locale): Record<string, string> {
  return {
    ...messageLeaves(EMAIL_FRAME_CONTENT[locale], 'frame'),
    ...Object.fromEntries(
      Object.entries(EMAIL_TEMPLATE_DEFAULTS).flatMap(
        ([templateKey, localized]) =>
          Object.entries(
            messageLeaves(localized[locale], `templates.${templateKey}`),
          ),
      ),
    ),
  };
}

describe('localized email registry', () => {
  it('matches canonical template and locale registries exactly', () => {
    expect(Object.keys(EMAIL_TEMPLATE_DEFAULTS).sort()).toEqual(
      Object.values(TEMPLATE_KEYS).sort(),
    );
    expect(Object.keys(EMAIL_FRAME_CONTENT).sort()).toEqual([...locales].sort());

    for (const localized of Object.values(EMAIL_TEMPLATE_DEFAULTS)) {
      expect(Object.keys(localized).sort()).toEqual([...locales].sort());
    }
  });

  it('keeps fields and authored placeholders aligned per field in EN/PT/ES', () => {
    for (const [templateKey, localized] of Object.entries(
      EMAIL_TEMPLATE_DEFAULTS,
    )) {
      const english = messageLeaves(localized.en);
      for (const locale of locales) {
        const translated = messageLeaves(localized[locale]);
        expect(Object.keys(translated).sort(), `${templateKey}.${locale}`).toEqual(
          Object.keys(english).sort(),
        );
        for (const [field, message] of Object.entries(english)) {
          const allowed =
            templateVariableRegistry[
              templateKey as keyof typeof templateVariableRegistry
            ];
          expect(
            templateVariables(translated[field]),
            `${templateKey}.${locale}.${field}`,
          ).toEqual(templateVariables(message));
          expect(
            hasMalformedTemplateVariables(translated[field]),
            `${templateKey}.${locale}.${field} malformed placeholder`,
          ).toBe(false);
          expect(
            unexpectedTemplateVariables(translated[field], allowed),
            `${templateKey}.${locale}.${field} unknown placeholder`,
          ).toEqual([]);
        }
      }
    }

    const englishFrame = messageLeaves(EMAIL_FRAME_CONTENT.en);
    for (const locale of locales) {
      const translatedFrame = messageLeaves(EMAIL_FRAME_CONTENT[locale]);
      expect(Object.keys(translatedFrame).sort(), `frame.${locale}`).toEqual(
        Object.keys(englishFrame).sort(),
      );
      for (const [field, message] of Object.entries(englishFrame)) {
        expect(templateVariables(translatedFrame[field]), `frame.${locale}.${field}`)
          .toEqual(templateVariables(message));
        expect(
          hasMalformedTemplateVariables(translatedFrame[field]),
          `frame.${locale}.${field} malformed placeholder`,
        ).toBe(false);
        expect(
          unexpectedTemplateVariables(
            translatedFrame[field],
            frameVariableRegistry[field] ?? [],
          ),
          `frame.${locale}.${field} unknown placeholder`,
        ).toEqual([]);
      }
    }
  });

  it('rejects placeholder syntax and names that the runtime cannot honor', () => {
    expect(hasMalformedTemplateVariables('{{siteName}}')).toBe(false);
    expect(hasMalformedTemplateVariables('{{ siteName }}')).toBe(true);
    expect(hasMalformedTemplateVariables('{{{siteName}}}')).toBe(true);
    expect(hasMalformedTemplateVariables('{{siteName}}}')).toBe(true);
    expect(hasMalformedTemplateVariables('{{{siteName}}')).toBe(true);
    expect(unexpectedTemplateVariables('{{siteNmae}}', ['siteName'])).toEqual([
      'siteNmae',
    ]);
  });

  it('keeps only the reviewed optional email fields empty', () => {
    const allowedEmpty = [
      ...(emailEqualityAllowlist.pt.optionalEmailSectionDisabled ?? []),
    ].sort();
    expect(
      emailEqualityAllowlist.es.optionalEmailSectionDisabled?.slice().sort(),
    ).toEqual(allowedEmpty);

    for (const locale of locales) {
      const empty = Object.entries(emailLeaves(locale))
        .filter(([, value]) => value.trim() === '')
        .map(([key]) => key)
        .sort();
      expect(empty, `${locale} empty email defaults`).toEqual(allowedEmpty);
    }
  });

  it.each(['pt', 'es'] as const)(
    'has only reviewed %s values that are identical to English',
    (locale) => {
      const english = emailLeaves('en');
      const translated = emailLeaves(locale);
      const actual = Object.keys(english)
        .filter((key) => translated[key] === english[key])
        .sort();
      const allowed = [
        ...equalityAllowances(emailEqualityAllowlist[locale]).keys(),
      ].sort();

      const unexpected = actual.filter((key) => !allowed.includes(key));
      const stale = allowed.filter((key) => !actual.includes(key));
      expect({ unexpected, stale }, `${locale} email equality allowlist`).toEqual({
        unexpected: [],
        stale: [],
      });
    },
  );

  it.each([
    ['en', 'Welcome', 'All rights reserved.'],
    ['pt', 'Boas-vindas', 'Todos os direitos reservados.'],
    ['es', 'Te damos la bienvenida', 'Todos los derechos reservados.'],
  ] as const)('renders account defaults and shared frame in %s', async (locale, subjectCopy, footerCopy) => {
    const rendered = await renderWelcomeWithPassword({
      studentName: null,
      studentEmail: 'member@example.test',
      temporaryPassword: 'Fictitious-password',
      loginUrl: 'https://academy.example.test/login',
      courseTitle: 'Curso Autoral',
      siteName: 'Fixture Academy',
      locale,
      now: renderNow,
    });

    expect(rendered.subject).toContain(subjectCopy);
    expect(rendered.html).toContain(`lang="${locale}"`);
    expect(rendered.text).toContain(footerCopy);
    expect(rendered.text).toContain('© 2042 Fixture Academy');
    expect(rendered.text).toContain('Curso Autoral');
    expect(rendered.text).not.toContain('{{');
  });

  it('formats expiration from one clock in UTC and keeps authored course text literal', async () => {
    const rendered = await renderExpirationWarning({
      studentName: 'Pessoa Demo',
      courseTitle: 'Título sin traducción',
      expiresAt: '2026-09-19T00:30:00-03:00',
      renewUrl: 'https://academy.example.test/renew',
      siteName: 'Fixture Academy',
      locale: 'pt',
      now: expirationNow,
    });

    expect(rendered.subject).toBe('Seu acesso a Título sin traducción expira em 7 dias');
    expect(rendered.text).toContain('19 de setembro de 2026');
    expect(rendered.text).toContain('Título sin traducción');
  });

  it('localizes the complete reauthentication message', async () => {
    const rendered = await renderReauthentication({
      token: '123456',
      siteName: 'Fixture Academy',
      locale: 'es',
      now: renderNow,
    });
    expect(rendered.subject).toBe('Confirma tu identidad — Fixture Academy');
    expect(rendered.text).toContain('Introduce este código de verificación');
    expect(rendered.text).toContain('123456');
  });

  it('merges a global authored override over locale defaults by row presence', () => {
    expect(resolveTemplateContent('purchase_confirmed', 'pt', {
      subject: 'Literal {{courseTitle}}',
    })).toEqual({
      ...EMAIL_TEMPLATE_DEFAULTS.purchase_confirmed.pt,
      subject: 'Literal {{courseTitle}}',
    });
  });
});
