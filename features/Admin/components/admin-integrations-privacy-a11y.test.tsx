import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { WEBHOOK_PROVIDERS } from '@/lib/webhooks/providers';
import { AdminIntegrations } from './AdminIntegrations';
import { IntegrationSetupDialog } from './IntegrationSetupDialog';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  danger: vi.fn(),
  success: vi.fn(),
}));

vi.mock('../actions', () => ({
  getAdminWebhookConfigs: vi.fn(),
  getAdminWebhookLogs: vi.fn(),
  getAdminDeadLetters: vi.fn(),
  retryDeadLetterNow: vi.fn(),
  deleteDeadLetter: vi.fn(),
  createWebhookConfig: vi.fn(),
  updateWebhookConfig: vi.fn(),
  deleteWebhookConfig: vi.fn(),
  toggleWebhookActive: vi.fn(),
  rotateWebhookToken: vi.fn(),
  sendTestWebhookEvent: vi.fn(),
}));

vi.mock('@/shared/lib/toast', () => ({
  appToast: { danger: mocks.danger, success: mocks.success },
}));

vi.mock('./WebhookProductMappings', () => ({
  WebhookProductMappings: () => null,
}));

vi.mock('../operations-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../operations-presentation')>();
  const t = ((key: string) => key) as ((key: string) => string) & {
    has(key: string): boolean;
  };
  t.has = () => true;
  return {
    ...actual,
    useAdminOperationsPresentation: () => ({
      t,
      error: () => 'localized-error',
      dateTime: () => 'localized-date',
      number: (value: number) => String(value),
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const privateDiagnostic = 'PRIVATE provider diagnostic with product customer_123';

function renderIntegrations() {
  return render(
    <AdminIntegrations
      initialConfigs={[]}
      initialLogs={[
        {
          id: 'log-1',
          provider: 'stripe',
          eventType: 'checkout.session.completed',
          status: 'failed',
          payload: '{}',
          errorMessage: privateDiagnostic,
          createdAt: '2026-09-12T12:00:00Z',
        },
      ]}
      initialDeadLetters={[
        {
          id: 'retry-1',
          webhookConfigId: 'config-1',
          provider: 'stripe',
          eventType: 'checkout.session.completed',
          attemptCount: 2,
          status: 'pending',
          lastError: privateDiagnostic,
          nextAttemptAt: '2026-09-12T13:00:00Z',
          createdAt: '2026-09-12T11:00:00Z',
          updatedAt: '2026-09-12T12:00:00Z',
          payloadPreview: '{}',
        },
      ]}
      initialAnomalies={[]}
      accessLevels={[]}
      courses={[]}
      initialNow={new Date('2026-09-12T12:00:00Z').getTime()}
    />,
  );
}

describe('admin integrations privacy and accessibility', () => {
  it('uses keyboard-operable tabs and never renders stored diagnostics', () => {
    renderIntegrations();

    const tabs = screen.getByRole('tablist', {
      name: 'integrations.header.title',
    });
    const providers = screen.getByRole('tab', {
      name: 'integrations.tabs.providers',
    });
    const logs = screen.getByRole('tab', { name: 'integrations.tabs.logs' });
    expect(tabs).toContainElement(providers);
    expect(providers).toHaveAttribute('aria-selected', 'true');
    expect(logs).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(providers, { key: 'ArrowRight' });
    expect(logs).toHaveFocus();
    expect(logs).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      logs.id,
    );
    expect(screen.getByText('integrations.logs.errorSummary')).toBeVisible();
    expect(document.body).not.toHaveTextContent(privateDiagnostic);

    fireEvent.click(screen.getByRole('tab', { name: 'integrations.tabs.retries' }));
    expect(screen.getByText('integrations.retries.errorSummary')).toBeVisible();
    expect(document.body).not.toHaveTextContent(privateDiagnostic);
  });

  it('labels the modal, focuses it, closes on Escape, and restores focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open integration
          </button>
          {open && (
            <IntegrationSetupDialog
              provider={WEBHOOK_PROVIDERS[0]}
              existing={null}
              accessLevels={[]}
              courses={[]}
              onClose={() => setOpen(false)}
              onChanged={vi.fn()}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open integration' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Stripe' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(WEBHOOK_PROVIDERS[0].description);
    const close = screen.getByRole('button', { name: 'integrations.dialog.close' });
    expect(close).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'integrations.dialog.actions.copy' }).closest('label'),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'integrations.dialog.help.show' }).closest('label'),
    ).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
