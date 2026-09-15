import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/core/i18n/locales/en/adminAccess.json';
import pt from '@/core/i18n/locales/pt/adminAccess.json';
import es from '@/core/i18n/locales/es/adminAccess.json';
import { UserEnrollmentsPanel } from './UserEnrollmentsPanel';

const mocks = vi.hoisted(() => ({
  getUserEnrollments: vi.fn(),
  getAdminAccessLevels: vi.fn(),
  getCohortsForCourses: vi.fn(),
  enrollUser: vi.fn(),
  deactivateEnrollment: vi.fn(),
  reactivateEnrollment: vi.fn(),
  danger: vi.fn(),
}));

vi.mock('../actions', () => ({
  getUserEnrollments: mocks.getUserEnrollments,
  getAdminAccessLevels: mocks.getAdminAccessLevels,
}));

vi.mock('@/features/Cohorts/actions', () => ({
  getCohortsForCourses: mocks.getCohortsForCourses,
}));

vi.mock('@/features/Enrollment/actions', () => ({
  enrollUser: mocks.enrollUser,
  deactivateEnrollment: mocks.deactivateEnrollment,
  reactivateEnrollment: mocks.reactivateEnrollment,
}));

vi.mock('@/shared/lib/toast', () => ({
  appToast: { danger: mocks.danger },
}));

const catalogs = { en, pt, es };

function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={{ adminAccess: catalogs[locale] }}
        now={new Date('2026-09-12T12:00:00Z')}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserEnrollments.mockResolvedValue([]);
  mocks.getAdminAccessLevels.mockResolvedValue([]);
  mocks.getCohortsForCourses.mockResolvedValue({});
});

afterEach(cleanup);

describe.each([
  ['en', ['1 month', '3 months', '6 months', '1 year']],
  ['pt', ['1 mês', '3 meses', '6 meses', '1 ano']],
  ['es', ['1 mes', '3 meses', '6 meses', '1 año']],
] as const)('enrollment expiration presets in %s', (locale, labels) => {
  it('renders every visible preset from the profile locale catalog', async () => {
    render(
      <UserEnrollmentsPanel
        userId="00000000-0000-4000-8000-000000000001"
        userName="Fixture Student"
        onClose={vi.fn()}
      />,
      { wrapper: wrapper(locale) },
    );

    for (const label of labels) {
      expect(await screen.findByRole('button', { name: label })).toBeVisible();
    }
    expect(document.body).not.toHaveTextContent(/\b(?:mo|yr)\b/);
  });
});
