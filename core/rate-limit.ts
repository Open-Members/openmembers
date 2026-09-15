/**
 * Simple in-memory sliding-window rate limiter.
 * State belongs to one process and is lost on restart. Multiple processes
 * require a shared store for a global limit. Each key uses a stable policy.
 */

interface Entry {
  timestamps: number[];
  expiresAt: number;
}

const store = new Map<string, Entry>();

// Cleanup stale entries every 60s to prevent memory leaks
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export function rateLimit(
  key: string,
  { maxRequests, windowMs }: { maxRequests: number; windowMs: number },
): { success: boolean; remaining: number } {
  const now = Date.now();
  cleanup(now);
  const entry = store.get(key) ?? { timestamps: [], expiresAt: now };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    return { success: false, remaining: 0 };
  }

  entry.timestamps.push(now);
  entry.expiresAt = now + windowMs;
  store.set(key, entry);

  return { success: true, remaining: maxRequests - entry.timestamps.length };
}
