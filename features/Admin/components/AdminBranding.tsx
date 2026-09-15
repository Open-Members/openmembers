'use client';

import { useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Palette,
  Save,
  CheckCircle,
  Image as ImageIcon,
  Loader2,
  Film,
  Activity,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { saveAdminBranding } from '../actions';
import type { AdminBrandingSettings } from '../actions';
import { ImageUpload } from '@/shared/components/ui/ImageUpload';
import { ColorPicker } from '@/shared/components/ui/ColorPicker';
import { AdminPageHeader } from './AdminPageHeader';
import { appToast } from '@/shared/lib/toast';
import { extractYoutubeId } from '@/shared/lib/youtube';
import { DEFAULT_LOADING_BAR_COLORS, DEFAULT_TENANT_SETTINGS, FONT_CATALOG } from '@/core/theme/branding';
import { getReadableForeground } from '@/core/theme/contrast';

type FormState = {
  siteName: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: keyof typeof FONT_CATALOG;
  homeHeroBannerUrl: string | null;
  homeHeroTrailerYoutubeId: string | null;
  homeHeroTitle: string | null;
  homeHeroSubtitle: string | null;
  homeHeroOverlayOpacity: number;
  homeHeroShowText: boolean;
  loadingBarStyle: 'solid' | 'gradient';
  loadingBarColors: string[];
};

const subscribeToHydration = () => () => {};
const getClientHydration = () => true;
const getServerHydration = () => false;

function toFormState(initial: AdminBrandingSettings | null): FormState {
  return {
    siteName: initial?.siteName ?? DEFAULT_TENANT_SETTINGS.site_name,
    logoLightUrl: initial?.logoLightUrl ?? null,
    logoDarkUrl: initial?.logoDarkUrl ?? null,
    faviconUrl: initial?.faviconUrl ?? null,
    ogImageUrl: initial?.ogImageUrl ?? null,
    primaryColor: initial?.primaryColor ?? DEFAULT_TENANT_SETTINGS.primary_color,
    accentColor: initial?.accentColor ?? DEFAULT_TENANT_SETTINGS.accent_color,
    fontFamily: initial?.fontFamily && initial.fontFamily in FONT_CATALOG ? initial.fontFamily as keyof typeof FONT_CATALOG : 'system',
    homeHeroBannerUrl: initial?.homeHeroBannerUrl ?? null,
    homeHeroTrailerYoutubeId: initial?.homeHeroTrailerYoutubeId ?? null,
    homeHeroTitle: initial?.homeHeroTitle ?? null,
    homeHeroSubtitle: initial?.homeHeroSubtitle ?? null,
    homeHeroOverlayOpacity: initial?.homeHeroOverlayOpacity ?? 70,
    homeHeroShowText: initial?.homeHeroShowText ?? true,
    loadingBarStyle: initial?.loadingBarStyle ?? 'gradient',
    loadingBarColors:
      initial?.loadingBarColors && initial.loadingBarColors.length >= 2
        ? [...initial.loadingBarColors]
        : [...DEFAULT_LOADING_BAR_COLORS],
  };
}

export function AdminBranding({
  initialSettings,
}: {
  initialSettings: AdminBrandingSettings | null;
}) {
  const t = useTranslations('adminOperations.branding');
  const errors = useTranslations('adminOperations.errors');
  const baseline = useMemo(() => toFormState(initialSettings), [initialSettings]);
  const [form, setForm] = useState<FormState>(baseline);
  const [savedBaseline, setSavedBaseline] = useState<FormState>(baseline);
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientHydration, getServerHydration);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedBaseline),
    [form, savedBaseline],
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    // Accept a full YouTube URL or a bare ID for the home hero trailer
    let heroTrailerId: string | null = null;
    if (form.homeHeroTrailerYoutubeId && form.homeHeroTrailerYoutubeId.trim()) {
      const parsed = extractYoutubeId(form.homeHeroTrailerYoutubeId);
      if (!parsed) {
        appToast.warning(t('errors.youtube'));
        return;
      }
      heroTrailerId = parsed;
    }

    startTransition(async () => {
      try {
        const result = await saveAdminBranding({
        siteName: form.siteName,
        logoLightUrl: form.logoLightUrl,
        logoDarkUrl: form.logoDarkUrl,
        faviconUrl: form.faviconUrl,
        ogImageUrl: form.ogImageUrl,
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
        fontFamily: form.fontFamily,
        homeHeroBannerUrl: form.homeHeroBannerUrl,
        homeHeroTrailerYoutubeId: heroTrailerId,
        homeHeroTitle: form.homeHeroTitle?.trim() || null,
        homeHeroSubtitle: form.homeHeroSubtitle?.trim() || null,
        homeHeroOverlayOpacity: form.homeHeroOverlayOpacity,
        homeHeroShowText: form.homeHeroShowText,
        loadingBarStyle: form.loadingBarStyle,
        loadingBarColors: form.loadingBarColors,
        });
        if ('error' in result && result.error) {
          appToast.danger(errors(result.error === 'invalidInput' ? 'invalidInput' : 'saveFailed'));
          return;
        }
        setSavedBaseline(form);
        setJustSaved(true);
        appToast.success(t('savedToast'));
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } catch {
        appToast.danger(errors('saveFailed'));
      }
    });
  }

  function handleDiscard() {
    setForm(savedBaseline);
  }

  return (
    // The server preview must not accept edits before onChange can retain them.
    <fieldset
      disabled={!hydrated}
      aria-label={t('header.title')}
      className="min-w-0 border-0 p-0 pb-24 space-y-8 max-w-5xl mx-auto w-full"
    >
      <AdminPageHeader
        eyebrow={t('header.eyebrow')}
        title={t('header.title')}
        description={t('header.description')}
      />

      {/* ─── Section 1 — Identity ─────────────────────────────────────── */}
      <Section icon={<ImageIcon className="w-4 h-4" />} title={t('identity.title')}>
        <Field label={t('identity.siteName')} htmlFor="branding-site-name">
          <input
            id="branding-site-name"
            value={form.siteName}
            maxLength={120}
            onChange={(e) => set('siteName', e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ImageUpload
            label={t('identity.logoLight')}
            value={form.logoLightUrl}
            onChange={(url) => set('logoLightUrl', url)}
            folder="branding"
            aspectRatio="4/1"
            recommendedSize="512×128"
            helpText={t('identity.logoLightHelp')}
          />
          <ImageUpload
            label={t('identity.logoDark')}
            value={form.logoDarkUrl}
            onChange={(url) => set('logoDarkUrl', url)}
            folder="branding"
            aspectRatio="4/1"
            recommendedSize="512×128"
            helpText={t('identity.logoDarkHelp')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ImageUpload
            label={t('identity.favicon')}
            value={form.faviconUrl}
            onChange={(url) => set('faviconUrl', url)}
            folder="branding"
            aspectRatio="1/1"
            recommendedSize="64×64"
            helpText={t('identity.faviconHelp')}
            accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
          />
          <ImageUpload
            label={t('identity.socialImage')}
            value={form.ogImageUrl}
            onChange={(url) => set('ogImageUrl', url)}
            folder="branding"
            aspectRatio="1200/630"
            recommendedSize="1200×630"
            helpText={t('identity.socialImageHelp')}
          />
        </div>

        <Field label={t('identity.bodyFont')} htmlFor="branding-font" hint={t('identity.bodyFontHelp')}>
          <select
            id="branding-font"
            value={form.fontFamily}
            onChange={(event) => set('fontFamily', event.target.value as keyof typeof FONT_CATALOG)}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)]"
          >
            {Object.keys(FONT_CATALOG).map((value) => <option key={value} value={value}>{t(`identity.fonts.${value}`)}</option>)}
          </select>
        </Field>
      </Section>

      {/* ─── Section 2 — Colors ───────────────────────────────────────── */}
      <Section icon={<Palette className="w-4 h-4" />} title={t('colors.title')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ColorPicker
            label={t('colors.primary')}
            value={form.primaryColor}
            onChange={(hex) => set('primaryColor', hex)}
            helpText={t('colors.primaryHelp')}
          />
          <ColorPicker
            label={t('colors.accent')}
            value={form.accentColor}
            onChange={(hex) => set('accentColor', hex)}
            helpText={t('colors.accentHelp')}
          />
        </div>

        {/* Live preview */}
        <div
          className="mt-2 rounded-xl overflow-hidden border border-[var(--color-border)]"
          style={{ ['--preview-primary' as string]: form.primaryColor, ['--preview-accent' as string]: form.accentColor }}
        >
          <div className="p-6 bg-[var(--color-card)]">
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] mb-3">
              {t('colors.preview')}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: form.primaryColor, color: getReadableForeground(form.primaryColor) }}
              >
                {t('colors.primaryAction')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: form.accentColor, color: getReadableForeground(form.accentColor) }}
              >
                {t('colors.accentAction')}
              </button>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-bold text-white"
                style={{ backgroundColor: form.accentColor, color: getReadableForeground(form.accentColor) }}
              >
                {t('colors.newBadge')}
              </span>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-sm font-semibold"
                style={{ color: form.primaryColor }}
              >
                {t('colors.linkText')} →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── Section 3 — Home Hero ────────────────────────────────────── */}
      <Section icon={<Film className="w-4 h-4" />} title={t('hero.title')}>
        <p className="text-xs text-[var(--color-muted-foreground)] -mt-2">
          {t('hero.description')}
        </p>

        <ImageUpload
          label={t('hero.banner')}
          value={form.homeHeroBannerUrl}
          onChange={(url) => set('homeHeroBannerUrl', url)}
          folder="branding"
          aspectRatio="16/9"
          recommendedSize="1920×1080"
          helpText={t('hero.bannerHelp')}
        />

        <Field label={t('hero.trailer')} htmlFor="branding-hero-trailer" hint={t('hero.trailerHelp')}>
          <input
            id="branding-hero-trailer"
            value={form.homeHeroTrailerYoutubeId ?? ''}
            onChange={(e) => set('homeHeroTrailerYoutubeId', e.target.value || null)}
            placeholder="https://youtu.be/dQw4w9WgXcQ"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-xs text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t('hero.heroTitle')} htmlFor="branding-hero-title">
            <input
              id="branding-hero-title"
              value={form.homeHeroTitle ?? ''}
              onChange={(e) => set('homeHeroTitle', e.target.value || null)}
              placeholder={t('hero.titlePlaceholder')}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </Field>
          <Field label={t('hero.heroSubtitle')} htmlFor="branding-hero-subtitle">
            <input
              id="branding-hero-subtitle"
              value={form.homeHeroSubtitle ?? ''}
              onChange={(e) => set('homeHeroSubtitle', e.target.value || null)}
              placeholder={t('hero.subtitlePlaceholder')}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </Field>
        </div>

        <Field
          label={t('hero.overlay')}
          htmlFor="branding-hero-overlay"
          hint={t('hero.overlayHelp')}
        >
          <div className="flex items-center gap-3">
            <input
              id="branding-hero-overlay"
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.homeHeroOverlayOpacity}
              onChange={(e) => set('homeHeroOverlayOpacity', Number(e.target.value))}
              className="flex-1 accent-[var(--color-primary)]"
            />
            <span className="w-10 text-right text-sm font-mono text-[var(--color-foreground)]">
              {form.homeHeroOverlayOpacity}
            </span>
          </div>
        </Field>

          <ToggleRow
          label={t('hero.showText')}
          description={t('hero.showTextHelp')}
          checked={form.homeHeroShowText}
          onChange={(v) => set('homeHeroShowText', v)}
        />
      </Section>

      {/* ─── Section 4 — Loading bar ──────────────────────────────────── */}
      <Section icon={<Activity className="w-4 h-4" />} title={t('loading.title')}>
        <p className="text-xs text-[var(--color-muted-foreground)] -mt-2">
          {t('loading.description')}
        </p>

        <Field label={t('loading.style')}>
          <div className="grid grid-cols-2 gap-3">
            <StyleChoice
              active={form.loadingBarStyle === 'gradient'}
              onClick={() => set('loadingBarStyle', 'gradient')}
              title={t('loading.gradient')}
              hint={t('loading.gradientHelp')}
              selectedLabel={t('selected')}
              previewBackground={`linear-gradient(90deg, ${form.loadingBarColors.join(', ')})`}
            />
            <StyleChoice
              active={form.loadingBarStyle === 'solid'}
              onClick={() => set('loadingBarStyle', 'solid')}
              title={t('loading.solid')}
              hint={t('loading.solidHelp')}
              selectedLabel={t('selected')}
              previewBackground={form.primaryColor}
            />
          </div>
        </Field>

        {form.loadingBarStyle === 'gradient' && (
          <>
            <Field
              label={t('loading.stops')}
              hint={t('loading.stopsHelp')}
            >
              <div className="space-y-2">
                {form.loadingBarColors.map((color, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => {
                        const next = [...form.loadingBarColors];
                        next[idx] = e.target.value.toUpperCase();
                        set('loadingBarColors', next);
                      }}
                      className="h-9 w-12 rounded-md border border-[var(--color-border)] bg-transparent cursor-pointer"
                      aria-label={t('loading.colorStop', { number: idx + 1 })}
                    />
                    <input
                      value={color}
                      aria-label={t('loading.hexColorStop', { number: idx + 1 })}
                      onChange={(e) => {
                        const next = [...form.loadingBarColors];
                        next[idx] = e.target.value;
                        set('loadingBarColors', next);
                      }}
                      className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-1.5 text-xs font-mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    {form.loadingBarColors.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = form.loadingBarColors.filter(
                            (_, i) => i !== idx,
                          );
                          set('loadingBarColors', next);
                        }}
                        className="grid place-items-center w-9 h-9 rounded-md text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
                        aria-label={t('loading.removeColor', { number: idx + 1 })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  {form.loadingBarColors.length < 6 && (
                    <button
                      type="button"
                      onClick={() =>
                        set('loadingBarColors', [
                          ...form.loadingBarColors,
                          '#FFFFFF',
                        ])
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('loading.addColor')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      set('loadingBarColors', [...DEFAULT_LOADING_BAR_COLORS])
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> {t('loading.reset')}
                  </button>
                </div>
              </div>
            </Field>

            <Field label={t('loading.preview')}>
              <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] p-6">
                <div
                  className="h-1 rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${form.loadingBarColors.join(', ')}, ${form.loadingBarColors[0]})`,
                    backgroundSize: '300% 100%',
                    animation: 'admin-loading-preview 2.4s linear infinite',
                    boxShadow: '0 0 10px rgba(255,255,255,0.5)',
                  }}
                />
                <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
                  {t('loading.previewHelp')}
                </p>
                <style>{`
                  @keyframes admin-loading-preview {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 200% 50%; }
                  }
                `}</style>
              </div>
            </Field>
          </>
        )}
      </Section>

      {/* ─── Sticky save bar ──────────────────────────────────────────── */}
      {(dirty || justSaved) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {dirty ? t('unsaved') : t('allSaved')}
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
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {pending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}
                  </>
                ) : justSaved && !dirty ? (
                  <>
                    <CheckCircle className="w-4 h-4" /> {t('saved')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> {t('save')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Local presentational helpers
// ─────────────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-5">
      <h2 className="font-bold text-[var(--color-foreground)] flex items-center gap-2">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--color-foreground)]">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}

function StyleChoice({
  active,
  onClick,
  title,
  hint,
  previewBackground,
  selectedLabel,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  previewBackground: string;
  selectedLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'group flex flex-col items-stretch gap-2 rounded-xl border p-3 text-left transition ' +
        (active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--color-border)] hover:border-[var(--color-foreground)]/40')
      }
      aria-pressed={active}
    >
      <span
        className="h-2 rounded-full"
        style={{ background: previewBackground }}
        aria-hidden
      />
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-foreground)]">{title}</span>
        {active && (
          <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--color-primary)]">
            {selectedLabel}
          </span>
        )}
      </span>
      <span className="text-xs text-[var(--color-muted-foreground)]">{hint}</span>
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 cursor-pointer hover:bg-[var(--color-muted)]/40 transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">{label}</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>
      </div>
    </label>
  );
}
