import { describe, it, expect } from 'vitest';
import { detectSecret } from './secret-scanner';

describe('detectSecret', () => {
  describe('detects', () => {
    it.each([
      ['OpenAI key', 'my key is sk-proj-AbCdEf1234567890XyZ123456'],
      ['Stripe live secret', ['sk', '_live_', 'AbCdEf1234567890XyZw'].join('')],
      ['Stripe webhook secret', 'whsec_AbCdEf1234567890XyZ123'],
      ['Anthropic key', 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAA'],
      ['GitHub PAT', 'ghp_AbCdEf1234567890XyZw1234567890XyZw1234'],
      ['AWS access key', 'AKIAIOSFODNN7EXAMPLE'],
      ['Slack token', 'xoxb-1234567890-abcdef1234567890abcdef'],
      ['Google API key', 'AIzaSyA1234567890abcdef-_1234567890abcd'],
      ['PEM private key header', ['-----BEGIN ', 'RSA PRIVATE KEY', '-----'].join('')],
      ['Brevo key', 'xkeysib-' + 'a'.repeat(64) + '-abcdef1234567890'],
    ])('%s', (_name, payload) => {
      const result = detectSecret(payload);
      expect(result).not.toBeNull();
      expect(result!.pattern).toBeTruthy();
    });
  });

  describe('does not flag innocuous prose', () => {
    it.each([
      'I love the sky and stars',
      'The amount is $100',
      'rating is 5 stars',
      'My password is hunter2',
      'thanks for the great course!',
      // Short alphanumeric tokens that look secret-ish but are too short
      'abc123',
      'sk_short',
    ])('%s', (text) => {
      expect(detectSecret(text)).toBeNull();
    });
  });

  it('returns excerpt + pattern name for triage', () => {
    const out = detectSecret('please see whsec_abcdefghijklmnopqrstuvwxyz123 thanks');
    expect(out).not.toBeNull();
    expect(out!.pattern).toBe('stripe_other');
    expect(out!.excerpt).toContain('whsec_');
  });
});
