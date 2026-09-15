'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Save, Loader2, Award, RefreshCw } from 'lucide-react';
import {
  saveCertificateSettings,
  renderCertificatePreview,
  type AdminCertificateSettings,
  type CertificateTemplate,
} from '@/features/Admin/certificates';
import { ImageUpload } from '@/shared/components/ui/ImageUpload';
import { AdminPageHeader } from './AdminPageHeader';
import { ColorPicker } from '@/shared/components/ui/ColorPicker';
import { appToast } from '@/shared/lib/toast';

type Props = {
  initialSettings: AdminCertificateSettings;
  tenantPrimaryColor: string;
};

export function AdminCertificates({
  initialSettings,
  tenantPrimaryColor,
}: Props) {
  const t = useTranslations('certificates.admin');
  const [form, setForm] = useState<AdminCertificateSettings>(initialSettings);
  const [savedBaseline, setSavedBaseline] = useState<AdminCertificateSettings>(initialSettings);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedBaseline),
    [form, savedBaseline],
  );

  function set<K extends keyof AdminCertificateSettings>(
    key: K,
    value: AdminCertificateSettings[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const refreshPreview = useCallback(
    async (settings: AdminCertificateSettings) => {
      setPreviewLoading(true);
      try {
        const overrides: Partial<CertificateTemplate> = {
          signatureUrl: settings.signatureUrl,
          signatureName: settings.signatureName,
          signatureRole: settings.signatureRole,
          footer: settings.footer,
          accentColor: settings.accentColor ?? tenantPrimaryColor,
          logoUrl: settings.logoUrl,
          ...(settings.title !== null ? { title: settings.title } : {}),
          ...(settings.body !== null ? { body: settings.body } : {}),
        };
        const result = await renderCertificatePreview(overrides);
        if ('error' in result) {
          const key = `errors.${result.error}`;
          appToast.danger(
            t('errorTitle'),
            t.has(key) ? t(key) : t('errors.generic'),
          );
          return;
        }
        setPreviewDataUrl(result.dataUrl);
      } catch {
        appToast.danger(t('errorTitle'), t('errors.preview_failed'));
      } finally {
        setPreviewLoading(false);
      }
    },
    [t, tenantPrimaryColor],
  );

  // Initial preview load
  useEffect(() => {
    void refreshPreview(initialSettings);
  }, [initialSettings, refreshPreview]);

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await saveCertificateSettings(form);
        if ('error' in result && result.error) {
          const key = `errors.${result.error}`;
          appToast.danger(
            t('errorTitle'),
            t.has(key) ? t(key) : t('errors.generic'),
          );
          return;
        }
        setSavedBaseline(form);
        setJustSaved(true);
        appToast.success(t('saveSuccess'));
        await refreshPreview(form);
      } catch {
        appToast.danger(
          t('errorTitle'),
          t('errors.save_failed'),
        );
      }
    });
  }

  function handleDiscard() {
    setForm(savedBaseline);
    void refreshPreview(savedBaseline);
  }

  return (
    <div className="pb-24 max-w-6xl mx-auto w-full">
      <AdminPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,1.3fr)] gap-6">
        {/* ── Form ─────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Master switch */}
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
                className="mt-1 w-4 h-4 accent-[var(--color-primary)]"
              />
              <div>
                <p className="text-sm font-bold text-[var(--color-foreground)]">
                  {t('enabled')}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                  {t('enabledHelp')}
                </p>
              </div>
            </label>
          </section>

          <Section title={t('copySection')}>
            <Field id="certificate-title" label={t('titleLabel')}>
              <input
                id="certificate-title"
                value={form.title ?? ''}
                onChange={(e) => set('title', e.target.value)}
                placeholder={t('titlePlaceholder')}
                className={inputClass}
              />
            </Field>
            <Field
              id="certificate-body"
              label={t('bodyLabel')}
              hint={t('bodyHint')}
            >
              <textarea
                id="certificate-body"
                value={form.body ?? ''}
                onChange={(e) => set('body', e.target.value)}
                rows={2}
                placeholder={t('bodyPlaceholder')}
                className={`${inputClass} resize-none`}
              />
            </Field>
            <Field
              id="certificate-footer"
              label={t('footerLabel')}
              hint={t('footerHint')}
            >
              <input
                id="certificate-footer"
                value={form.footer ?? ''}
                onChange={(e) => set('footer', e.target.value)}
                placeholder={t('footerPlaceholder')}
                className={inputClass}
              />
            </Field>
          </Section>

          <Section title={t('signatureSection')}>
            <ImageUpload
              label={t('signatureImage')}
              value={form.signatureUrl}
              onChange={(url) => set('signatureUrl', url)}
              folder="branding"
              aspectRatio="3/1"
              recommendedSize="600×200"
              accept="image/png,image/jpeg"
              helpText={t('signatureImageHelp')}
            />
            <Field id="certificate-signee-name" label={t('signeeName')}>
              <input
                id="certificate-signee-name"
                value={form.signatureName ?? ''}
                onChange={(e) => set('signatureName', e.target.value)}
                placeholder={t('signeeNamePlaceholder')}
                className={inputClass}
              />
            </Field>
            <Field id="certificate-signee-role" label={t('signeeRole')}>
              <input
                id="certificate-signee-role"
                value={form.signatureRole ?? ''}
                onChange={(e) => set('signatureRole', e.target.value)}
                placeholder={t('signeeRolePlaceholder')}
                className={inputClass}
              />
            </Field>
          </Section>

          <Section title={t('visualSection')}>
            <ImageUpload
              label={t('logo')}
              value={form.logoUrl}
              onChange={(url) => set('logoUrl', url)}
              folder="branding"
              aspectRatio="4/1"
              recommendedSize="512×128"
              accept="image/png,image/jpeg"
              helpText={t('logoHelp')}
            />
            <ColorPicker
              label={t('accentColor')}
              value={form.accentColor || tenantPrimaryColor}
              onChange={(hex) => set('accentColor', hex)}
              helpText={t('accentColorHelp')}
            />
          </Section>

          <button
            type="button"
            onClick={() => void refreshPreview(form)}
            disabled={previewLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
          >
            <RefreshCw
              className={`w-4 h-4 ${previewLoading ? 'animate-spin' : ''}`}
            />
            {t('refreshPreview')}
          </button>
        </div>

        {/* ── Preview ──────────────────────────────────────── */}
        <div className="sticky top-4 self-start">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" /> {t('livePreview')}
              </span>
              {previewLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-muted-foreground)]" />
              )}
            </div>
            {previewDataUrl ? (
              <iframe
                src={previewDataUrl}
                title={t('previewTitle')}
                className="w-full aspect-[841/595] rounded-xl bg-[var(--color-card)]"
              />
            ) : (
              <div className="w-full aspect-[841/595] rounded-xl bg-[var(--color-muted)] flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                {t('generatingPreview')}
              </div>
            )}
            <p className="text-xs text-[var(--color-muted-foreground)] mt-2 px-2">
              {t('previewNote')} <strong>{t('previewStudent')}</strong> ·{' '}
              <strong>{t('previewCourse')}</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky save bar */}
      {(dirty || justSaved) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {dirty ? t('unsaved') : t('saved')}
            </p>
            <div className="flex items-center gap-2">
              {dirty && !pending && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  {t('discard')}
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || pending}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {pending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> {t('saveTemplate')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-[var(--color-foreground)]"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}
