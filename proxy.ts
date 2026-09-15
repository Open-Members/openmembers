import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import createMiddleware from 'next-intl/middleware';
import { routing } from './core/i18n/routing';
import { hasSupabaseConfiguration, hasSupabaseAdminConfiguration } from './core/config/env';
import { createSupabaseServerFetch } from './core/supabase/server-transport';

const intlMiddleware = createMiddleware(routing);

// Baseline browser-side hardening. CSP is intentionally omitted until we
// audit every inline <style>/<script> + nonce strategy under Next 16; the
// rest of these are zero-risk defaults.
//
// Mirrored in next.config.ts for routes outside the proxy matcher.
function applySecurityHeaders(res: NextResponse): void {
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // SAMEORIGIN (not DENY) so the lesson player can iframe our own
  // certificate / preview routes from inside the app.
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  );
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
}

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/courses',
  '/progress',
  '/settings',
  '/profile',
  '/certificates',
  '/admin',
  '/change-password',
  '/support',
  '/notifications',
];

const AUTH_ONLY_PAGES = new Set([
  '/login',
  '/register',
  '/forgot-password',
]);

// Clear every `sb-*` cookie on the response so a corrupted auth session
// can't keep breaking subsequent requests. Called when @supabase/ssr
// fails to parse its own cookie (we saw a "JSON at position 832" crash
// after a server restart mid-refresh; this is the recovery path).
function clearSupabaseCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' });
    }
  }
}

export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const apiResponse = hasSupabaseConfiguration() && hasSupabaseAdminConfiguration()
      ? NextResponse.next()
      : NextResponse.json(
          { error: 'not_configured' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    applySecurityHeaders(apiResponse);
    return apiResponse;
  }
  const response = intlMiddleware(request);

  // Normalize optional locale prefixes before applying route guards.
  const pathname = request.nextUrl.pathname.replace(/^\/(en|es|pt)(?=\/|$)/, '') || '/';

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  const isChangePw =
    pathname === '/change-password' || pathname.startsWith('/change-password/');
  const isAuthPage = AUTH_ONLY_PAGES.has(pathname);

  if (!hasSupabaseConfiguration()) {
    const needsConfiguration = isProtected || isAuthPage ||
      pathname === '/reset-password' || pathname === '/thank-you' || pathname === '/suspended';
    if (needsConfiguration) {
      const url = request.nextUrl.clone();
      url.pathname = '/setup';
      url.search = '';
      const setupResponse = NextResponse.redirect(url);
      applySecurityHeaders(setupResponse);
      return setupResponse;
    }
    applySecurityHeaders(response);
    return response;
  }

  // RSC prefetches are speculative — the full middleware re-runs on the
  // real navigation. For public pages (neither protected nor auth-only)
  // none of the routing decisions below depend on the user, so skip the
  // Supabase round-trips entirely and return the intl response as-is.
  // Prefetches of protected/auth pages still authenticate so the
  // login/dashboard redirects stay correct.
  const isPrefetch = request.headers.get('next-router-prefetch') === '1';
  if (isPrefetch && !isProtected && !isAuthPage) {
    applySecurityHeaders(response);
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: createSupabaseServerFetch() },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() authenticates the session against Supabase's server rather
  // than trusting the cookie blindly (as getSession() would). Costs one
  // HTTP round-trip per request — the security tradeoff we accept here.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[proxy] auth.getUser failed, clearing sb-* cookies:', msg);
    clearSupabaseCookies(request, response);
    user = null;
  }

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/login') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = '';
    const redirected = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirected.cookies.set(cookie);
    applySecurityHeaders(redirected);
    return redirected;
  };

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('status, must_change_password')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile) {
      if (isProtected || isAuthPage || isChangePw) {
        if (profileError) console.error('[proxy] account profile lookup failed');
        return redirectTo('/account-unavailable');
      }
    } else {
      if (profile.status !== 'active' && pathname !== '/suspended') return redirectTo('/suspended');
      if (profile.status === 'active') {
        const exempt = isChangePw || pathname === '/reset-password' || pathname === '/suspended';
        if (profile.must_change_password && !exempt) return redirectTo('/change-password');
        if (isAuthPage) return redirectTo('/dashboard');
      }
    }
  }

  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|html)$).*)',
  ],
};
