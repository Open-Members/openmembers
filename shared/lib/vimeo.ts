/**
 * Vimeo URL → video ID extraction.
 *
 * Accepts:
 *   - Bare numeric ID ("76979871")
 *   - https://vimeo.com/ID                              (public)
 *   - https://vimeo.com/ID/HASH                         (private link — hash is the "h" param)
 *   - https://player.vimeo.com/video/ID
 *   - https://player.vimeo.com/video/ID?h=HASH
 *   - www.vimeo.com variants
 *
 * Returns the numeric ID, or null if the input can't be recognized. The
 * private-link hash (when present) is NOT returned here; callers that need
 * it should use `extractVimeoEmbed()`.
 */
const VIMEO_ID_RE = /^\d{6,12}$/;

export function extractVimeoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (VIMEO_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);

  // player.vimeo.com/video/ID
  if (host === 'player.vimeo.com' && parts[0] === 'video' && parts[1]) {
    return VIMEO_ID_RE.test(parts[1]) ? parts[1] : null;
  }

  // vimeo.com/ID  or  vimeo.com/ID/HASH
  if (host === 'vimeo.com' && parts[0]) {
    return VIMEO_ID_RE.test(parts[0]) ? parts[0] : null;
  }

  return null;
}

/**
 * Shape used to render the iframe. Captures the private-link hash when the
 * URL includes it (either `vimeo.com/ID/HASH` or `?h=HASH`).
 */
export type VimeoEmbed = {
  id: string;
  /** Private-link unlock hash, if the URL provides one. */
  hash?: string;
};

export function extractVimeoEmbed(input: string): VimeoEmbed | null {
  const id = extractVimeoId(input);
  if (!id) return null;

  const trimmed = input.trim();
  let hash: string | undefined;

  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);

    // Path-style hash: vimeo.com/ID/HASH
    const parts = url.pathname.split('/').filter(Boolean);
    if (
      url.hostname.toLowerCase().replace(/^www\./, '') === 'vimeo.com' &&
      parts[0] === id &&
      parts[1]
    ) {
      hash = parts[1];
    }

    // Query-style hash: ?h=HASH (player.vimeo.com links use this)
    const h = url.searchParams.get('h');
    if (h) hash = h;
  } catch {
    /* bare-ID path, no URL to parse */
  }

  return hash ? { id, hash } : { id };
}

/**
 * Build the iframe `src` URL for a Vimeo embed with autoplay/controls etc.
 * Accepts either a plain ID or an `{ id, hash }` descriptor.
 */
export function buildVimeoEmbedSrc(
  embed: string | VimeoEmbed,
  opts: {
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    background?: boolean;
    /** Accent color for the progress bar — 6-char hex, no leading #. */
    color?: string;
    /** Hide the uploader name badge (default: hidden for a cleaner look). */
    byline?: boolean;
    /** Hide the video title overlay (default: hidden). */
    title?: boolean;
    /** Hide the uploader avatar (default: hidden). */
    portrait?: boolean;
  } = {},
): string {
  const resolved = typeof embed === 'string' ? { id: embed } : embed;
  const params = new URLSearchParams();
  if (resolved.hash) params.set('h', resolved.hash);
  if (opts.autoplay) params.set('autoplay', '1');
  if (opts.muted) params.set('muted', '1');
  if (opts.loop) params.set('loop', '1');
  if (opts.background) params.set('background', '1');
  if (opts.color) params.set('color', opts.color);
  // Default the trio of "branding" surfaces to off — they clutter the player.
  params.set('byline', opts.byline ? '1' : '0');
  params.set('title', opts.title ? '1' : '0');
  params.set('portrait', opts.portrait ? '1' : '0');
  params.set('dnt', '1');
  // Allow postMessage API so we can listen for `ended`.
  params.set('api', '1');
  return `https://player.vimeo.com/video/${resolved.id}?${params.toString()}`;
}
