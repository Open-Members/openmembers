'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  FileText,
  Code,
  RotateCcw,
  Save,
  Send,
  CheckCircle2,
} from 'lucide-react';
import {
  saveEmailTemplate,
  resetEmailTemplate,
  previewEmailTemplate,
  sendTemplateTestEmail,
  type AdminEmailTemplate,
} from '../actions';
import {
  adminOperationsError,
  useAdminOperationsPresentation,
} from '../operations-presentation';

export function AdminEmailTemplates({ templates }: { templates: AdminEmailTemplate[] }) {
  const { t } = useAdminOperationsPresentation();
  const [activeKey, setActiveKey] = useState<string>(templates[0]?.key ?? '');
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    () => Object.fromEntries(templates.map((t) => [t.key, { ...t.content }])),
  );
  const [savedDrafts, setSavedDrafts] = useState<Record<string, Record<string, string>>>(
    () => Object.fromEntries(templates.map((template) => [template.key, { ...template.content }])),
  );
  const [authoredFields, setAuthoredFields] = useState<Record<string, string[]>>(
    () => Object.fromEntries(
      templates.map((template) => [template.key, [...template.overrideFields]]),
    ),
  );
  const [customized, setCustomized] = useState<Record<string, boolean>>(
    () => Object.fromEntries(templates.map((template) => [template.key, !template.isDefault])),
  );
  const [previews, setPreviews] = useState<Record<string, { subject: string; html: string }>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewPending, startPreview] = useTransition();
  const [activeField, setActiveField] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const debounceRef = useRef<number | null>(null);

  const [isSaving, startSaving] = useTransition();
  const [isResetting, startResetting] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');

  const activeTemplate = useMemo(
    () => templates.find((t) => t.key === activeKey) ?? templates[0],
    [templates, activeKey],
  );

  const activeDraft = useMemo(() => drafts[activeKey] ?? {}, [drafts, activeKey]);
  const hasUnsavedChanges = useMemo(() => {
    if (!activeTemplate) return false;
    const current = savedDrafts[activeKey] ?? activeTemplate.content;
    const draft = drafts[activeKey] ?? {};
    return activeTemplate.fields.some((f) => (draft[f.key] ?? '') !== (current[f.key] ?? ''));
  }, [activeTemplate, activeKey, drafts, savedDrafts]);

  // Debounced preview refresh on draft changes
  useEffect(() => {
    if (!activeTemplate) return;
    let cancelled = false;
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      startPreview(async () => {
        setPreviewError(null);
        try {
          const res = await previewEmailTemplate(activeTemplate.key, activeDraft);
          if (cancelled) return;
          if ('error' in res) {
            setPreviewError(adminOperationsError(t, res.error));
          } else {
            setPreviews((prev) => ({ ...prev, [activeTemplate.key]: res }));
          }
        } catch (cause) {
          if (!cancelled) setPreviewError(adminOperationsError(t, cause));
        }
      });
    }, 350);
    return () => {
      cancelled = true;
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [activeKey, activeTemplate, activeDraft, t]);

  function updateField(key: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [activeKey]: { ...(prev[activeKey] ?? {}), [key]: value },
    }));
    setAuthoredFields((previous) => {
      const current = previous[activeKey] ?? [];
      if (current.includes(key)) return previous;
      return { ...previous, [activeKey]: [...current, key] };
    });
    setStatusMsg(null);
  }

  function insertVar(varName: string) {
    if (!activeField) return;
    const el = fieldRefs.current[activeField];
    if (!el) return;
    const token = `{{${varName}}}`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    updateField(activeField, next);
    // Restore focus + caret after state flush
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function handleSave() {
    if (!activeTemplate) return;
    setStatusMsg(null);
    startSaving(async () => {
      try {
        const fieldKeys = new Set(activeTemplate.fields.map((field) => field.key));
        const authoredContent = Object.fromEntries(
          (authoredFields[activeTemplate.key] ?? [])
            .filter((key) => fieldKeys.has(key))
            .map((key) => [key, activeDraft[key] ?? '']),
        );
        const result = await saveEmailTemplate(activeTemplate.key, authoredContent);
        if ('error' in result && result.error) {
          setStatusMsg({ type: 'err', text: adminOperationsError(t, result.error) });
        } else {
          setSavedDrafts((previous) => ({
            ...previous,
            [activeTemplate.key]: { ...activeDraft },
          }));
          setCustomized((previous) => ({ ...previous, [activeTemplate.key]: true }));
          setStatusMsg({ type: 'ok', text: t('email.templates.saved') });
        }
      } catch (cause) {
        setStatusMsg({ type: 'err', text: adminOperationsError(t, cause) });
      }
    });
  }

  function handleReset() {
    if (!activeTemplate) return;
    if (!confirm(t('email.templates.resetConfirm'))) return;
    setStatusMsg(null);
    startResetting(async () => {
      try {
        const result = await resetEmailTemplate(activeTemplate.key);
        if ('error' in result && result.error) {
          setStatusMsg({ type: 'err', text: adminOperationsError(t, result.error) });
        } else {
          // A full reload rehydrates the exact defaults returned by the server.
          window.location.reload();
        }
      } catch (cause) {
        setStatusMsg({ type: 'err', text: adminOperationsError(t, cause) });
      }
    });
  }

  function handleSendTest() {
    if (!activeTemplate) return;
    setStatusMsg(null);
    startTesting(async () => {
      try {
        const result = await sendTemplateTestEmail(activeTemplate.key, activeDraft, testEmail);
        if ('error' in result && result.error) {
          setStatusMsg({ type: 'err', text: adminOperationsError(t, result.error) });
        } else {
          setStatusMsg({
            type: 'ok',
            text: t('email.templates.testSent', { email: testEmail }),
          });
        }
      } catch (cause) {
        setStatusMsg({ type: 'err', text: adminOperationsError(t, cause) });
      }
    });
  }

  if (!activeTemplate) return null;

  const preview = previews[activeTemplate.key];

  return (
    <div className="rounded-2xl border border-hairline bg-[var(--color-card)] p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] p-2 text-[var(--color-primary)]">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
            {t('email.templates.title')}
          </h3>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            {t.rich('email.templates.description', {
              code: (chunks) => (
                <code className="px-1 py-0.5 rounded bg-[var(--color-muted)] text-xs">
                  {chunks}
                </code>
              ),
            })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-hairline overflow-x-auto">
        {templates.map((template) => (
          <button
            key={template.key}
            onClick={() => setActiveKey(template.key)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              activeKey === template.key
                ? 'border-[var(--color-primary)] text-[var(--color-foreground)]'
                : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
            }`}
          >
            {t(`email.templates.catalog.${template.key}.name`)}
            {customized[template.key] && activeKey !== template.key && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
            )}
          </button>
        ))}
      </div>

      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t(`email.templates.catalog.${activeTemplate.key}.description`)}
      </p>
      <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        {t('email.templates.globalOverrideNotice')}
      </p>

      {/* Variable chips */}
      <div>
        <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-2 block">
          {t('email.templates.insertVariable')}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {activeTemplate.varKeys.map((v) => (
            <button
              key={v}
              onClick={() => insertVar(v)}
              disabled={!activeField}
              title={
                activeField
                  ? t('email.templates.insertVariableTitle', { variable: `{{${v}}}` })
                  : t('email.templates.selectFieldFirst')
              }
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1 text-xs font-mono text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Code className="h-3 w-3" />
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Editor + preview */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {activeTemplate.fields.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`${activeTemplate.key}-${field.key}`}
                className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block"
              >
                {t(`email.templates.catalog.${activeTemplate.key}.fields.${field.key}`)}
              </label>
              {field.type === 'long' ? (
                <textarea
                  id={`${activeTemplate.key}-${field.key}`}
                  ref={(el) => {
                    fieldRefs.current[field.key] = el;
                  }}
                  value={activeDraft[field.key] ?? ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  onFocus={() => setActiveField(field.key)}
                  rows={3}
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              ) : (
                <input
                  id={`${activeTemplate.key}-${field.key}`}
                  ref={(el) => {
                    fieldRefs.current[field.key] = el;
                  }}
                  value={activeDraft[field.key] ?? ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  onFocus={() => setActiveField(field.key)}
                  className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              )}
            </div>
          ))}
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
            {t('email.templates.preview')}
          </label>
          {previewError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {previewError}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-muted)]">
              <div className="px-3 py-2 bg-[var(--color-card)] border-b border-[var(--color-border)] text-xs">
                <span className="font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mr-2">
                  {t('email.templates.subject')}
                </span>
                <span className="text-[var(--color-foreground)]">
                  {preview?.subject ?? (isPreviewPending ? t('email.templates.rendering') : '—')}
                </span>
              </div>
              <iframe
                srcDoc={preview?.html ?? ''}
                title={t('email.templates.previewTitle', {
                  name: t(`email.templates.catalog.${activeTemplate.key}.name`),
                })}
                sandbox=""
                className="w-full h-[520px] bg-[var(--color-card)]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-hairline pt-4 space-y-4">
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? t('email.templates.actions.saving') : t('email.templates.actions.save')}
          </button>
          <button
            onClick={handleReset}
            disabled={isResetting || !customized[activeTemplate.key]}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            {isResetting ? t('email.templates.actions.resetting') : t('email.templates.actions.reset')}
          </button>
          {hasUnsavedChanges && (
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {t('email.templates.unsaved')}
            </span>
          )}
          {statusMsg && (
            <span
              className={`text-sm font-medium ml-auto ${
                statusMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {statusMsg.type === 'ok' ? (
                <CheckCircle2 className="inline h-4 w-4 mr-1" />
              ) : null}
              {statusMsg.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            type="email"
            placeholder={t('email.templates.testPlaceholder')}
            className="flex-1 border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <button
            onClick={handleSendTest}
            disabled={isTesting || !testEmail}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {isTesting ? t('email.templates.actions.sending') : t('email.templates.actions.sendTest')}
          </button>
        </div>
      </div>
    </div>
  );
}
