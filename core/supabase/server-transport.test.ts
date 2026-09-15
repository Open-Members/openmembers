// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOriginRewritingFetch,
  createSupabaseServerFetch,
} from './server-transport';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('server-side Supabase transport', () => {
  it('rewrites only the exact public origin and preserves path and query', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(null);
      },
    );
    const transport = createOriginRewritingFetch({
      publicUrl: 'http://127.0.0.1:56431',
      internalUrl: 'http://host.docker.internal:56431',
      fetchImpl,
    });

    await transport(
      'http://127.0.0.1:56431/rest/v1/profiles?select=id%2Cemail',
    );
    await transport(
      new URL(
        'http://127.0.0.1:56431/storage/v1/object/public/platform-assets/logo.png',
      ),
    );
    await transport('http://127.0.0.1:55431/rest/v1/profiles');
    await transport('https://database.example.test/rest/v1/profiles');

    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      'http://host.docker.internal:56431/rest/v1/profiles?select=id%2Cemail',
      'http://host.docker.internal:56431/storage/v1/object/public/platform-assets/logo.png',
      'http://127.0.0.1:55431/rest/v1/profiles',
      'https://database.example.test/rest/v1/profiles',
    ]);
  });

  it('preserves a Request and explicit fetch overrides', async () => {
    const seen: Array<{ request: Request; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ request: input as Request, init });
      return new Response(null);
    }) as typeof fetch;
    const transport = createOriginRewritingFetch({
      publicUrl: 'https://public.example.test',
      internalUrl: 'http://supabase.internal:8000',
      fetchImpl,
    });
    const request = new Request(
      'https://public.example.test/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        headers: { authorization: 'Bearer fictitious-token' },
        body: 'fixture-body',
        signal: AbortSignal.timeout(5_000),
      },
    );
    await transport(request, { cache: 'no-store' });

    expect(seen).toHaveLength(1);
    expect(seen[0].request.url).toBe(
      'http://supabase.internal:8000/auth/v1/token?grant_type=password',
    );
    expect(seen[0].request.method).toBe('POST');
    expect(seen[0].request.headers.get('authorization')).toBe(
      'Bearer fictitious-token',
    );
    expect(await seen[0].request.text()).toBe('fixture-body');
    expect(seen[0].request.signal).toBeInstanceOf(AbortSignal);
    expect(seen[0].init).toEqual({ cache: 'no-store' });
  });

  it('returns the original fetch when no internal URL is configured', () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    vi.stubEnv('SUPABASE_INTERNAL_URL', '');
    expect(createSupabaseServerFetch(fetchImpl)).toBe(fetchImpl);
  });

  it('rejects ambiguous or unsafe configured bases', () => {
    const valid = {
      publicUrl: 'https://public.example.test',
      internalUrl: 'http://supabase.internal:8000',
    };
    for (const internalUrl of [
      'supabase.internal:8000',
      'ftp://supabase.internal',
      'http://user:pass@supabase.internal',
      'http://supabase.internal/path',
      'http://supabase.internal/?token=secret',
      'http://supabase.internal/#fragment',
    ]) {
      expect(() =>
        createOriginRewritingFetch({ ...valid, internalUrl }),
      ).toThrow(/SUPABASE_INTERNAL_URL/);
    }
    vi.stubEnv('SUPABASE_INTERNAL_URL', valid.internalUrl);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => createSupabaseServerFetch()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is required/,
    );
  });
});
