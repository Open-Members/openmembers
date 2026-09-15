import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasCourseChatConfiguration, isOAuthProviderEnabled } from './capabilities.server';

afterEach(() => vi.unstubAllEnvs());
describe('optional course chat presentation', () => {
  const config = {
    COURSE_CHAT_ENABLED: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55431',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fictitious-public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'fictitious-service-key',
    AI_GATEWAY_API_KEY: 'fictitious-ai-key',
    DATABASE_URL: 'postgresql://localhost/example',
    DATABASE_POOL_URL: '',
  };
  it('is available only after explicit opt-in and the required settings exist', () => {
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    expect(hasCourseChatConfiguration()).toBe(true);
  });
  it.each(['', 'false', '1', 'TRUE'])('is disabled for opt-in value %j', value => {
    for (const [key, setting] of Object.entries(config)) vi.stubEnv(key, setting);
    vi.stubEnv('COURSE_CHAT_ENABLED', value);
    expect(hasCourseChatConfiguration()).toBe(false);
  });
  it('accepts a pool URL without requiring the direct URL', () => {
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_POOL_URL', 'postgresql://localhost/example');
    expect(hasCourseChatConfiguration()).toBe(true);
  });
  it.each(Object.keys(config).filter(key => key !== 'DATABASE_POOL_URL'))('is hidden when %s is missing or whitespace', key => {
    for (const [name, value] of Object.entries(config)) vi.stubEnv(name, value);
    vi.stubEnv(key, ' ');
    expect(hasCourseChatConfiguration()).toBe(false);
  });
});

describe('OAuth providers require an explicit installation allowlist', () => {
  it('is disabled by default', () => {
    vi.stubEnv('OAUTH_PROVIDERS', '');
    expect(isOAuthProviderEnabled('google')).toBe(false);
    expect(isOAuthProviderEnabled('apple')).toBe(false);
  });
  it('enables only the listed provider', () => {
    vi.stubEnv('OAUTH_PROVIDERS', ' google, unsupported ');
    expect(isOAuthProviderEnabled('google')).toBe(true);
    expect(isOAuthProviderEnabled('apple')).toBe(false);
  });
  it('supports both explicit providers', () => {
    vi.stubEnv('OAUTH_PROVIDERS', 'google, apple');
    expect(isOAuthProviderEnabled('google')).toBe(true);
    expect(isOAuthProviderEnabled('apple')).toBe(true);
  });
});
