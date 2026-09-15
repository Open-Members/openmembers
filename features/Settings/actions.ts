'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { z } from 'zod';
import { isLocale, type Locale } from '@/core/i18n/config';

const LOCALE_COOKIE = 'NEXT_LOCALE';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const emailSchema = z.string().email().max(320);
const passwordSchema = z.string().min(8);
const displayNameSchema = z.string().min(1).max(50);

// Avatars are public images, but updates must reference the caller's own object.
function isAcceptableAvatarUrl(publicUrl: string, userId: string): boolean {
  try {
    const url = new URL(publicUrl);
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname);
    if (configured.protocol !== 'https:' && !(local && configured.protocol === 'http:')) return false;
    if (url.origin !== configured.origin || url.username || url.password || url.hash) return false;
    const base = `/storage/v1/object/public/avatars/${userId}.`;
    return ['png', 'jpg', 'jpeg', 'webp'].some((ext) => url.pathname === `${base}${ext}`);
  } catch {
    return false;
  }
}

export async function saveAvatarUrl(publicUrl: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'notAuthenticated' };

  if (!isAcceptableAvatarUrl(publicUrl, user.id)) {
    return { error: 'invalidAvatar' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  if (error) return { error: 'saveAvatar' };
  return { success: true };
}

// ─── Update display name ───
// Writes to BOTH profiles.display_name (source of truth for queries) and
// auth.users.raw_user_meta_data.display_name (what TopNav and the Settings
// input read synchronously on page load). Keeping them in sync avoids a
// stale dropdown label after rename.
export async function updateDisplayName(displayName: string) {
  const parsed = displayNameSchema.safeParse(displayName);
  if (!parsed.success) return { error: 'invalidName' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'notAuthenticated' };

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data })
    .eq('id', user.id);
  if (profileError) return { error: 'updateName' };

  const { error: authError } = await supabase.auth.updateUser({
    data: { display_name: parsed.data },
  });
  if (authError) return { error: 'updateName' };

  return { success: true };
}

// ─── Request email change ───
// Supabase sends a confirmation link to both old and new addresses.
export async function requestEmailChange(newEmail: string) {
  const parsed = emailSchema.safeParse(newEmail);
  if (!parsed.success) return { error: 'invalidEmail' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'notAuthenticated' };

  if (parsed.data === user.email) return { error: 'currentEmail' };

  const { error } = await supabase.auth.updateUser({ email: parsed.data });
  if (error) return { error: 'updateEmail' };
  return { success: true };
}

// ─── Change password ───
export async function changePassword(newPassword: string) {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { error: 'invalidPassword' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'notAuthenticated' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: 'updatePassword' };
  return { success: true };
}

// ─── Update interface language ───
/**
 * Persist the authenticated caller's preference before updating the browser.
 * A cookie alone cannot carry this setting to another device or to email jobs.
 */
export async function updatePreferredLanguage(locale: Locale) {
  if (!isLocale(locale)) return { error: 'unsupportedLanguage' };
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'notAuthenticated' };
    const { data, error } = await supabase.from('profiles')
      .update({ preferred_locale: locale }).eq('id', user.id).select('id').single();
    if (error || !data) return { error: 'updateLanguage' };
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
    });
    return { success: true };
  } catch {
    return { error: 'updateLanguage' };
  }
}

// ─── Update video preferences ───
/**
 * Persists autoplay_next_lesson on the profile. Used by the lesson
 * player to decide whether to auto-advance after a lesson ends.
 */
export async function updateAutoplayPreference(enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'notAuthenticated' };

  const { error } = await supabase
    .from('profiles')
    .update({ autoplay_next_lesson: enabled })
    .eq('id', user.id);

  if (error) return { error: 'updatePreference' };
  return { success: true };
}

// ─── Delete account ───
export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'notAuthenticated' };

  // Use admin client to delete the Auth user (service role required)
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: 'deleteAccount' };
  return { success: true };
}
