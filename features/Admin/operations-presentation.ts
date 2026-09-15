'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { WebhookProviderSpec } from '@/lib/webhooks/providers';

type Translator = ((
  key: string,
  values?: Record<string, string | number>,
) => string) & { has(key: string): boolean };

/** Server diagnostics stay in logs; only stable codes select product copy. */
export function adminOperationsError(
  t: Translator,
  error: unknown,
  fallback = 'operationFailed',
): string {
  const code =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(code) && t.has(`errors.${code}`)
    ? t(`errors.${code}`)
    : t(`errors.${fallback}`);
}

const PROVIDER_CAPABILITIES = {
  stripe: ['purchases', 'subscriptions', 'refunds', 'offerMapping'],
  guru: ['purchases', 'subscriptions', 'refunds', 'multiProduct'],
  generic: ['purchases', 'manualMapping', 'unsupportedProviders'],
} as const;

/**
 * Translates explanatory provider copy by stable provider ID while retaining
 * the provider's identity, URLs, paths and authentication behavior verbatim.
 */
export function localizeWebhookProvider(
  provider: WebhookProviderSpec,
  t: Translator,
): WebhookProviderSpec {
  const capabilityKeys = PROVIDER_CAPABILITIES[provider.id];
  const base = `integrations.providers.${provider.id}`;
  const translated: WebhookProviderSpec = {
    ...provider,
    name: provider.id === 'generic' ? t(`${base}.name`) : provider.name,
    tagline: t(`${base}.tagline`),
    description: t(`${base}.description`),
    secretLabel: provider.secretLabel ? t(`${base}.secretLabel`) : '',
    secretPlaceholder: provider.secretPlaceholder
      ? t(`${base}.secretPlaceholder`)
      : '',
    secretWhatIsIt: provider.secretWhatIsIt
      ? t(`${base}.secretWhatIsIt`)
      : '',
    secretWhereToFind: provider.secretWhereToFind
      ? t(`${base}.secretWhereToFind`)
      : '',
    productIdLabel: t(`${base}.productIdLabel`),
    productIdPlaceholder: t(`${base}.productIdPlaceholder`),
    productIdInstructions: t(`${base}.productIdInstructions`),
    capabilities: capabilityKeys.map((key) =>
      t(`${base}.capabilities.${key}`),
    ),
  };

  if (provider.producerIdLabel) {
    translated.producerIdLabel = t(`${base}.producerIdLabel`);
    translated.producerIdPlaceholder = t(`${base}.producerIdPlaceholder`);
    translated.producerIdWhatIsIt = t(`${base}.producerIdWhatIsIt`);
    translated.producerIdWhereToFind = t(`${base}.producerIdWhereToFind`);
  }

  return translated;
}

export function useAdminOperationsPresentation() {
  const t = useTranslations('adminOperations');
  const format = useFormatter();

  return {
    t,
    error: (error: unknown, fallback?: string) =>
      adminOperationsError(t, error, fallback),
    dateTime: (value: string) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? '—'
        : format.dateTime(date, {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
    },
    number: (value: number) => format.number(value),
  };
}
