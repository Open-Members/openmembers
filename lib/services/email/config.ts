export type EmailTransport = { provider: 'resend'; apiKey: string } | { provider: 'mailpit'; url: string };

const CAPTURE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal']);

/** Development capture never falls back to a provider or follows redirects. */
export function getEmailTransport(): EmailTransport | null {
  const mode = process.env.EMAIL_TRANSPORT?.trim() || 'resend';
  if (mode === 'mailpit') {
    try {
      const value = process.env.MAILPIT_URL?.trim() ?? '';
      if (!/^http:\/\/[^/?#\\\s]+\/?$/.test(value)) return null;
      const url = new URL(value);
      if (url.protocol !== 'http:' || !CAPTURE_HOSTS.has(url.hostname)
        || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
      return { provider: 'mailpit', url: `${url.origin}/api/v1/send` };
    } catch { return null; }
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return mode === 'resend' && apiKey ? { provider: 'resend', apiKey } : null;
}
