import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/core/i18n/locales/en/adminPeople.json';
import pt from '@/core/i18n/locales/pt/adminPeople.json';
import es from '@/core/i18n/locales/es/adminPeople.json';
import { AdminImportStudents } from './AdminImportStudents';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  bulkImport: vi.fn(),
  danger: vi.fn(),
}));

vi.mock('../actions', () => ({
  previewBulkImport: mocks.preview,
  bulkImportStudents: mocks.bulkImport,
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
        messages={{ adminPeople: catalogs[locale] }}
        now={new Date('2026-09-13T12:00:00Z')}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

function dataCsv(link: HTMLElement) {
  const href = link.getAttribute('href') ?? '';
  return decodeURIComponent(href.slice(href.indexOf(',') + 1));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue([
    {
      rowIndex: 2,
      email: 'valid@example.test',
      name: 'Valid learner',
      accessLevelSlug: 'premium',
      accessLevelName: 'Premium',
      expirationDate: null,
      cohortSlug: null,
      cohortName: null,
      userExists: false,
      status: 'valid',
      reasonCode: null,
      resolved: {
        email: 'valid@example.test',
        name: 'Valid learner',
        accessLevelId: 'level-1',
        cohortId: null,
        expiresAtIso: null,
      },
    },
    {
      rowIndex: 3,
      email: '',
      name: 'Invalid learner',
      accessLevelSlug: 'premium',
      accessLevelName: 'Premium',
      expirationDate: null,
      cohortSlug: 'missing',
      cohortName: 'missing',
      userExists: false,
      status: 'error',
      reasonCode: 'unknownCohort',
      reasonValues: { slug: 'missing' },
      resolved: null,
    },
  ]);
});

afterEach(cleanup);

describe.each([
  ['en', 'Unknown cohort: missing.', '(blank)'],
  ['pt', 'Turma desconhecida: missing.', '(em branco)'],
  ['es', 'Grupo desconocido: missing.', '(vacío)'],
] as const)('student import in %s', (locale, reason, blank) => {
  it('localizes examples, screen errors and the decoded error CSV', async () => {
    mocks.bulkImport.mockResolvedValue({
      totalRows: 2,
      created: 1,
      addedToExisting: 0,
      skippedErrors: 1,
      errors: [
        {
          rowIndex: 3,
          email: '',
          reasonCode: 'unknownCohort',
          reasonValues: { slug: 'missing' },
        },
      ],
    });

    render(
      <AdminImportStudents
        accessLevels={[
          {
            id: 'level-1',
            name: 'Premium',
            slug: 'premium',
            description: null,
            courseIds: [],
            courseNames: [],
            enrollmentCount: 0,
          },
        ]}
      />,
      { wrapper: wrapper(locale) },
    );

    const template = screen.getByRole('link', {
      name: catalogs[locale].downloadTemplate,
    });
    expect(template).toHaveAttribute('download', 'students-template.csv');
    expect(dataCsv(template)).toContain(
      `${catalogs[locale].examples.primaryStudentEmail},${catalogs[locale].examples.primaryStudentName},premium,2027-04-01,,true`,
    );

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: {
        files: [
          new File(
            ['email,name,access_level_slug\nvalid@example.test,Valid,premium\n'],
            'students.csv',
            { type: 'text/csv' },
          ),
        ],
      },
    });

    expect(await screen.findByText('students.csv')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: catalogs[locale].previewRows }),
    );
    expect(await screen.findByTitle(reason)).toBeVisible();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(catalogs[locale].importRows.split('{')[0], 'i'),
      }),
    );

    expect(await screen.findByText(blank)).toBeVisible();
    expect(document.body).toHaveTextContent(reason);
    const errorReport = screen.getByRole('link', {
      name: catalogs[locale].downloadErrorReport,
    });
    expect(errorReport).toHaveAttribute('download', 'import-errors.csv');
    expect(dataCsv(errorReport)).toBe(
      `row_index,email,reason\n3,${blank},${reason}`,
    );
    await waitFor(() => expect(mocks.bulkImport).toHaveBeenCalledTimes(1));
  });
});
