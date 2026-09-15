/**
 * YouTube URL → video ID extraction.
 *
 * Accepts the most common input shapes an admin is likely to paste:
 *   - Bare 11-character ID ("dQw4w9WgXcQ")
 *   - https://www.youtube.com/watch?v=ID[&t=...]
 *   - https://youtu.be/ID[?t=...]
 *   - https://www.youtube.com/embed/ID
 *   - https://www.youtube.com/shorts/ID
 *   - https://www.youtube.com/v/ID
 *   - https://www.youtube.com/live/ID
 *   - m.youtube.com / www.youtube.com variants
 *
 * Returns null for anything we can't recognize so callers can show an error.
 */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare ID (already the right shape)
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  // Parse as URL (add scheme if missing)
  let url: URL;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(m|www|music)\./, '');

  if (host === 'youtube.com') {
    const v = url.searchParams.get('v');
    if (v && YOUTUBE_ID_RE.test(v)) return v;

    const parts = url.pathname.split('/').filter(Boolean);
    const [first, second] = parts;
    if (
      second &&
      YOUTUBE_ID_RE.test(second) &&
      ['embed', 'v', 'shorts', 'live'].includes(first)
    ) {
      return second;
    }
  }

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    if (id && YOUTUBE_ID_RE.test(id)) return id;
  }

  return null;
}
