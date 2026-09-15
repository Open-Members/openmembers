/**
 * Detect common third-party secrets pasted into user-controlled free-text
 * fields (chat, ratings, support tickets). Goal is to refuse the write so
 * leaked credentials never land in the DB or reach an admin UI.
 *
 * Patterns are deliberately tight to avoid false positives on prose. Add
 * new patterns as new providers show up in incident reports.
 */

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  // OpenAI / Stripe live + test keys (sk_live_, sk_test_, sk-…)
  { name: 'openai_or_stripe', re: /\bsk[-_](?:live|test|proj|[A-Za-z0-9]{2,})[A-Za-z0-9_-]{16,}\b/ },
  // Stripe publishable + restricted + webhook secrets
  { name: 'stripe_other', re: /\b(?:pk_(?:live|test)_|rk_(?:live|test)_|whsec_)[A-Za-z0-9]{16,}\b/ },
  // Anthropic
  { name: 'anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  // GitHub PATs / app tokens
  { name: 'github', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/ },
  // AWS access key id
  { name: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  // Slack tokens
  { name: 'slack', re: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/ },
  // Google API key
  { name: 'google_api', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  // PEM private key block
  { name: 'private_key_pem', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  // Brevo API key
  { name: 'brevo', re: /\bxkeysib-[A-Fa-f0-9]{60,}-[A-Za-z0-9]{16,}\b/ },
];

export interface SecretMatch {
  pattern: string;
  excerpt: string;
}

export function detectSecret(text: string): SecretMatch | null {
  for (const { name, re } of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 4);
      const end = Math.min(text.length, m.index + Math.min(m[0].length, 12));
      return { pattern: name, excerpt: text.slice(start, end) + '…' };
    }
  }
  return null;
}
