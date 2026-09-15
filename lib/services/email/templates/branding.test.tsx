import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAdminInvite } from './admin-invite';
import { renderEmailChange } from './email-change';
import { renderEmailConfirmation } from './email-confirmation';
import { renderExpirationWarning } from './expiration-warning';
import { renderMagicLinkLogin } from './magic-link-login';
import { renderMembershipWelcome } from './membership-welcome';
import { renderPasswordRecovery } from './password-recovery';
import { renderPurchaseConfirmed } from './purchase-confirmed';
import { renderWelcomeMigration } from './welcome-migration';
import { renderWelcomeWithPassword } from './welcome-with-password';
import { DEFAULT_EMAIL_PRIMARY_COLOR } from './shared/branding';

const fixtures = {
  studentName: 'Demo Member',
  studentEmail: 'member@example.test',
  newEmail: 'updated@example.test',
  temporaryPassword: 'Fictitious-email-demo-only',
  productTitles: ['Demo Course'],
  courseTitle: 'Demo Course',
  expiresAt: '2099-01-01T00:00:00Z',
  acceptUrl: 'https://academy.example.test/invite',
  confirmUrl: 'https://academy.example.test/confirm',
  renewUrl: 'https://academy.example.test/renew',
  loginUrl: 'https://academy.example.test/login',
  recoveryUrl: 'https://academy.example.test/recovery',
  courseUrl: 'https://academy.example.test/course',
  whatsappUrl: 'https://academy.example.test/community',
  questionFormUrl: 'https://academy.example.test/help',
};

const templates = [
  { name: 'invite', render: renderAdminInvite, action: 'acceptUrl' },
  { name: 'email change', render: renderEmailChange, action: 'confirmUrl' },
  { name: 'confirmation', render: renderEmailConfirmation, action: 'confirmUrl' },
  { name: 'expiration', render: renderExpirationWarning, action: 'renewUrl' },
  { name: 'magic link', render: renderMagicLinkLogin, action: 'loginUrl' },
  { name: 'membership', render: renderMembershipWelcome, action: 'loginUrl' },
  { name: 'recovery', render: renderPasswordRecovery, action: 'recoveryUrl' },
  { name: 'purchase', render: renderPurchaseConfirmed, action: 'courseUrl' },
  { name: 'migration', render: renderWelcomeMigration, action: 'loginUrl' },
  { name: 'welcome', render: renderWelcomeWithPassword, action: 'loginUrl' },
] as const;

describe('email templates use installation branding without delivery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('Rendering must not call an email provider or fetch an asset');
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  for (const template of templates) {
    it(`${template.name} renders two independent brands in HTML and text`, async () => {
      for (const brand of [
        { siteName: 'Aurora Academy', logoUrl: 'https://aurora.example.test/logo.png', primaryColor: '#185c37', foreground: '#ffffff' },
        { siteName: 'Solar School', logoUrl: 'https://solar.example.test/logo.png', primaryColor: '#ffe08a', foreground: '#000000' },
      ]) {
        const { html, text } = await template.render({ ...fixtures, ...brand });
        expect(html).toContain(`alt="${brand.siteName}"`);
        expect(html).toContain(`src="${brand.logoUrl}"`);
        expect(html).toContain(`background-color:${brand.primaryColor}`);
        expect(html).toContain(`color:${brand.foreground}`);
        expect(text).toContain(brand.siteName);
        expect(html).toContain(`href="${fixtures[template.action]}"`);
        expect(text).toContain(fixtures[template.action]);
        expect(html).not.toContain('{{');
        expect(text).not.toContain('<html');
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it(`${template.name} rejects unsafe action destinations before producing an email`, async () => {
      for (const actionUrl of ['javascript:alert(1)', 'https://user:password@example.test/action', '//example.test/action']) {
        await expect(template.render({
          ...fixtures,
          siteName: 'Demo Academy',
          [template.action]: actionUrl,
        })).rejects.toThrow('Email action URL');
      }
      expect(fetch).not.toHaveBeenCalled();
    });
  }

  it.each([
    ['pt', 'Todos os direitos reservados.'],
    ['es', 'Todos los derechos reservados.'],
  ] as const)('renders every persisted template with the %s defaults and frame', async (locale, footer) => {
    for (const template of templates) {
      const rendered = await template.render({
        ...fixtures,
        siteName: 'Demo Academy',
        locale,
        now: new Date('2042-01-01T00:00:00Z'),
      });
      expect(rendered.html).toContain(`lang="${locale}"`);
      expect(rendered.text).toContain(footer);
      expect(rendered.text).not.toContain('{{');
    }
  });

  it('falls back to safe branding for invalid colors and logo destinations', async () => {
    const { html } = await renderAdminInvite({
      ...fixtures,
      siteName: 'Demo Academy',
      primaryColor: 'red; background-image: url(https://untrusted.example.test)',
      logoUrl: 'https://user:password@example.test/logo.png',
    });
    expect(html).toContain(`background-color:${DEFAULT_EMAIL_PRIMARY_COLOR}`);
    expect(html).toContain('Demo Academy');
    expect(html).not.toContain('user:password');
    expect(html).not.toContain('untrusted.example.test');
    expect(html).not.toContain('<img');
  });
});
