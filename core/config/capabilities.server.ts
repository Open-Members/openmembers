import { hasSupabaseConfiguration, hasSupabaseAdminConfiguration } from './env';

/** Explicit opt-in plus prerequisites; this does not attest provider/corpus readiness. */
export function hasCourseChatConfiguration(): boolean {
  return process.env.COURSE_CHAT_ENABLED?.trim() === 'true' &&
    hasSupabaseConfiguration() && hasSupabaseAdminConfiguration() && Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() &&
    (process.env.DATABASE_POOL_URL?.trim() || process.env.DATABASE_URL?.trim()),
  );
}

/** Provider setup in Supabase is separate; an empty allowlist disables OAuth actions. */
export function isOAuthProviderEnabled(provider: 'google' | 'apple'): boolean {
  return (process.env.OAUTH_PROVIDERS ?? '').split(',').map(value => value.trim()).includes(provider);
}
