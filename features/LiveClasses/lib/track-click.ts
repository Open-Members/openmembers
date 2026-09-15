/**
 * Fire-and-forget attendance tracker for the Join/Open CTAs on live
 * class surfaces. `keepalive: true` lets the request survive even if
 * the page navigates away before it completes. Failures are swallowed
 * silently — if the analytics POST drops we don't want to keep the
 * student from getting to the meeting.
 */
export function trackLiveClassClick(
  liveClassId: string,
  source: 'banner' | 'calendar' | 'admin' = 'banner',
): void {
  try {
    void fetch(`/api/live-classes/${liveClassId}/click`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
      keepalive: true,
    }).catch(() => {
      // intentionally ignored — best-effort telemetry
    });
  } catch {
    // same
  }
}
