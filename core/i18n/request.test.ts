// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ preference: vi.fn() }));
vi.mock('next-intl/server', () => ({ getRequestConfig: (callback: unknown) => callback }));
vi.mock('./preference.server', () => ({ getPreferredLocale: mocks.preference }));
import requestConfig from './request';

const resolve = requestConfig as unknown as (params: {
  requestLocale: Promise<string | undefined>;
  locale?: string;
}) => Promise<{ locale: string; now: Date; messages: Record<string, unknown> }>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
  mocks.preference.mockResolvedValue('pt');
});
afterEach(() => vi.useRealTimers());

describe('Request locale and initial presentation clock', () => {
  it('provides a fresh clock per request alongside the authenticated preference', async () => {
    const first = await resolve({ requestLocale: Promise.resolve('en') });
    expect(mocks.preference).toHaveBeenCalledExactlyOnceWith('en');
    expect(first.locale).toBe('pt');
    expect(first.now.toISOString()).toBe('2026-09-12T12:00:00.000Z');
    expect(first.messages.liveClasses).toHaveProperty('schedule', 'Agenda');
    vi.setSystemTime(new Date('2026-09-12T12:05:00Z'));
    const second = await resolve({ requestLocale: Promise.resolve('en') });
    expect(second.now.toISOString()).toBe('2026-09-12T12:05:00.000Z');
    expect(first.now.toISOString()).toBe('2026-09-12T12:00:00.000Z');
  });

  it('preserves valid internal overrides without loading the user preference', async () => {
    const config = await resolve({ requestLocale: Promise.resolve('en'), locale: 'es' });
    expect(config.locale).toBe('es');
    expect(config.now).toEqual(new Date('2026-09-12T12:00:00Z'));
    expect(config.messages.liveClasses).toHaveProperty('live', 'En vivo');
    expect(mocks.preference).not.toHaveBeenCalled();
  });

  it('falls back to the existing preference resolver for an invalid override', async () => {
    const config = await resolve({ requestLocale: Promise.resolve('es'), locale: 'invalid' });
    expect(config.locale).toBe('pt');
    expect(mocks.preference).toHaveBeenCalledExactlyOnceWith('es');
  });
});
