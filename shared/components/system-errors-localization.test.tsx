import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/core/i18n/routing', () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import ErrorPage from '@/app/[locale]/error';
import en from '@/core/i18n/locales/en';
import es from '@/core/i18n/locales/es';
import pt from '@/core/i18n/locales/pt';
import { ErrorBoundary } from './ErrorBoundary';

const catalogs = { en, pt, es } as const;

function Broken(): never {
  throw new Error('private diagnostic');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(['en', 'pt', 'es'] as const)('exceptional screens in %s', (locale) => {
  it('localizes the component boundary without exposing the diagnostic', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>
      </NextIntlClientProvider>,
    );

    const copy = catalogs[locale].system.componentError;
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.refresh })).toBeInTheDocument();
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument();
  });

  it('localizes the segment error and keeps its technical reference', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reset = vi.fn();
    render(
      <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
        <ErrorPage error={Object.assign(new Error('private diagnostic'), { digest: 'fixture-ref' })} reset={reset} />
      </NextIntlClientProvider>,
    );

    const copy = catalogs[locale].system.pageError;
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.reference.replace('{digest}', 'fixture-ref'))).toBeInTheDocument();
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
