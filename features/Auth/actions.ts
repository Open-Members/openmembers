"use server";

import { createClient } from "@/core/supabase/server";
import { createAdminClient } from "@/core/supabase/admin";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  signInSchema,
  signUpSchema,
  oauthProviderSchema,
  resetPasswordRequestSchema,
  updatePasswordSchema,
  formDataToObject,
} from "@/core/validation/schemas";
import { rateLimit } from "@/core/rate-limit";
import { resolveAuthOrigin, sanitizeAuthNext } from "@/core/security/auth-redirect";
import { authValidationError, authProviderError } from "./errors";
import { isOAuthProviderEnabled } from "@/core/config/capabilities.server";
import { getLocale } from "next-intl/server";
import { isLocale } from "@/core/i18n/config";

// Best-effort client IP: trust the x-forwarded-for chain set by Traefik.
// Fallback to a constant string so the rate limiter still functions in
// dev where there's no proxy. Last-resort '0.0.0.0' keys would cluster
// every client behind one bucket, so guard against that explicitly.
async function getClientIp(): Promise<string> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return hdrs.get("x-real-ip") || "anonymous";
}

// Auth-action rate limits. Tight enough to defeat brute force, generous
// enough to absorb a real user fat-fingering their password a few times.
const LOGIN_LIMIT = { maxRequests: 10, windowMs: 15 * 60_000 }; // 10 / 15min per IP
const SIGNUP_LIMIT = { maxRequests: 5, windowMs: 60 * 60_000 }; // 5 / hour per IP
const RESET_LIMIT = { maxRequests: 3, windowMs: 60 * 60_000 }; // 3 / hour per email

// Allowed acquisition-source labels for self-signup attribution. Anything
// not on this list (including a value a user hand-crafts into the URL) is
// ignored, so the column only ever holds values we put there on purpose.
const SIGNUP_SOURCE_ALLOWLIST = new Set(["youtube"]);

// Per-video attribution (YouTube video ID from ?v=). IDs are 11 chars of
// [A-Za-z0-9_-]; we allow a little slack but cap length and reject anything
// off-charset, so the column only ever holds a clean ID we can cross-
// reference with YouTube Analytics. Returns null for absent/malformed input.
function sanitizeCampaign(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  return /^[A-Za-z0-9_-]{1,32}$/.test(raw) ? raw : null;
}

async function getCurrentOrigin(): Promise<string> {
  return resolveAuthOrigin(await headers());
}

export async function signInWithEmail(formData: FormData) {
  const parsed = signInSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: authValidationError(parsed.error.issues, true) };

  let destination: string;
  try {
    const ip = await getClientIp();
    const rl = rateLimit(`auth:signin:${ip}`, LOGIN_LIMIT);
    if (!rl.success) {
      return {
        error: "tooManySignIns",
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) return { error: authProviderError(error, "signIn") };
    if (!data.user) return { error: "accountVerification" };

    // Choose the final destination before emitting the Server Action redirect.
    // A later proxy redirect can render the password form while retaining /dashboard.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status, must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError || !profile) return { error: "profileUnavailable" };
    destination = profile.status !== "active" ? "/suspended"
      : profile.must_change_password ? "/change-password" : "/dashboard";
  } catch {
    return { error: "signInFailed" };
  }
  redirect(destination);
}

export async function signUpWithEmail(formData: FormData) {
  const parsed = signUpSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: authValidationError(parsed.error.issues) };

  try {
    const ip = await getClientIp();
    const rl = rateLimit(`auth:signup:${ip}`, SIGNUP_LIMIT);
    if (!rl.success) {
      return {
        error: "tooManySignUps",
      };
    }

    const rawSource = formData.get("source");
    const source =
      typeof rawSource === "string" && SIGNUP_SOURCE_ALLOWLIST.has(rawSource)
        ? rawSource
        : null;
    const next = sanitizeAuthNext(formData.get("next"));
    const campaign = sanitizeCampaign(formData.get("campaign"));

    const supabase = await createClient();
    const origin = await getCurrentOrigin();
    const requestLocale = await getLocale();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          display_name: parsed.data.displayName,
          ...(isLocale(requestLocale) ? { delivery_locale: requestLocale } : {}),
          ...(source ? { signup_source: source } : {}),
          ...(source && campaign ? { signup_campaign: campaign } : {}),
        },
        emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) return { error: authProviderError(error, "signUp") };

    // Persist acquisition source on the profile right away. The
    // on_auth_user_created trigger has already created the profiles row
    // inside signUp, so this update always finds its target — and it runs
    // regardless of email confirmation (no session needed; the service-role
    // client bypasses RLS). Best-effort: a failed attribution write must not
    // break account creation.
    if (source && data.user?.id) {
      try {
        const admin = createAdminClient();
        await admin
          .from("profiles")
          .update({
            signup_source: source,
            ...(campaign ? { signup_campaign: campaign } : {}),
          })
          .eq("id", data.user.id);
      } catch (err) {
        console.error("[signup] failed to persist signup_source:", err);
      }
    }

    // Email confirmation is enabled, so there is no session yet. Returning a
    // success flag lets the form show a "check your inbox" step instead of
    // redirecting to a gated route (which would bounce the user to /login).
    return { success: true as const, email: parsed.data.email };
  } catch {
    return { error: "signUpFailed" };
  }
}

export async function signInWithOAuth(provider: "google" | "apple") {
  const parsed = oauthProviderSchema.safeParse(provider);
  if (!parsed.success) return { error: "invalidProvider" };
  if (!isOAuthProviderEnabled(parsed.data)) return { error: "providerDisabled" };

  try {
    const supabase = await createClient();
    const origin = await getCurrentOrigin();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: parsed.data,
      options: {
        redirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (error) return { error: authProviderError(error, "oauth") };
    if (data.url) return { url: data.url };
    return { error: "oauthRedirectMissing" };
  } catch {
    return { error: "oauthFailed" };
  }
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = resetPasswordRequestSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: authValidationError(parsed.error.issues) };

  // Key by email so an attacker can't fan out reset emails for one
  // address by rotating IPs. Belt: also limit per-IP in case of
  // address-spray attacks.
  const ip = await getClientIp();
  const emailKey = parsed.data.email.toLowerCase();
  const rlEmail = rateLimit(`auth:reset:email:${emailKey}`, RESET_LIMIT);
  const rlIp = rateLimit(`auth:reset:ip:${ip}`, { maxRequests: 10, windowMs: 60 * 60_000 });
  if (!rlEmail.success || !rlIp.success) {
    // Same generic response either way so we don't confirm whether the
    // address is registered.
    return { success: true };
  }

  try {
    const supabase = await createClient();
    const origin = await getCurrentOrigin();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      // Route through /api/auth/callback so the recovery code is exchanged for a
      // session BEFORE rendering the reset-password form. Without this, the form
      // submits but getUser() returns null and updateUser() silently no-ops.
      redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
    });
  } catch {
    // Keep recovery non-enumerating even when the transport is unavailable.
  }

  return { success: true };
}

export async function updatePassword(formData: FormData) {
  const parsed = updatePasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: authValidationError(parsed.error.issues) };

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "notAuthenticated" };

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { error: authProviderError(error, "passwordUpdate") };

    // Clear the first-login flag if it was set — whether the user arrived
    // here via recovery email or the forced change-password flow, the
    // password they just set is now their real one.
    try {
      const { error: flagError } = await createAdminClient()
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
      if (flagError) return { error: "passwordSetupIncomplete" };
    } catch {
      return { error: "passwordSetupIncomplete" };
    }
  } catch {
    return { error: "passwordUpdateFailed" };
  }

  redirect("/dashboard");
}

/**
 * Sets a new password for the currently signed-in user and clears the
 * `must_change_password` flag on their profile. Used for the forced
 * first-login flow after webhook enrollment provisioned a temp password.
 */
export async function changeInitialPassword(formData: FormData) {
  const parsed = updatePasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: authValidationError(parsed.error.issues) };

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "notAuthenticated" };

    const { error: pwError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (pwError) return { error: authProviderError(pwError, "passwordUpdate") };

    try {
      const { error: flagError } = await createAdminClient()
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
      if (flagError) return { error: "passwordSetupIncomplete" };
    } catch {
      return { error: "passwordSetupIncomplete" };
    }
  } catch {
    return { error: "passwordUpdateFailed" };
  }

  redirect("/dashboard");
}
