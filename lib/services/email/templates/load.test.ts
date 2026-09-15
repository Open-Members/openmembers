// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  loadLocalizedTemplateContent,
  loadTemplateContent,
  loadTemplateContentForAdmin,
  loadTemplateOverride,
} from './load';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
      })),
    })),
  });
});

describe('loadTemplateContentForAdmin', () => {
  const defaults = {
    subject: 'Welcome to Open Members',
    heading: 'Your access is ready',
  };

  it('reports that no override exists when the row is absent', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      loadTemplateContentForAdmin('membership_welcome', defaults),
    ).resolves.toEqual({
      content: defaults,
      hasOverride: false,
      overrideFields: [],
    });
  });

  it('reports an override by row presence even when its content equals the defaults', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { content: { ...defaults } },
      error: null,
    });

    await expect(
      loadTemplateContentForAdmin('membership_welcome', defaults),
    ).resolves.toEqual({
      content: defaults,
      hasOverride: true,
      overrideFields: ['subject', 'heading'],
    });
  });

  it('uses a stable error code without exposing the database diagnostic', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'PRIVATE database diagnostic' },
    });

    await expect(
      loadTemplateContentForAdmin('membership_welcome', defaults),
    ).rejects.toThrow('loadFailed');
  });

  it('does not silently replace an authored template when delivery reads fail', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'PRIVATE database diagnostic' },
    });

    await expect(loadTemplateContent('membership_welcome', defaults)).rejects.toThrow('loadFailed');
    await expect(loadLocalizedTemplateContent('membership_welcome', 'pt')).rejects.toThrow('loadFailed');
  });

  it('returns null only for an absent row and rejects malformed saved content', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(loadTemplateOverride('membership_welcome')).resolves.toBeNull();

    mocks.maybeSingle.mockResolvedValueOnce({ data: { content: [] }, error: null });
    await expect(loadTemplateOverride('membership_welcome')).rejects.toThrow('invalidContent');
  });

  it('fills missing legacy fields from the selected locale and preserves saved fields', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { content: { subject: 'Assunto autoral {{siteName}}' } },
      error: null,
    });
    const content = await loadLocalizedTemplateContent('password_recovery', 'pt');
    expect(content.subject).toBe('Assunto autoral {{siteName}}');
    expect(content.heading).toBe('Redefina sua senha');
  });

  it('rejects a non-string value in a known authored field', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { content: { subject: 42 } },
      error: null,
    });

    await expect(
      loadLocalizedTemplateContent('password_recovery', 'pt'),
    ).rejects.toThrow('invalidContent');
    await expect(
      loadTemplateContentForAdmin('password_recovery', defaults),
    ).rejects.toThrow('invalidContent');
  });

  it('ignores unknown authored fields while keeping the row as an override', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { content: { subject: 'Assunto autoral', futureField: 'future' } },
      error: null,
    });

    await expect(
      loadTemplateContentForAdmin('password_recovery', defaults),
    ).resolves.toEqual({
      content: { ...defaults, subject: 'Assunto autoral' },
      hasOverride: true,
      overrideFields: ['subject'],
    });
  });
});
