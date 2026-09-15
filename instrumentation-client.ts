// Sentry SDK is dynamically imported and only loaded on authenticated
// routes. The landing page (and login/register/forgot-password) never
// download the SDK — saves ~80-150 KB of JS for visitors who haven't
// signed in yet, which is exactly the cohort the landing's PageSpeed
// score targets.
//
// `instrumentation-client.ts` runs once at app boot. To handle the
// case where a user lands on the public site, navigates client-side
// to /login, then to /dashboard, we also lazy-init from the
// `onRouterTransitionStart` hook — Next calls it on every client-side
// route change with the destination href, so we can detect the first
// transition into an auth route and initialise then.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

// Top-level paths whose JS is worth tracing in Sentry. Public routes
// (landing, login, register, forgot-password, terms, privacy) stay
// out of this list on purpose.
const AUTH_PREFIXES = [
  '/dashboard',
  '/admin',
  '/courses',
  '/settings',
  '/progress',
  '/profile',
  '/certificates',
  '/change-password',
  '/support',
  '/notifications',
];

function pathLooksAuthed(rawPath: string): boolean {
  // Strip a possible /[locale]/ prefix (next-intl adds e.g. /en/admin).
  const stripped = rawPath.replace(/^\/[a-z]{2}(?=\/|$)/, '');
  return AUTH_PREFIXES.some(
    (p) => stripped === p || stripped.startsWith(p + '/'),
  );
}

type SentryModule = typeof import('@sentry/nextjs');

let initPromise: Promise<SentryModule> | null = null;

function ensureSentry(): Promise<SentryModule> | null {
  if (!dsn) return null;
  if (!initPromise) {
    initPromise = import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        // Session Replay intentionally off — adds ~70 KB to the client
        // and we haven't decided on privacy posture yet.
        debug: false,
        enableLogs: false,
      });
      return Sentry;
    });
  }
  return initPromise;
}

// Boot: only download the SDK if the very first request landed on an
// auth route. SSR-on-/dashboard, hard refresh on /admin, etc.
if (typeof window !== 'undefined' && pathLooksAuthed(window.location.pathname)) {
  ensureSentry();
}

// Wires up router navigation traces (App Router client-side
// transitions). For unauth navigations we no-op; for the first
// transition into an auth route we kick off the dynamic import.
export async function onRouterTransitionStart(
  href: string,
  navigationType?: unknown,
) {
  let target: string;
  try {
    target = new URL(href, window.location.origin).pathname;
  } catch {
    target = href;
  }
  if (!pathLooksAuthed(target)) return;

  const sentry = await ensureSentry();
  if (!sentry) return;
  // Type assertion: navigationType arg shape comes from Next's
  // internal RouterTransitionStart type and is passed straight
  // through to Sentry's matching API.
  (sentry.captureRouterTransitionStart as unknown as (h: string, n?: unknown) => void)(
    href,
    navigationType,
  );
}
