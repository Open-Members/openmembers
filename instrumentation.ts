import * as Sentry from '@sentry/nextjs';

// Runtime-specific init. Next.js calls this once per server boot for
// each runtime (nodejs for Server Components / Route Handlers, edge for
// Middleware / Edge Functions). Dynamic imports keep edge bundles clean.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors thrown inside Server Components, Route Handlers,
// Server Actions and generateMetadata. Without this hook Sentry sees
// only browser/thrown-at-request-boundary errors.
export const onRequestError = Sentry.captureRequestError;
