// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(),
  resolveRecipientLocale: vi.fn(),
  requireAdmin: vi.fn(),
  getTenantSettings: vi.fn(),
  loadTemplateContentForAdmin: vi.fn(),
  loadLocalizedTemplateContent: vi.fn(),
  renderWelcomeWithPassword: vi.fn(),
  renderPurchaseConfirmed: vi.fn(),
  renderExpirationWarning: vi.fn(),
  renderMembershipWelcome: vi.fn(),
  sendTransactional: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getLocale: mocks.getLocale }));
vi.mock('@/core/i18n/recipient-locale.server', () => ({
  resolveRecipientLocale: mocks.resolveRecipientLocale,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/core/access/admin', () => ({
  requireAdmin: mocks.requireAdmin,
  requireManageableUser: vi.fn(),
}));
vi.mock('@/core/theme/settings', () => ({
  getTenantSettings: mocks.getTenantSettings,
}));
vi.mock('@/lib/services/email/resend', () => ({
  sendTransactional: mocks.sendTransactional,
}));
vi.mock('@/lib/services/email/branding', () => ({
  getEmailBranding: () => ({ siteName: 'Open Members' }),
  resolveMembershipEmailLinks: () => ({
    whatsappUrl: '',
    questionFormUrl: '',
  }),
}));
vi.mock('@/core/config/installation.server', () => ({
  getInstallationConfig: vi.fn(async () => ({ links: {} })),
}));
vi.mock('@/lib/services/email/templates/load', () => ({
  loadTemplateContentForAdmin: mocks.loadTemplateContentForAdmin,
}));
vi.mock('@/lib/services/email/templates', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/services/email/templates')
  >();
  return {
    ...actual,
    loadLocalizedTemplateContent: mocks.loadLocalizedTemplateContent,
    renderWelcomeWithPassword: mocks.renderWelcomeWithPassword,
    renderPurchaseConfirmed: mocks.renderPurchaseConfirmed,
    renderExpirationWarning: mocks.renderExpirationWarning,
    renderMembershipWelcome: mocks.renderMembershipWelcome,
  };
});

import {
  getEmailTemplates,
  previewEmailTemplate,
  sendTemplateTestEmail,
  sendTestEmail,
} from './actions';
import { TEMPLATE_KEYS } from '@/lib/services/email/templates';

const rendered = {
  subject: 'Authored subject',
  html: '<p>Authored body</p>',
  text: 'Authored body',
};

describe('localized admin email previews', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getLocale.mockResolvedValue('pt');
    mocks.resolveRecipientLocale.mockResolvedValue({
      locale: 'pt',
      source: 'profile',
    });
    mocks.requireAdmin.mockResolvedValue({ callerId: 'admin-1' });
    mocks.getTenantSettings.mockResolvedValue({});
    mocks.loadLocalizedTemplateContent.mockResolvedValue({
      subject: 'Conteúdo salvo',
    });
    mocks.loadTemplateContentForAdmin.mockImplementation(
      async (_templateKey: string, defaults: Record<string, string>) => ({
        content: defaults,
        hasOverride: false,
        overrideFields: [],
      }),
    );
    mocks.renderWelcomeWithPassword.mockResolvedValue(rendered);
    mocks.renderPurchaseConfirmed.mockResolvedValue(rendered);
    mocks.renderExpirationWarning.mockResolvedValue(rendered);
    mocks.renderMembershipWelcome.mockResolvedValue(rendered);
    mocks.sendTransactional.mockResolvedValue({
      success: true,
      messageId: 'message-1',
    });
  });

  it('loads the saved default in the admin locale and audits its source', async () => {
    await expect(sendTestEmail('person@example.test')).resolves.toEqual({
      success: true,
      messageId: 'message-1',
    });

    expect(mocks.loadLocalizedTemplateContent).toHaveBeenCalledWith(
      TEMPLATE_KEYS.WELCOME_WITH_PASSWORD,
      'pt',
    );
    expect(mocks.renderWelcomeWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        studentName: 'Pessoa de Teste',
        courseTitle: 'Curso de Exemplo',
        locale: 'pt',
        now: expect.any(Date),
      }),
      { subject: 'Conteúdo salvo' },
    );
    expect(mocks.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[TESTE] Authored subject',
        metadata: expect.objectContaining({
          locale: 'pt',
          localeSource: 'profile',
        }),
      }),
    );
  });

  it.each([
    ['pt', 'Boas-vindas à {{siteName}} — sua conta está pronta'],
    ['es', 'Te damos la bienvenida a {{siteName}} — tu cuenta está lista'],
  ])('loads editable defaults in the active %s locale', async (locale, subject) => {
    mocks.getLocale.mockResolvedValue(locale);

    const templates = await getEmailTemplates();

    expect(templates[0].content.subject).toBe(subject);
    expect(templates[0].isDefault).toBe(true);
    expect(templates[0].overrideFields).toEqual([]);
    expect(mocks.loadTemplateContentForAdmin).toHaveBeenCalledTimes(4);
  });

  it('preserves draft content and uses one clock for the Spanish expiration preview', async () => {
    mocks.getLocale.mockResolvedValue('es');
    const draft = { subject: 'Texto del administrador' };

    await expect(
      previewEmailTemplate(TEMPLATE_KEYS.EXPIRATION_WARNING_7D, draft),
    ).resolves.toEqual({
      subject: rendered.subject,
      html: rendered.html,
    });

    const [vars, receivedContent] = mocks.renderExpirationWarning.mock.calls[0];
    expect(receivedContent).toBe(draft);
    expect(vars).toEqual(
      expect.objectContaining({
        studentName: 'Persona de Prueba',
        courseTitle: 'Curso de Ejemplo',
        locale: 'es',
        now: expect.any(Date),
      }),
    );
    expect(new Date(vars.expiresAt).getTime() - vars.now.getTime()).toBe(
      7 * 86_400_000,
    );
  });

  it('uses the localized test prefix without changing unsaved content', async () => {
    mocks.getLocale.mockResolvedValue('es');
    mocks.resolveRecipientLocale.mockResolvedValue({
      locale: 'es',
      source: 'hint',
    });
    const draft = { subject: 'Asunto escrito' };

    await expect(
      sendTemplateTestEmail(
        TEMPLATE_KEYS.PURCHASE_CONFIRMED,
        draft,
        'person@example.test',
      ),
    ).resolves.toEqual({ success: true, messageId: 'message-1' });

    expect(mocks.renderPurchaseConfirmed.mock.calls[0][1]).toBe(draft);
    expect(mocks.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[PRUEBA] Authored subject',
        metadata: expect.objectContaining({
          locale: 'es',
          localeSource: 'hint',
        }),
      }),
    );
  });

  it('falls back to English for an unexpected request locale', async () => {
    mocks.getLocale.mockResolvedValue('de');
    mocks.resolveRecipientLocale.mockResolvedValue({
      locale: 'en',
      source: 'default',
    });

    await sendTestEmail('person@example.test');

    expect(mocks.loadLocalizedTemplateContent).toHaveBeenCalledWith(
      TEMPLATE_KEYS.WELCOME_WITH_PASSWORD,
      'en',
    );
    expect(mocks.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '[TEST] Authored subject' }),
    );
  });

  it('maps a failed override read without attempting delivery', async () => {
    mocks.loadLocalizedTemplateContent.mockRejectedValue(
      new Error('private database details'),
    );

    await expect(sendTestEmail('person@example.test')).resolves.toEqual({
      error: 'sendFailed',
    });
    expect(mocks.sendTransactional).not.toHaveBeenCalled();
  });

  it('does not send when the caller locale cannot be confirmed', async () => {
    mocks.resolveRecipientLocale.mockRejectedValue(
      new Error('localeReadFailed'),
    );

    await expect(sendTestEmail('person@example.test')).resolves.toEqual({
      error: 'sendFailed',
    });
    expect(mocks.loadLocalizedTemplateContent).not.toHaveBeenCalled();
    expect(mocks.sendTransactional).not.toHaveBeenCalled();
  });
});
