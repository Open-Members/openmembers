/** Safe destinations for installation links and image assets; never an Auth redirect policy. */
export function normalizePublicUrl(
  value: unknown,
  { allowContact = false }: { allowContact?: boolean } = {},
): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(raw)) return null;

  try {
    let decoded = raw;
    // Reject ambiguous encodings before browser/router normalization.
    for (let i = 0; i < 3; i++) {
      if (/[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.startsWith('//')) return null;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (/[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.startsWith('//')) return null;

    if (raw.startsWith('/')) {
      const url = new URL(raw, 'https://installation.invalid');
      if (url.origin !== 'https://installation.invalid' || url.pathname.startsWith('//')) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    }

    if (allowContact && /^mailto:[^?&#\s@]+@[^?&#\s@]+\.[^?&#\s@]+$/i.test(raw)) return raw;
    if (allowContact && /^tel:\+?[0-9()-]{3,30}$/i.test(raw)) return raw;

    const url = new URL(raw);
    if (url.username || url.password) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    return url.href;
  } catch {
    return null;
  }
}
