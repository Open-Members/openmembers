import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/core/i18n/locales/en/search.json';
import pt from '@/core/i18n/locales/pt/search.json';
import es from '@/core/i18n/locales/es/search.json';
import type { SearchResult } from '../types';

const mocks = vi.hoisted(() => ({ search: vi.fn(), push: vi.fn(), close: vi.fn() }));
vi.mock('../actions', () => ({ searchGlobalAction: mocks.search }));
vi.mock('@/core/i18n/routing', () => ({ useRouter: () => ({ push: mocks.push }) }));
import { SearchPalette } from './SearchPalette';

const result: SearchResult = { query: 'Autoral', courses: [{ kind: 'course', id: 'c', slug: 'curso', title: 'Autoral Original', subtitle: 'Descrição original', thumbnailUrl: null, locked: true, href: '/courses/curso' }], lessons: [{ kind: 'lesson', id: 'l', slug: 'aula', title: 'Aula Original', description: null, courseSlug: 'curso', courseTitle: 'Autoral Original', locked: false, href: '/courses/curso/aula' }] };
const empty: SearchResult = { query: 'zz', courses: [], lessons: [] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.search.mockResolvedValue(result);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function search(value = 'Autoral') {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
}

describe.each([{ locale: 'en', messages: en }, { locale: 'pt', messages: pt }, { locale: 'es', messages: es }])('search $locale', ({ locale, messages }) => {
  function view(open = true) {
    return <NextIntlClientProvider locale={locale} messages={{ search: messages }}><SearchPalette open={open} onClose={mocks.close} /></NextIntlClientProvider>;
  }
  it('localizes controls, result types, accessibility and navigation while preserving content', async () => {
    render(view());
    expect(screen.getByRole('dialog', { name: messages.title })).toBeInTheDocument();
    expect(screen.getByText(messages.minimum)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: messages.input })).toHaveAttribute('placeholder', messages.placeholder);
    await search();
    expect(screen.getByText(messages.courses)).toBeInTheDocument();
    expect(screen.getByText(messages.lessons)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.locked)).toBeInTheDocument();
    expect(screen.getByText('Descrição original')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(mocks.push).toHaveBeenCalledWith('/courses/curso/aula');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('lets the close button handle Enter without navigating to the active result', async () => {
    render(view());
    await search();
    fireEvent.keyDown(screen.getByRole('button', { name: messages.close }), { key: 'Enter' });
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: messages.close }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it.each(['code', 'transport'])('distinguishes %s errors from empty results and retries', async mode => {
    if (mode === 'code') mocks.search.mockResolvedValueOnce({ ...empty, error: 'searchFailed' });
    else mocks.search.mockRejectedValueOnce(new Error('private diagnostic'));
    render(view());
    await search('zz');
    expect(screen.getByRole('alert')).toHaveTextContent(messages.failed);
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.retry }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByText('Descrição original')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('keeps authorized partial results alongside a localized failure', async () => {
    mocks.search.mockResolvedValue({ ...result, error: 'searchFailed' });
    render(view()); await search();
    expect(screen.getByRole('alert')).toHaveTextContent(messages.failed);
    expect(screen.getByText('Descrição original')).toBeInTheDocument();
  });
  it('shows an interpolated empty result', async () => {
    mocks.search.mockResolvedValue(empty);
    render(view()); await search('zz');
    expect(screen.getByText(messages.empty.replace('{query}', 'zz'))).toBeInTheDocument();
  });
  it.each(['new-query', 'short-query', 'close'])('ignores an old response after %s', async change => {
    const old = deferred<SearchResult>();
    mocks.search.mockReturnValueOnce(old.promise).mockResolvedValueOnce(empty);
    const rendered = render(view());
    await search();
    expect(screen.getByRole('status')).toHaveTextContent(messages.loading);
    if (change === 'close') {
      rendered.rerender(view(false));
      rendered.rerender(view(true));
    } else await search(change === 'new-query' ? 'zz' : 'z');
    await act(async () => { old.resolve(result); });
    expect(screen.queryByText('Descrição original')).not.toBeInTheDocument();
    if (change !== 'new-query') expect(screen.getByText(messages.minimum)).toBeInTheDocument();
  });
});
