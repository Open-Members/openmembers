// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const minute = 60_000;
const start = new Date('2026-01-01T00:00:00Z').getTime();
let rateLimit: typeof import('./rate-limit').rateLimit;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  vi.resetModules();
  ({ rateLimit } = await import('./rate-limit'));
});

afterEach(() => vi.useRealTimers());

describe('per-process sliding-window rate limit', () => {
  it.each([minute, 15 * minute])('keeps the password reset window when a %i ms operation triggers cleanup', shortWindow => {
    const resetPolicy = { maxRequests: 3, windowMs: 60 * minute };
    for (let i = 0; i < 3; i++) expect(rateLimit('reset:person', resetPolicy).success).toBe(true);
    expect(rateLimit('reset:person', resetPolicy).success).toBe(false);

    vi.setSystemTime(start + shortWindow + 1);
    expect(rateLimit('short:person', { maxRequests: 10, windowMs: shortWindow }).success).toBe(true);
    expect(rateLimit('reset:person', resetPolicy)).toEqual({ success: false, remaining: 0 });

    vi.setSystemTime(start + 60 * minute - 1);
    expect(rateLimit('reset:person', resetPolicy).success).toBe(false);
    vi.setSystemTime(start + 60 * minute);
    expect(rateLimit('reset:person', resetPolicy)).toEqual({ success: true, remaining: 2 });
  });

  it('expires simultaneous 1-minute, 15-minute and 1-hour policies independently', () => {
    const policies = [minute, 15 * minute, 60 * minute].map(windowMs => ({ maxRequests: 1, windowMs }));
    policies.forEach((policy, i) => expect(rateLimit(`operation:${i}`, policy).success).toBe(true));

    vi.setSystemTime(start + minute);
    expect(rateLimit('operation:0', policies[0]).success).toBe(true);
    expect(rateLimit('operation:1', policies[1]).success).toBe(false);
    expect(rateLimit('operation:2', policies[2]).success).toBe(false);

    vi.setSystemTime(start + 15 * minute);
    expect(rateLimit('operation:1', policies[1]).success).toBe(true);
    expect(rateLimit('operation:2', policies[2]).success).toBe(false);

    vi.setSystemTime(start + 60 * minute);
    expect(rateLimit('operation:2', policies[2]).success).toBe(true);
  });

  it('slides by each accepted request and does not prolong the window for rejected attempts', () => {
    const policy = { maxRequests: 2, windowMs: minute };
    expect(rateLimit('login:person', policy)).toEqual({ success: true, remaining: 1 });
    vi.setSystemTime(start + 30_000);
    expect(rateLimit('login:person', policy)).toEqual({ success: true, remaining: 0 });
    vi.setSystemTime(start + minute - 1);
    expect(rateLimit('login:person', policy).success).toBe(false);
    vi.setSystemTime(start + minute);
    expect(rateLimit('login:person', policy)).toEqual({ success: true, remaining: 0 });
    expect(rateLimit('login:person', policy).success).toBe(false);
    vi.setSystemTime(start + 90_000);
    expect(rateLimit('login:person', policy)).toEqual({ success: true, remaining: 0 });
  });

  it('does not share a person or operation quota with another key', () => {
    const policy = { maxRequests: 1, windowMs: minute };
    expect(rateLimit('login:alice', policy).success).toBe(true);
    expect(rateLimit('login:alice', policy).success).toBe(false);
    expect(rateLimit('login:bob', policy)).toEqual({ success: true, remaining: 0 });
    expect(rateLimit('reset:alice', policy)).toEqual({ success: true, remaining: 0 });
  });
});
