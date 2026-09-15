// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ init: vi.fn(), transition: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ init: mocks.init, captureRouterTransitionStart: mocks.transition }));
const modules = [
  ['server', () => import('../../sentry.server.config')],
  ['edge', () => import('../../sentry.edge.config')],
] as const;

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ''); vi.stubEnv('SENTRY_DSN', '');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected telemetry request'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each(modules)('%s Sentry configuration with a controlled SDK', (_name, load) => {
  it('does not initialize for empty or whitespace configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ' '); vi.stubEnv('SENTRY_DSN', ' ');
    await load();
    expect(mocks.init).not.toHaveBeenCalled();
  });
  it('uses the private server DSN when the public template field is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ' ');
    vi.stubEnv('SENTRY_DSN', ' https://server@example.test/1 ');
    await load();
    expect(mocks.init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ dsn: 'https://server@example.test/1', tracesSampleRate: 0.1 }));
  });
  it('preserves precedence of the public DSN when both are configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ' https://public@example.test/1 ');
    vi.stubEnv('SENTRY_DSN', 'https://server@example.test/1');
    await load();
    expect(mocks.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://public@example.test/1' }));
  });
});

describe('browser telemetry keeps server configuration private', () => {
  it('does not infer a browser DSN from the server setting', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://server@example.test/1');
    vi.stubGlobal('window', { location: { pathname: '/dashboard', origin: 'https://members.example.test' } });
    await import('../../instrumentation-client');
    expect(mocks.init).not.toHaveBeenCalled();
  });
  it('does not initialize for whitespace-only public DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ' ');
    vi.stubGlobal('window', { location: { pathname: '/dashboard', origin: 'https://members.example.test' } });
    await import('../../instrumentation-client');
    expect(mocks.init).not.toHaveBeenCalled();
  });
  it('defers configured telemetry until navigation into an authenticated path', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ' https://public@example.test/1 ');
    vi.stubGlobal('window', { location: { pathname: '/login', origin: 'https://members.example.test' } });
    const client = await import('../../instrumentation-client');
    expect(mocks.init).not.toHaveBeenCalled();
    await client.onRouterTransitionStart('/pt/dashboard');
    expect(mocks.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://public@example.test/1' }));
    expect(mocks.transition).toHaveBeenCalledWith('/pt/dashboard', undefined);
  });
});
