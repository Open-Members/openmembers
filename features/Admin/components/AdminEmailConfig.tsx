'use client';

import { useState, useTransition } from 'react';
import { Mail, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  saveEmailSenderConfig,
  sendTestEmail,
  type AdminEmailSenderConfig,
} from '../actions';
import { useAdminOperationsPresentation } from '../operations-presentation';

export function AdminEmailConfig({
  initialConfig,
}: {
  initialConfig: AdminEmailSenderConfig;
}) {
  const { t, error } = useAdminOperationsPresentation();
  const [fromAddress, setFromAddress] = useState(initialConfig.fromAddress ?? '');
  const [fromName, setFromName] = useState(initialConfig.fromName ?? '');
  const [replyTo, setReplyTo] = useState(initialConfig.replyTo ?? '');
  const [supportInbox, setSupportInbox] = useState(initialConfig.supportInbox ?? '');
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();

  const [testEmail, setTestEmail] = useState('');
  const [testMsg, setTestMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isTesting, startTesting] = useTransition();

  function handleSave() {
    setSaveMsg(null);
    startSaving(async () => {
      try {
        const result = await saveEmailSenderConfig({ fromAddress, fromName, replyTo, supportInbox });
        if ('error' in result && result.error) {
          setSaveMsg({ type: 'err', text: error(result.error) });
        } else {
          setSaveMsg({ type: 'ok', text: t('email.sender.saved') });
        }
      } catch (cause) {
        setSaveMsg({ type: 'err', text: error(cause) });
      }
    });
  }

  function handleTest() {
    setTestMsg(null);
    startTesting(async () => {
      try {
        const result = await sendTestEmail(testEmail);
        if ('error' in result && result.error) {
          setTestMsg({ type: 'err', text: error(result.error) });
        } else {
          setTestMsg({
            type: 'ok',
            text: t(
              initialConfig.transport === 'mailpit'
                ? 'email.sender.testCaptured'
                : 'email.sender.testAccepted',
              { email: testEmail },
            ),
          });
        }
      } catch (cause) {
        setTestMsg({ type: 'err', text: error(cause) });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-[var(--color-card)] p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] p-2 text-[var(--color-primary)]">
          <Mail className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
            {t('email.sender.title')}
          </h3>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            {t('email.sender.description')}
            {initialConfig.transport && (
              <>
                {' '}
                {t(
                  initialConfig.transport === 'mailpit'
                    ? 'email.sender.transport.mailpit'
                    : 'email.sender.transport.resend',
                )}
              </>
            )}
          </p>
        </div>
      </div>

      {!initialConfig.transport && (
        <div className="flex items-start gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{t('email.sender.notConfiguredTitle')}</strong>{' '}
            {t('email.sender.notConfiguredDescription')}
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
            {t('email.sender.fields.fromAddress')}
          </label>
          <input
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            type="email"
            placeholder="noreply@yourdomain.com"
            className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
            {t('email.sender.fields.fromName')}
          </label>
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder={t('email.sender.fields.fromNamePlaceholder')}
            className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
            {t('email.sender.fields.replyTo')}
          </label>
          <input
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            type="email"
            placeholder={t('email.sender.fields.replyToPlaceholder')}
            className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
            {t('email.sender.fields.supportInbox')}
          </label>
          <input
            value={supportInbox}
            onChange={(e) => setSupportInbox(e.target.value)}
            type="email"
            placeholder="support@yourdomain.com"
            className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
            {t('email.sender.fields.supportInboxHint')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || !fromAddress || !fromName}
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSaving ? t('email.sender.actions.saving') : t('email.sender.actions.save')}
        </button>
        {saveMsg && (
          <span className={`text-sm font-medium ${saveMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {saveMsg.type === 'ok' ? (
              <CheckCircle2 className="inline h-4 w-4 mr-1" />
            ) : null}
            {saveMsg.text}
          </span>
        )}
      </div>

      <div className="border-t border-hairline pt-5">
        <h4 className="text-sm font-semibold text-[var(--color-foreground)] mb-2">
          {t('email.sender.testTitle')}
        </h4>
        <p className="text-xs text-[var(--color-muted-foreground)] mb-3">
          {t('email.sender.testDescription')}
        </p>
        <div className="flex items-center gap-2">
          <input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            type="email"
            placeholder="your@email.com"
            className="flex-1 border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <button
            onClick={handleTest}
            disabled={isTesting || !testEmail || !initialConfig.transport}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {isTesting ? t('email.sender.actions.sending') : t('email.sender.actions.sendTest')}
          </button>
        </div>
        {testMsg && (
          <p className={`text-sm mt-2 ${testMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {testMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
