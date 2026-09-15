'use client';

import Image from 'next/image';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Power,
  PowerOff,
  Trash2,
  AlertTriangle,
  HelpCircle,
  Zap,
  XCircle,
} from 'lucide-react';
import { appToast } from '@/shared/lib/toast';
import {
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
  toggleWebhookActive,
  rotateWebhookToken,
  sendTestWebhookEvent,
  type WebhookTestResult,
} from '../actions';
import type {
  AdminWebhookConfig,
  AdminAccessLevel,
  AdminCourseLite,
} from '../actions';
import type { WebhookProviderSpec } from '@/lib/webhooks/providers';
import { WebhookProductMappings } from './WebhookProductMappings';
import { useAdminOperationsPresentation } from '../operations-presentation';

type Props = {
  provider: WebhookProviderSpec;
  existing: AdminWebhookConfig | null;
  accessLevels: AdminAccessLevel[];
  courses: AdminCourseLite[];
  onClose: () => void;
  onChanged: () => void;
};

function buildWebhookUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function IntegrationSetupDialog({
  provider,
  existing,
  accessLevels,
  courses,
  onClose,
  onChanged,
}: Props) {
  const { t, error } = useAdminOperationsPresentation();
  const isUrlToken = provider.authMode === 'url-token';
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  // For url-token providers the URL embeds the per-config token; for
  // signature providers the URL is static (auth is via the signing header).
  const webhookUrl = useMemo(() => {
    if (isUrlToken && existing?.urlToken) {
      return buildWebhookUrl(`${provider.webhookPath}/${existing.urlToken}`);
    }
    return buildWebhookUrl(provider.webhookPath);
  }, [provider, isUrlToken, existing?.urlToken]);

  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(existing?.name ?? provider.name);
  const [secretKey, setSecretKey] = useState('');
  const [producerId, setProducerId] = useState(
    existing?.expectedProducerId ?? '',
  );
  const [accessLevelId, setAccessLevelId] = useState(
    existing?.accessLevelId ?? '',
  );
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(existing?.accessLevelId),
  );
  const [expirationDays, setExpirationDays] = useState<string>(
    existing?.expirationDays ? String(existing.expirationDays) : '',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [testing, startTestTransition] = useTransition();

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      appToast.danger(t('integrations.dialog.copyFailed'));
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const parsedExpiration =
      expirationDays === '' ? null : Number(expirationDays);
    if (!name.trim()) {
      appToast.danger(error('nameRequired'));
      return;
    }
    if (
      parsedExpiration !== null &&
      (!Number.isInteger(parsedExpiration) || parsedExpiration < 0)
    ) {
      appToast.danger(error('invalidExpiration'));
      return;
    }

    startTransition(async () => {
      try {
        if (existing) {
          const result = await updateWebhookConfig(existing.id, {
            name,
            secretKey: isUrlToken ? undefined : secretKey.trim() || undefined,
            expectedProducerId: isUrlToken ? producerId.trim() || null : undefined,
            accessLevelId: accessLevelId || null,
            expirationDays: parsedExpiration,
          });
          if ('error' in result && result.error) {
            appToast.danger(error(result.error));
            return;
          }
          appToast.success(t('integrations.dialog.updated'));
        } else {
          if (!isUrlToken && (!secretKey.trim() || secretKey.trim().length < 16)) {
            appToast.danger(error('secretTooShort'));
            return;
          }
          const result = await createWebhookConfig({
            provider: provider.id,
            name,
            secretKey: isUrlToken ? undefined : secretKey.trim(),
            expectedProducerId: isUrlToken ? producerId.trim() || null : null,
            accessLevelId: accessLevelId || null,
            expirationDays: parsedExpiration ?? undefined,
          });
          if ('error' in result && result.error) {
            appToast.danger(error(result.error));
            return;
          }
          appToast.success(t('integrations.dialog.connected', { provider: provider.name }));
        }
        onChanged();
      } catch (cause) {
        appToast.danger(error(cause));
      }
    });
  }

  function handleRotate() {
    if (!existing) return;
    startTransition(async () => {
      try {
        const result = await rotateWebhookToken(existing.id);
        if ('error' in result && result.error) {
          appToast.danger(error(result.error));
          return;
        }
        appToast.success(t('integrations.dialog.tokenRotated'));
        setConfirmRotate(false);
        onChanged();
      } catch (cause) {
        appToast.danger(error(cause));
      }
    });
  }

  function handleToggle() {
    if (!existing) return;
    startTransition(async () => {
      try {
        const result = await toggleWebhookActive(existing.id);
        if ('error' in result) {
          appToast.danger(error(result.error));
          return;
        }
        appToast.success(
          t(existing.isActive ? 'integrations.dialog.paused' : 'integrations.dialog.activated'),
        );
        onChanged();
      } catch (cause) {
        appToast.danger(error(cause));
      }
    });
  }

  function handleDelete() {
    if (!existing) return;
    startTransition(async () => {
      try {
        const result = await deleteWebhookConfig(existing.id);
        if ('error' in result) {
          appToast.danger(error(result.error));
          return;
        }
        appToast.success(t('integrations.dialog.removed'));
        onChanged();
        onClose();
      } catch (cause) {
        appToast.danger(error(cause));
      }
    });
  }

  function handleSendTest() {
    setTestResult(null);
    startTestTransition(async () => {
      try {
        const result = await sendTestWebhookEvent(provider.id);
        setTestResult(result);
        if (result.ok) {
          appToast.success(t('integrations.dialog.testSuccess'));
        } else {
          appToast.danger(error(result.message, 'testFailed'));
        }
      } catch (cause) {
        appToast.danger(error(cause, 'testFailed'));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
              <Image
                src={provider.logoPath}
                alt={provider.name}
                width={40}
                height={40}
              />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-bold text-[var(--color-foreground)] truncate"
              >
                {provider.name}
              </h2>
              <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                {provider.tagline}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-muted)]"
            aria-label={t('integrations.dialog.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {/* Description */}
          <p
            id={descriptionId}
            className="text-sm text-[var(--color-muted-foreground)] leading-relaxed"
          >
            {provider.description}
          </p>

          {/* ══ SECTION 1 — Connect your {provider} account ══════════ */}
          <section>
            <SectionHeader
              number="①"
              title={t('integrations.dialog.connection.title', { provider: provider.name })}
              subtitle={t('integrations.dialog.connection.subtitle')}
            />

            <form
              onSubmit={handleSave}
              noValidate
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-4"
            >
              {/* 1a. Webhook URL */}
              <FieldGroup
                label={t('integrations.dialog.webhookUrl.label')}
                hint={
                  isUrlToken && !existing
                    ? t('integrations.dialog.webhookUrl.beforeSaveHint', { provider: provider.name })
                    : isUrlToken
                      ? t('integrations.dialog.webhookUrl.tokenHint', { provider: provider.name })
                      : t('integrations.dialog.webhookUrl.signatureHint', { provider: provider.name })
                }
              >
                {isUrlToken && !existing ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-3 py-4 text-center">
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {t('integrations.dialog.webhookUrl.afterSave')}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2">
                    <code className="flex-1 text-xs text-[var(--color-foreground)] truncate font-mono">
                      {webhookUrl}
                    </code>
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3" />
                          {t('integrations.dialog.actions.copied')}
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          {t('integrations.dialog.actions.copy')}
                        </>
                      )}
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mt-2">
                  <a
                    href={provider.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80"
                  >
                    {t('integrations.dialog.actions.openDashboard', { provider: provider.name })}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {isUrlToken && existing && !confirmRotate && (
                    <button
                      type="button"
                      onClick={() => setConfirmRotate(true)}
                      className="text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-red-600"
                    >
                      {t('integrations.dialog.actions.rotateToken')}
                    </button>
                  )}
                  {isUrlToken && existing && confirmRotate && (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-amber-700 dark:text-amber-300">
                        {t('integrations.dialog.rotationGrace')}
                      </span>
                      <button
                        type="button"
                        onClick={handleRotate}
                        disabled={pending}
                        className="rounded bg-red-500 text-white px-2 py-0.5 text-[11px] font-bold hover:bg-red-600"
                      >
                        {t('integrations.dialog.actions.rotate')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRotate(false)}
                        className="rounded px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                      >
                        {t('integrations.dialog.actions.cancel')}
                      </button>
                    </div>
                  )}
                </div>
              </FieldGroup>

              {/* 1b. Signing secret (signature providers only) */}
              {!isUrlToken && (
                <div>
                  <Field
                    label={
                      existing
                        ? t('integrations.dialog.keepSecret', { label: provider.secretLabel })
                        : `${provider.secretLabel} *`
                    }
                  >
                    <input
                      type="password"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      className="input font-mono"
                      placeholder={
                        existing ? '••••••••••••' : provider.secretPlaceholder
                      }
                      autoComplete="off"
                    />
                  </Field>
                  <HelpBlock
                    whatIsIt={provider.secretWhatIsIt}
                    whereToFind={provider.secretWhereToFind}
                  />
                </div>
              )}

              {/* 1b'. Producer ID (url-token providers only) — second-layer auth */}
              {isUrlToken && provider.producerIdLabel && (
                <div>
                  <Field
                    label={t('integrations.dialog.optionalRecommended', {
                      label: provider.producerIdLabel,
                    })}
                  >
                    <input
                      type="text"
                      value={producerId}
                      onChange={(e) => setProducerId(e.target.value)}
                      className="input font-mono"
                      placeholder={provider.producerIdPlaceholder ?? ''}
                      autoComplete="off"
                    />
                  </Field>
                  <HelpBlock
                    whatIsIt={provider.producerIdWhatIsIt ?? ''}
                    whereToFind={provider.producerIdWhereToFind ?? ''}
                  />
                </div>
              )}

              {/* 1c. Name */}
              <Field label={t('integrations.dialog.displayName')}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input"
                  placeholder={provider.name}
                />
              </Field>

              {/* 1d. Advanced (fallback + default expiration) */}
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" />
                    {t('integrations.dialog.advanced.title')}
                  </span>
                  <span>{advancedOpen ? '−' : '+'}</span>
                </button>
                {advancedOpen && (
                  <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border)] pt-3">
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                      <strong>{t('integrations.dialog.advanced.recommendationTitle')}</strong>{' '}
                      {t('integrations.dialog.advanced.recommendation')}
                    </div>
                    <Field
                      label={t('integrations.dialog.advanced.fallbackLabel')}
                      hint={t('integrations.dialog.advanced.fallbackHint')}
                    >
                      <select
                        value={accessLevelId}
                        onChange={(e) => setAccessLevelId(e.target.value)}
                        className="input"
                      >
                        <option value="">{t('integrations.dialog.advanced.noFallback')}</option>
                        {accessLevels.map((al) => (
                          <option key={al.id} value={al.id}>
                            {al.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={t('integrations.dialog.advanced.expirationLabel')}
                      hint={t('integrations.dialog.advanced.expirationHint')}
                    >
                      <input
                        type="number"
                        min={0}
                        value={expirationDays}
                        onChange={(e) => setExpirationDays(e.target.value)}
                        className="input"
                        placeholder={t('integrations.dialog.advanced.expirationPlaceholder')}
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Save + pause toggle */}
              <div className="flex items-center justify-between gap-2 pt-1">
                {existing ? (
                  <button
                    type="button"
                    onClick={handleToggle}
                    disabled={pending}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      existing.isActive
                        ? 'text-emerald-600 dark:text-emerald-400 hover:bg-[var(--color-muted)]'
                        : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
                    }`}
                  >
                    {existing.isActive ? (
                      <>
                        <Power className="w-3.5 h-3.5" />
                        {t('integrations.dialog.actions.active')}
                      </>
                    ) : (
                      <>
                        <PowerOff className="w-3.5 h-3.5" />
                        {t('integrations.dialog.actions.inactive')}
                      </>
                    )}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {existing
                    ? t('integrations.dialog.actions.save')
                    : t('integrations.dialog.actions.connect')}
                </button>
              </div>
            </form>

            {/* Test connection — only available after a config is saved + active */}
            {existing && existing.isActive && (
              <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-[var(--color-primary)]" />
                      {t('integrations.dialog.test.title')}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted-foreground)]">
                      {t('integrations.dialog.test.description')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendTest}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 shrink-0"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {testing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    {t('integrations.dialog.test.send')}
                  </button>
                </div>
                {testResult && (
                  <div
                    className="mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                    style={{
                      backgroundColor: testResult.ok
                        ? 'color-mix(in oklab, #10b981 12%, transparent)'
                        : 'color-mix(in oklab, #ef4444 10%, transparent)',
                      color: testResult.ok ? '#059669' : '#dc2626',
                    }}
                  >
                    {testResult.ok ? (
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {testResult.ok
                          ? t('integrations.dialog.test.reachable')
                          : t('integrations.dialog.test.failed', {
                              status:
                                testResult.status ||
                                t('integrations.dialog.test.noResponse'),
                            })}
                      </p>
                      <p className="opacity-80 mt-0.5 break-words">
                        {t(
                          testResult.ok
                            ? 'integrations.dialog.test.successDetail'
                            : 'integrations.dialog.test.failureDetail',
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ══ SECTION 2 — Your offers ═════════════════════════════ */}
          <section>
            <SectionHeader
              number="②"
              title={t('integrations.dialog.offers.title')}
              subtitle={t('integrations.dialog.offers.subtitle', {
                provider: provider.name,
              })}
            />

            {existing ? (
              <div className="space-y-3">
                {!existing.accessLevelId && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('integrations.dialog.offers.failClosedTitle')}</strong>{' '}
                      {t('integrations.dialog.offers.failClosedDescription')}
                    </span>
                  </div>
                )}
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  <WebhookProductMappings
                    config={existing}
                    courses={courses}
                    providerSpec={provider}
                    alwaysOpen
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-5 text-xs text-[var(--color-muted-foreground)] flex items-center gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 text-[var(--color-primary)]" />
                {t('integrations.dialog.offers.locked', { provider: provider.name })}
              </div>
            )}
          </section>

          {/* Danger zone */}
          {existing && (
            <section className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  {t('integrations.dialog.danger.title')}
                </p>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  {t('integrations.dialog.danger.description')}
                </p>
              </div>
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={pending}
                    className="rounded-lg bg-red-500 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-600 disabled:opacity-50"
                  >
                    {t('integrations.dialog.actions.confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] px-2 py-1"
                  >
                    {t('integrations.dialog.actions.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('integrations.dialog.actions.delete')}
                </button>
              )}
            </section>
          )}
        </div>

        <style jsx>{`
          .input {
            width: 100%;
            border-radius: 0.75rem;
            border: 1px solid var(--color-border);
            background: var(--color-card);
            color: var(--color-foreground);
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
          }
          .input:focus {
            box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-primary) 40%, transparent);
            border-color: transparent;
          }
        `}</style>
      </div>
    </div>
  );
}

function SectionHeader({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="mb-3">
      <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--color-foreground)]">
        <span className="text-[var(--color-primary)]">{number}</span>
        {title}
      </h3>
      <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
        {subtitle}
      </p>
    </header>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-[var(--color-muted-foreground)] mt-1 leading-relaxed">
          {hint}
        </span>
      )}
    </label>
  );
}

/** A visually labelled region whose children include links or buttons. */
function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <p className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1">
        {label}
      </p>
      {children}
      {hint && (
        <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

function HelpBlock({
  whatIsIt,
  whereToFind,
}: {
  whatIsIt: string;
  whereToFind: string;
}) {
  const { t } = useAdminOperationsPresentation();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <HelpCircle className="w-3 h-3" />
        {open ? t('integrations.dialog.help.hide') : t('integrations.dialog.help.show')}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 space-y-2 text-[11px] leading-relaxed">
          <p>
            <span className="font-semibold text-[var(--color-foreground)]">
              {t('integrations.dialog.help.whatIsIt')}
            </span>{' '}
            <span className="text-[var(--color-muted-foreground)]">
              {whatIsIt}
            </span>
          </p>
          <p>
            <span className="font-semibold text-[var(--color-foreground)]">
              {t('integrations.dialog.help.whereToFind')}
            </span>{' '}
            <span className="text-[var(--color-muted-foreground)]">
              {whereToFind}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
