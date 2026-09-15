import { describe, expect, it } from 'vitest';
import { resolveGlobalErrorLocale } from './global-error-locale';

describe('resolveGlobalErrorLocale', () => {
  it('prefers the confirmed locale cookie over browser languages', () => {
    expect(resolveGlobalErrorLocale('theme=dark; NEXT_LOCALE=pt', ['es-ES'])).toBe('pt');
  });

  it('accepts supported regional browser locales', () => {
    expect(resolveGlobalErrorLocale('', ['fr-FR', 'es-MX'])).toBe('es');
    expect(resolveGlobalErrorLocale('', ['pt_BR'])).toBe('pt');
  });

  it('ignores malformed or unsupported values and falls back to English', () => {
    expect(resolveGlobalErrorLocale('NEXT_LOCALE=%E0%A4%A', ['de-DE'])).toBe('en');
    expect(resolveGlobalErrorLocale('NEXT_LOCALE=javascript%3Aalert(1)', [])).toBe('en');
  });
});
