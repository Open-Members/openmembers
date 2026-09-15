import { describe, expect, it } from 'vitest';
import { negotiateLocale } from './negotiation';

describe('locale negotiation outside the proxy', () => {
  it.each(['en', 'pt', 'es'] as const)('honors the explicit %s cookie before the browser', (locale) => {
    expect(negotiateLocale(locale, 'es,pt;q=0.8,en;q=0.5')).toBe(locale);
  });

  it.each([
    ['pt-BR,pt;q=0.9,en;q=0.8', 'pt'],
    ['es-MX,en-US;q=0.5', 'es'],
    ['en-US;q=0.2,pt-BR;q=0.9', 'pt'],
    ['fr-FR,es;q=0.8,en;q=0.4', 'es'],
    [' PT-br ; q=0.8 , ES ; q=0.9 ', 'es'],
    ['pt;q=0,es;q=0.5', 'es'],
    ['pt;q=0.7,es;q=0.7', 'pt'],
    ['pt;q=2,es;q=0.5', 'es'],
    ['pt;q=oops,es;q=0.5', 'es'],
    ['*', 'en'],
    ['pt;q=0,es;q=0,en;q=0', 'en'],
    ['fr-FR', 'en'],
    ['', 'en'],
    [null, 'en'],
  ])('resolves %s to %s without selecting rejected entries', (header, expected) => {
    expect(negotiateLocale('unsupported', header)).toBe(expected);
  });
});
