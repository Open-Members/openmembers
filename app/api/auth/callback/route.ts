import { createClient } from "@/core/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveAuthOrigin, sanitizeAuthNext } from "@/core/security/auth-redirect";
import { negotiateLocale } from '@/core/i18n/negotiation';
import en from '@/core/i18n/locales/en/authPages.json';
import es from '@/core/i18n/locales/es/authPages.json';
import pt from '@/core/i18n/locales/pt/authPages.json';

type OtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

function isOtpType(v: string | null): v is OtpType {
  return v === 'signup' || v === 'invite' || v === 'magiclink'
      || v === 'recovery' || v === 'email_change' || v === 'email';
}

const AUTH_ORIGIN_ERROR = 'auth_origin_unavailable';
const AUTH_PAGE_CATALOGS = { en, es, pt };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

/** Render in place because an absolute redirect cannot be built without a trusted origin. */
function authOriginUnavailable(request: NextRequest): NextResponse {
  const locale = negotiateLocale(
    request.cookies.get('NEXT_LOCALE')?.value,
    request.headers.get('accept-language'),
  );
  const copy = AUTH_PAGE_CATALOGS[locale].login.originUnavailable;
  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(copy.title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.description)}</p>
    <p>${escapeHtml(copy.codeLabel)} <code>${AUTH_ORIGIN_ERROR}</code></p>
    <p><a href="/login">${escapeHtml(copy.backToLogin)}</a></p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Cookie, Accept-Language',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const rawNext = searchParams.get("next") ?? "/dashboard";

  const safePath = sanitizeAuthNext(rawNext);
  let base: string;
  try {
    base = resolveAuthOrigin(request.headers);
  } catch {
    return authOriginUnavailable(request);
  }

  const supabase = await createClient();

  // Token-hash email templates may use this OTP flow without a PKCE
  // verifier cookie. Accept only supported email token types.
  if (tokenHash && isOtpType(rawType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType,
    });
    if (!error) {
      return NextResponse.redirect(`${base}${safePath}`);
    }
    console.warn('[auth/callback] verifyOtp failed:', error.message);
  }

  // PKCE callbacks require the verifier cookie created by the initiating
  // browser on the same allowed origin.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}${safePath}`);
    }
    console.warn('[auth/callback] exchangeCodeForSession failed:', error.message);
  }

  return NextResponse.redirect(`${base}/login?error=auth_failed`);
}
