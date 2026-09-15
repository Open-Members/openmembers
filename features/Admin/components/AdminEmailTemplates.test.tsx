import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  reset: vi.fn(),
  preview: vi.fn(),
  sendTest: vi.fn(),
}));

vi.mock('../actions', () => ({
  saveEmailTemplate: mocks.save,
  resetEmailTemplate: mocks.reset,
  previewEmailTemplate: mocks.preview,
  sendTemplateTestEmail: mocks.sendTest,
}));

vi.mock('../operations-presentation', () => {
  const t = ((key: string) => key) as ((key: string) => string) & {
    rich: (key: string) => string;
  };
  t.rich = (key: string) => key;
  return {
    adminOperationsError: (_t: unknown, code: unknown) => String(code),
    useAdminOperationsPresentation: () => ({ t }),
  };
});

import { AdminEmailTemplates } from './AdminEmailTemplates';
import type { AdminEmailTemplate } from '../actions';

function template(overrideFields: string[]): AdminEmailTemplate {
  return {
    key: 'welcome_with_password',
    displayName: 'Welcome',
    description: 'Welcome message',
    varKeys: [],
    fields: [
      { key: 'subject', label: 'Subject', type: 'subject' },
      { key: 'heading', label: 'Heading', type: 'short' },
    ],
    content: {
      subject: overrideFields.includes('subject')
        ? 'Authored subject'
        : 'Localized subject',
      heading: 'Localized heading',
    },
    overrideFields,
    isDefault: overrideFields.length === 0,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockResolvedValue({ success: true });
  mocks.preview.mockResolvedValue({
    subject: 'Preview subject',
    html: '<p>Preview</p>',
  });
});

afterEach(cleanup);

describe('admin email field-level overrides', () => {
  it('saves only the field edited from localized defaults', async () => {
    render(<AdminEmailTemplates templates={[template([])]} />);

    expect(
      screen.getByText('email.templates.globalOverrideNotice'),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText(
        'email.templates.catalog.welcome_with_password.fields.subject',
      ),
      { target: { value: 'New authored subject' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'email.templates.actions.save' }),
    );

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith('welcome_with_password', {
        subject: 'New authored subject',
      }),
    );
  });

  it('keeps prior authored fields when another field is edited', async () => {
    render(<AdminEmailTemplates templates={[template(['subject'])]} />);

    fireEvent.change(
      screen.getByLabelText(
        'email.templates.catalog.welcome_with_password.fields.heading',
      ),
      { target: { value: 'New authored heading' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'email.templates.actions.save' }),
    );

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith('welcome_with_password', {
        subject: 'Authored subject',
        heading: 'New authored heading',
      }),
    );
  });
});
