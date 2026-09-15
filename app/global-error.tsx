'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/core/i18n/config';
import { resolveGlobalErrorLocale } from '@/core/i18n/global-error-locale';
import enSystem from '@/core/i18n/locales/en/system.json';
import esSystem from '@/core/i18n/locales/es/system.json';
import ptSystem from '@/core/i18n/locales/pt/system.json';

const messages = {
  en: enSystem.globalError,
  es: esSystem.globalError,
  pt: ptSystem.globalError,
} satisfies Record<Locale, typeof enSystem.globalError>;

/**
 * Last-resort error boundary. It replaces the root layout, so it carries a
 * minimal local dictionary and never depends on the request provider or DB.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // English is deterministic for SSR; the confirmed cookie is applied after mount.
  const [locale, setLocale] = useState<Locale>('en');
  const copy = messages[locale];

  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  useEffect(() => {
    let frame: number | undefined;
    try {
      const resolved = resolveGlobalErrorLocale(
        document.cookie,
        navigator.languages?.length ? navigator.languages : [navigator.language],
      );
      document.documentElement.lang = resolved;
      frame = window.requestAnimationFrame(() => setLocale(resolved));
    } catch {
      document.documentElement.lang = 'en';
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '4rem 1.5rem',
          textAlign: 'center',
          backgroundColor: '#0a0b0e',
          color: '#f2f1ee',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <title>{copy.title}</title>
        <div
          aria-hidden
          style={{
            height: '64px',
            width: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '16px',
            border: '1px solid rgba(242, 5, 5, 0.3)',
            backgroundColor: 'rgba(242, 5, 5, 0.08)',
            fontSize: '28px',
          }}
        >
          ⚠
        </div>
        <p
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#8e8d93',
            margin: 0,
          }}
        >
          {copy.eyebrow}
        </p>
        <h1
          style={{
            fontSize: 'clamp(1.875rem, 5vw, 2.5rem)',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            margin: 0,
            maxWidth: '40rem',
          }}
        >
          {copy.title}
        </h1>
        <p
          style={{
            fontSize: '1rem',
            lineHeight: 1.6,
            color: '#a9a8ad',
            maxWidth: '28rem',
            margin: 0,
          }}
        >
          {copy.description}
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: '0.75rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: '#6a6970',
              margin: 0,
            }}
          >
            {copy.reference.replace('{digest}', error.digest)}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '0.625rem 1.5rem',
            borderRadius: '9999px',
            backgroundColor: '#0235A8',
            color: '#ffffff',
            fontSize: '0.875rem',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 3px 0 #022660',
          }}
        >
          {copy.retry}
        </button>
      </body>
    </html>
  );
}
