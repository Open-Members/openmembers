import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBERSHIP_LINKS, renderMembershipWelcome } from './membership-welcome';

function renderConfiguredWelcome() {
  return renderMembershipWelcome({
    studentName: 'Demo Member',
    studentEmail: 'member@example.org',
    temporaryPassword: null,
    loginUrl: 'https://example.org/login',
    whatsappUrl: MEMBERSHIP_LINKS.whatsapp,
    questionFormUrl: MEMBERSHIP_LINKS.questionForm,
    siteName: 'Example Academy',
  });
}

describe('membership onboarding optional destinations', () => {
  beforeEach(() => {
    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', undefined);
    vi.stubEnv('MEMBERSHIP_HELP_URL', undefined);
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('Email rendering must not contact external services');
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders usable access details without promising unconfigured community or support services', async () => {
    const { html, text } = await renderConfiguredWelcome();

    expect(html).toContain('href="https://example.org/login"');
    for (const output of [html, text]) {
      expect(output).toContain('Example Academy');
      expect(output).toMatch(/open the member area/i);
      expect(output).not.toMatch(/join the community|open the community|need help\?|get help/i);
    }
    expect(html).not.toContain('href=""');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '   ',
    'not-a-url',
    'javascript:alert(1)',
    'data:text/html,example',
    'ftp://example.org/community',
    'https://user:password@example.org/community',
    '//example.org/community',
  ])('omits optional blocks when the configured destination is unusable: %s', async (url) => {
    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', url);
    vi.stubEnv('MEMBERSHIP_HELP_URL', url);

    const { html, text } = await renderConfiguredWelcome();

    expect(html).toContain('href="https://example.org/login"');
    expect(html).not.toContain('href=""');
    for (const output of [html, text]) {
      expect(output).not.toMatch(/join the community|open the community|need help\?|get help/i);
      expect(output).not.toContain('javascript:');
      expect(output).not.toContain('data:text/html');
      expect(output).not.toContain('ftp://');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('includes valid community and help destinations in HTML and plain text', async () => {
    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', 'https://example.org/community');
    vi.stubEnv('MEMBERSHIP_HELP_URL', 'https://example.org/help');

    const { html, text } = await renderConfiguredWelcome();

    expect(html).toContain('href="https://example.org/community"');
    expect(html).toContain('href="https://example.org/help"');
    expect(text).toContain('https://example.org/community');
    expect(text).toContain('https://example.org/help');
    expect(text).toMatch(/join the community/i);
    expect(text).toMatch(/need help\?/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders the configured destination independently from an absent one', async () => {
    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', 'https://example.org/community');
    const communityOnly = await renderConfiguredWelcome();

    expect(communityOnly.html).toContain('href="https://example.org/community"');
    expect(communityOnly.text).not.toMatch(/need help\?|get help/i);

    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', undefined);
    vi.stubEnv('MEMBERSHIP_HELP_URL', 'https://example.org/help');
    const helpOnly = await renderConfiguredWelcome();

    expect(helpOnly.html).toContain('href="https://example.org/help"');
    expect(helpOnly.text).not.toMatch(/join the community|open the community/i);
  });

  it('uses the current environment when rendering again without reloading the module', async () => {
    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', 'https://example.org/first-community');
    const first = await renderConfiguredWelcome();
    expect(first.html).toContain('href="https://example.org/first-community"');

    vi.stubEnv('MEMBERSHIP_COMMUNITY_URL', 'https://example.org/second-community');
    const second = await renderConfiguredWelcome();
    expect(second.html).toContain('href="https://example.org/second-community"');
    expect(second.html).not.toContain('https://example.org/first-community');
  });
});
