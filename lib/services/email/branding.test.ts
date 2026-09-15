import { afterEach, describe, expect, it, vi } from 'vitest';
import { absoluteEmailUrl, getEmailBranding, resolveMembershipEmailLinks } from './branding';

afterEach(() => vi.unstubAllEnvs());

describe('email branding and optional installation destinations', () => {
  it('uses the light-background logo and resolves repo-local paths for email clients', () => {
    expect(getEmailBranding({
      site_name: 'Aurora Academy',
      logo_light_url: '/brand/aurora.svg',
      logo_url: 'https://legacy.example.test/logo.png',
      logo_dark_url: 'https://dark.example.test/logo.png',
      primary_color: '#185C37',
    }, 'https://academy.example.test')).toEqual({
      siteName: 'Aurora Academy',
      logoUrl: 'https://academy.example.test/brand/aurora.svg',
      primaryColor: '#185c37',
    });
  });

  it('skips invalid asset candidates and keeps a usable legacy fallback', () => {
    const branding = getEmailBranding({
      site_name: 'Demo Academy',
      logo_light_url: 'https://user:password@example.test/logo.png',
      logo_url: '/logo.png',
      logo_dark_url: null,
      primary_color: '#185c37',
    }, 'https://academy.example.test');
    expect(branding.logoUrl).toBe('https://academy.example.test/logo.png');
    expect(absoluteEmailUrl('/logo.png', 'https://user:password@example.test')).toBeNull();
    expect(absoluteEmailUrl('//untrusted.example.test/logo.png', 'https://academy.example.test')).toBeNull();
  });

  it('gives configuration links precedence over legacy environment destinations', () => {
    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', 'https://legacy.example.test/community');
    vi.stubEnv('MEMBERSHIP_HELP_URL', 'https://legacy.example.test/help');
    expect(resolveMembershipEmailLinks({ community: '/community', help: '/help' }, 'https://academy.example.test')).toEqual({
      whatsappUrl: 'https://academy.example.test/community',
      questionFormUrl: 'https://academy.example.test/help',
    });
  });

  it('uses configured support before legacy help and permits a plain contact link', () => {
    vi.stubEnv('MEMBERSHIP_HELP_URL', 'https://legacy.example.test/help');
    expect(resolveMembershipEmailLinks({ support: 'mailto:support@example.test' }, 'https://academy.example.test').questionFormUrl)
      .toBe('mailto:support@example.test');
  });

  it('keeps validated legacy fallbacks and omits unusable destinations', () => {
    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', 'https://legacy.example.test/community');
    vi.stubEnv('MEMBERSHIP_HELP_URL', 'https://user:password@example.test/help');
    expect(resolveMembershipEmailLinks({}, 'https://academy.example.test')).toEqual({
      whatsappUrl: 'https://legacy.example.test/community',
      questionFormUrl: '',
    });
  });
});
