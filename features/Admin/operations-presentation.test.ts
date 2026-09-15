import { describe, expect, it } from 'vitest';
import en from '@/core/i18n/locales/en/adminOperations.json';
import es from '@/core/i18n/locales/es/adminOperations.json';
import pt from '@/core/i18n/locales/pt/adminOperations.json';
import { WEBHOOK_PROVIDERS } from '@/lib/webhooks/providers';
import {
  adminOperationsError,
  localizeWebhookProvider,
} from './operations-presentation';

type TestTranslator = ((
  key: string,
  values?: Record<string, string | number>,
) => string) & { has(key: string): boolean };

function translator(locale: 'en' | 'pt' | 'es'): TestTranslator {
  const genericNames = {
    en: en.integrations.providers.generic.name,
    pt: pt.integrations.providers.generic.name,
    es: es.integrations.providers.generic.name,
  };
  const t = ((key: string) =>
    key === 'integrations.providers.generic.name'
      ? genericNames[locale]
      : `${locale}:${key}`) as TestTranslator;
  t.has = (key: string) =>
    key === 'errors.loadFailed' || key === 'errors.operationFailed';
  return t;
}

describe.each(['en', 'pt', 'es'] as const)(
  'admin operations presentation in %s',
  (locale) => {
    it('localizes provider guidance while preserving technical identity and destinations', () => {
      const provider = WEBHOOK_PROVIDERS.find(({ id }) => id === 'stripe');
      if (!provider) throw new Error('Expected Stripe provider fixture');

      const localized = localizeWebhookProvider(provider, translator(locale));

      expect(localized.tagline).toBe(
        `${locale}:integrations.providers.stripe.tagline`,
      );
      expect(localized.description).toBe(
        `${locale}:integrations.providers.stripe.description`,
      );
      expect(localized.capabilities).toEqual([
        `${locale}:integrations.providers.stripe.capabilities.purchases`,
        `${locale}:integrations.providers.stripe.capabilities.subscriptions`,
        `${locale}:integrations.providers.stripe.capabilities.refunds`,
        `${locale}:integrations.providers.stripe.capabilities.offerMapping`,
      ]);
      expect(localized.name).toBe(provider.name);
      expect(localized.logoPath).toBe(provider.logoPath);
      expect(localized.webhookPath).toBe(provider.webhookPath);
      expect(localized.helpUrl).toBe(provider.helpUrl);
      expect(localized.authMode).toBe(provider.authMode);
      expect(provider.tagline).toBe(
        'One-time and subscription billing — worldwide',
      );
    });

    it('localizes only the generic provider name by stable provider ID', () => {
      const generic = WEBHOOK_PROVIDERS.find(({ id }) => id === 'generic');
      const guru = WEBHOOK_PROVIDERS.find(({ id }) => id === 'guru');
      const stripe = WEBHOOK_PROVIDERS.find(({ id }) => id === 'stripe');
      if (!generic || !guru || !stripe) {
        throw new Error('Expected webhook provider fixtures');
      }

      const t = translator(locale);

      expect(localizeWebhookProvider(generic, t).name).toBe(
        {
          en: 'Generic webhook',
          pt: 'Webhook genérico',
          es: 'Webhook genérico',
        }[locale],
      );
      expect(localizeWebhookProvider(guru, t).name).toBe(guru.name);
      expect(localizeWebhookProvider(stripe, t).name).toBe(stripe.name);
      expect(generic.name).toBe('Generic webhook');
    });

    it('selects localized stable errors and hides unknown diagnostics', () => {
      const t = translator(locale);

      expect(adminOperationsError(t, new Error('loadFailed'))).toBe(
        `${locale}:errors.loadFailed`,
      );
      expect(
        adminOperationsError(t, new Error('PRIVATE provider diagnostic')),
      ).toBe(`${locale}:errors.operationFailed`);
    });
  },
);
