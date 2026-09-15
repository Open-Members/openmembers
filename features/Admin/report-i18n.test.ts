import { describe, expect, it } from 'vitest';
import en from '@/core/i18n/locales/en/adminReports.json';
import es from '@/core/i18n/locales/es/adminReports.json';
import pt from '@/core/i18n/locales/pt/adminReports.json';
import {
  emailDeliveryIssueTypes,
  getEmailDeliverySummary,
} from './report-i18n';

const catalogs = { en, pt, es };

describe.each(['en', 'pt', 'es'] as const)(
  'email delivery summaries in %s',
  (locale) => {
    const copy = catalogs[locale].emailDeliverySummaries;

    it('maps every supported issue event to product-authored copy', () => {
      for (const eventType of emailDeliveryIssueTypes) {
        expect(getEmailDeliverySummary(eventType, copy)).toBe(copy[eventType]);
      }
    });

    it('uses the safe fallback for unknown provider events', () => {
      expect(getEmailDeliverySummary('legacy_provider_bounce', copy)).toBe(
        copy.unknown,
      );
    });
  },
);
