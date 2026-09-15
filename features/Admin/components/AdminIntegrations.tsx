'use client';

import { useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Plug,
  Settings,
  ArrowRight,
} from 'lucide-react';
import {
  getAdminWebhookConfigs,
  getAdminWebhookLogs,
} from '../actions';
import type {
  AdminWebhookConfig,
  AdminWebhookLog,
  AdminAccessLevel,
  AdminCourseLite,
  AdminDeadLetter,
  WebhookAnomaly,
} from '../actions';
import { AdminWebhookRetries } from './AdminWebhookRetries';
import { AdminPageHeader } from './AdminPageHeader';
import { IntegrationSetupDialog } from './IntegrationSetupDialog';
import {
  WEBHOOK_PROVIDERS,
  type WebhookProviderSpec,
} from '@/lib/webhooks/providers';
import { appToast } from '@/shared/lib/toast';
import {
  localizeWebhookProvider,
  useAdminOperationsPresentation,
} from '../operations-presentation';

const STATUS_COLORS: Record<string, string> = {
  received: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  processed:
    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  failed: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
};

const PROVIDER_COLORS: Record<string, string> = {
  stripe:
    'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  guru: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  generic: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
};

export function AdminIntegrations({
  initialConfigs,
  initialLogs,
  initialDeadLetters,
  initialAnomalies,
  accessLevels,
  courses,
  initialNow,
}: {
  initialConfigs: AdminWebhookConfig[];
  initialLogs: AdminWebhookLog[];
  initialDeadLetters: AdminDeadLetter[];
  initialAnomalies: WebhookAnomaly[];
  accessLevels: AdminAccessLevel[];
  courses: AdminCourseLite[];
  /** Server-captured Date.now() — used to frame the 24h health window. */
  initialNow: number;
}) {
  const { t, error, dateTime } = useAdminOperationsPresentation();
  const [configs, setConfigs] = useState<AdminWebhookConfig[]>(initialConfigs);
  const [logs, setLogs] = useState<AdminWebhookLog[]>(initialLogs);
  const [tab, setTab] = useState<'providers' | 'logs' | 'retries'>('providers');
  const pendingRetries = initialDeadLetters.filter(
    (r) => r.status === 'pending' || r.status === 'abandoned',
  ).length;
  const [openProvider, setOpenProvider] = useState<WebhookProviderSpec | null>(
    null,
  );
  const [, startTransition] = useTransition();
  const providers = useMemo(
    () => WEBHOOK_PROVIDERS.map((provider) => localizeWebhookProvider(provider, t)),
    [t],
  );
  const tabs = [
    { key: 'providers', label: t('integrations.tabs.providers') },
    { key: 'logs', label: t('integrations.tabs.logs', { count: logs.length }) },
    {
      key: 'retries',
      label: t('integrations.tabs.retries', { count: pendingRetries }),
    },
  ] as const;

  function tabId(key: (typeof tabs)[number]['key']) {
    return `admin-integrations-tab-${key}`;
  }

  function panelId(key: (typeof tabs)[number]['key']) {
    return `admin-integrations-panel-${key}`;
  }

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextKey = tabs[nextIndex].key;
    setTab(nextKey);
    document.getElementById(tabId(nextKey))?.focus();
  }

  function reload() {
    startTransition(async () => {
      try {
        const [freshConfigs, freshLogs] = await Promise.all([
          getAdminWebhookConfigs(),
          getAdminWebhookLogs(),
        ]);
        setConfigs(freshConfigs);
        setLogs(freshLogs);
      } catch (cause) {
        appToast.danger(error(cause, 'loadFailed'));
      }
    });
  }

  // Map provider id → its active config (if any) for quick card lookup.
  const configByProvider = useMemo(() => {
    const map = new Map<string, AdminWebhookConfig>();
    for (const c of configs) map.set(c.provider, c);
    return map;
  }, [configs]);

  // Pair log counts by provider so the card badge reflects recent health.
  //
  // Counts are bounded to the last 24h so a single old failure doesn't
  // flag the integration forever. Event types excluded from the health
  // signal:
  //   - auth_failed : system correctly rejecting bad tokens, not a bug
  //   - test.ping   : admin-triggered verifications, not real traffic
  //
  // The "now" reference is captured when the server rendered the page
  // — passed in as a number via `initialNow`. Each reload() pulls fresh
  // logs and keeps the reference; if the admin leaves the tab open for
  // days without navigating, the window will drift, but that is a minor
  // display issue, not a correctness one.
  const statusByProvider = useMemo(() => {
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const since = initialNow - WINDOW_MS;
    const ignored = new Set(['auth_failed', 'test.ping']);
    const map = new Map<string, { failed: number; total: number }>();
    for (const l of logs) {
      if (new Date(l.createdAt).getTime() < since) continue;
      if (ignored.has(l.eventType)) continue;
      const cur = map.get(l.provider) ?? { failed: 0, total: 0 };
      cur.total += 1;
      if (l.status === 'failed') cur.failed += 1;
      map.set(l.provider, cur);
    }
    return map;
  }, [logs, initialNow]);

  return (
    <div className="max-w-6xl mx-auto w-full pb-16">
      <AdminPageHeader
        eyebrow={t('integrations.header.eyebrow')}
        title={t('integrations.header.title')}
        description={t('integrations.header.description')}
      />

      {/* Anomaly banner — shows when auth_failed / rate_limited events
          crossed a conservative threshold in the last hour. Non-blocking;
          the admin decides whether it's real abuse or stale URL retries. */}
      {initialAnomalies.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">
                {t('integrations.anomalies.title')}
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {initialAnomalies.map((a, i) => (
                  <li key={i}>
                    <span className="font-semibold uppercase">{a.provider}</span>{' '}
                    — {t(`integrations.anomalies.${a.kind}`, {
                      count: a.authFailedLastHour,
                    })}
                  </li>
                ))}
              </ul>
              <p className="opacity-75">
                {t('integrations.anomalies.hint')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label={t('integrations.header.title')}
        className="flex gap-1 bg-[var(--color-muted)] rounded-lg p-1 w-fit mb-6"
      >
        {tabs.map(({ key, label }, index) => (
          <button
            key={key}
            id={tabId(key)}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={panelId(key)}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              tab === key
                ? 'bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'providers' && (
        <div
          id={panelId('providers')}
          role="tabpanel"
          aria-labelledby={tabId('providers')}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              config={configByProvider.get(provider.id) ?? null}
              stats={statusByProvider.get(provider.id) ?? null}
              onOpen={() => setOpenProvider(provider)}
            />
          ))}
        </div>
      )}

      {tab === 'logs' && (
        <div
          id={panelId('logs')}
          role="tabpanel"
          aria-labelledby={tabId('logs')}
          className="bg-[var(--color-card)] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden"
        >
          {logs.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              {t('integrations.logs.empty')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">{t('integrations.logs.columns.provider')}</th>
                    <th className="px-4 py-3 text-left">{t('integrations.logs.columns.event')}</th>
                    <th className="px-4 py-3 text-left">{t('integrations.logs.columns.status')}</th>
                    <th className="px-4 py-3 text-left">{t('integrations.logs.columns.error')}</th>
                    <th className="px-4 py-3 text-right">{t('integrations.logs.columns.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            PROVIDER_COLORS[log.provider] ??
                            PROVIDER_COLORS.generic
                          }`}
                        >
                          {log.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-foreground)]">
                        {log.eventType}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[log.status] ??
                            'bg-[var(--color-muted)] text-[var(--color-foreground)]'
                          }`}
                        >
                          {log.status === 'processed' && (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          {log.status === 'failed' && (
                            <XCircle className="w-3 h-3" />
                          )}
                          {log.status === 'received' && (
                            <Clock className="w-3 h-3" />
                          )}
                          {t.has(`integrations.status.${log.status}`)
                            ? t(`integrations.status.${log.status}`)
                            : log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)] text-xs max-w-xs truncate">
                        {log.errorMessage
                          ? t('integrations.logs.errorSummary')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)] text-xs">
                        {dateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'retries' && (
        <div
          id={panelId('retries')}
          role="tabpanel"
          aria-labelledby={tabId('retries')}
        >
          <AdminWebhookRetries initial={initialDeadLetters} />
        </div>
      )}

      {openProvider && (
        <IntegrationSetupDialog
          provider={openProvider}
          existing={configByProvider.get(openProvider.id) ?? null}
          accessLevels={accessLevels}
          courses={courses}
          onClose={() => setOpenProvider(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  config,
  stats,
  onOpen,
}: {
  provider: WebhookProviderSpec;
  config: AdminWebhookConfig | null;
  stats: { failed: number; total: number } | null;
  onOpen: () => void;
}) {
  const { t } = useAdminOperationsPresentation();
  const status = !config
    ? ({
        label: t('integrations.providerStatus.notConnected'),
        tone: 'muted' as const,
        icon: Plug,
      } as const)
    : !config.isActive
      ? ({
          label: t('integrations.providerStatus.paused'),
          tone: 'amber' as const,
          icon: Clock,
        } as const)
      : // Require at least 3 real failures before flagging — low-volume
        // integrations where 1 fail = 100% failure ratio were triggering
        // false positives.
        stats &&
          stats.failed >= 3 &&
          stats.failed / Math.max(1, stats.total) > 0.2
        ? ({
            label: t('integrations.providerStatus.errors'),
            tone: 'red' as const,
            icon: AlertTriangle,
          } as const)
        : ({
            label: t('integrations.providerStatus.connected'),
            tone: 'green' as const,
            icon: CheckCircle,
          } as const);

  const Icon = status.icon;
  const toneClasses = {
    muted: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
    green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    red: 'bg-red-500/15 text-red-600 dark:text-red-400',
  }[status.tone];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 hover:border-[var(--color-primary)]/40 hover:shadow-md transition flex flex-col gap-3"
    >
      {/* Header with logo + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
          <Image
            src={provider.logoPath}
            alt={provider.name}
            width={48}
            height={48}
          />
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toneClasses}`}
        >
          <Icon className="w-3 h-3" />
          {status.label}
        </span>
      </div>

      {/* Name + tagline */}
      <div>
        <h3 className="text-base font-bold text-[var(--color-foreground)]">
          {provider.name}
        </h3>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
          {provider.tagline}
        </p>
      </div>

      {/* Capability chips */}
      <div className="flex flex-wrap gap-1.5">
        {provider.capabilities.map((cap) => (
          <span
            key={cap}
            className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Footer action */}
      <div className="flex items-center justify-between pt-2 mt-auto">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted-foreground)]">
          <Settings className="w-3.5 h-3.5" />
          {config ? t('integrations.actions.configure') : t('integrations.actions.connect')}
        </span>
        <ArrowRight className="w-4 h-4 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] group-hover:translate-x-0.5 transition" />
      </div>
    </button>
  );
}
