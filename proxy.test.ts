// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  adminConfigured: vi.fn(() => true),
  getUser: vi.fn(),
  profile: vi.fn(),
}));

vi.mock('@/core/config/env', () => ({
  hasSupabaseConfiguration: mocks.configured,
  hasSupabaseAdminConfiguration: mocks.adminConfigured,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: mocks.profile,
    };
    return {
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => query),
    };
  },
}));

vi.mock('next-intl/middleware', async () => {
  const { NextResponse } = await import('next/server');
  return { default: () => () => NextResponse.next() };
});

vi.mock('./core/i18n/routing', () => ({
  routing: { locales: ['en', 'es', 'pt'], defaultLocale: 'en' },
}));

import proxy from './proxy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.adminConfigured.mockReturnValue(true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user' } }, error: null });
  mocks.profile.mockResolvedValue({
    data: { status: 'active', must_change_password: false },
    error: null,
  });
});

describe('proxy recovery contracts', () => {
  it('returns a stable machine code when APIs are not configured', async () => {
    mocks.configured.mockReturnValue(false);
    const response = await proxy(new NextRequest('http://localhost/api/health'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'not_configured' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('redirects a protected page to a recoverable public route when the profile lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.profile.mockResolvedValue({ data: null, error: { message: 'private database detail' } });

    const response = await proxy(new NextRequest('http://localhost/pt/dashboard'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/account-unavailable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('uses the same recovery route when an authenticated profile is absent', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: null });

    const response = await proxy(new NextRequest('http://localhost/es/settings'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/account-unavailable');
  });

  it('keeps the login redirect for an unauthenticated protected request', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await proxy(new NextRequest('http://localhost/en/dashboard'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/dashboard');
  });
});
