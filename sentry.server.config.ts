import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim();

// Silent no-op when DSN isn't configured. Local dev is fine without it;
// staging/prod should always have one set.
if (dsn) {
  Sentry.init({
    dsn,
    // 10% of transactions traced. Bump up in staging if you need more
    // detail while reproducing issues.
    tracesSampleRate: 0.1,
    debug: false,
    // Silence the noisy "Sentry Logger" breadcrumb category.
    enableLogs: false,
  });
}
