'use client';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  copyEntryBackground,
  type EntryBackground,
  type EntryScreen,
} from '@/core/theme/appearance';
import { ImageUpload } from '@/shared/components/ui/ImageUpload';
import { ColorPicker } from '@/shared/components/ui/ColorPicker';
import { EntryAppearancePreview, type AppearancePreviewIdentity } from './EntryAppearancePreview';

const screens: EntryScreen[] = ['home', 'login', 'register'];
const control =
  'w-full min-h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm';
export function EntryAppearanceEditor({
  screen,
  value,
  backgrounds,
  onChange,
  onBusyChange,
  identity,
  title,
  description,
  disabled,
}: {
  screen: EntryScreen;
  value: EntryBackground;
  backgrounds: Record<EntryScreen, EntryBackground>;
  onChange: (value: EntryBackground) => void;
  onBusyChange: (busy: boolean) => void;
  identity: AppearancePreviewIdentity;
  title: string;
  description: string;
  disabled: boolean;
}) {
  const t = useTranslations('adminOperations.branding.appearance');
  const [copyFrom, setCopyFrom] = useState<EntryScreen | ''>('');
  const [busy, setBusy] = useState(false);
  const uploadBusy = useCallback(
    (value: boolean) => {
      setBusy(value);
      onBusyChange(value);
    },
    [onBusyChange],
  );
  const mode = value?.mode ?? 'current';
  const prefix = `entry-${screen}`;
  return (
    <fieldset
      disabled={disabled || busy}
      className="min-w-0 space-y-5 rounded-2xl border border-[var(--color-border)] p-5"
    >
      <legend className="px-2 text-base font-semibold">{t('screens.' + screen)}</legend>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <label className="block space-y-2" htmlFor={`${prefix}-mode`}>
            <span className="text-sm font-medium">{t('mode')}</span>
            <select
              id={`${prefix}-mode`}
              className={control}
              value={mode}
              onChange={(e) =>
                onChange(
                  e.target.value === 'color'
                    ? { mode: 'color', color: '#101820' }
                    : e.target.value === 'image'
                      ? { mode: 'image', imageUrl: '', position: 'center', overlayOpacity: 70 }
                      : null,
                )
              }
            >
              <option value="current">{t('current')}</option>
              <option value="color">{t('color')}</option>
              <option value="image">{t('image')}</option>
            </select>
          </label>
          {value?.mode === 'color' && (
            <ColorPicker
              label={t('backgroundColor')}
              value={value.color}
              onChange={(color) => onChange({ ...value, color })}
            />
          )}
          {value?.mode === 'image' && (
            <>
              <ImageUpload
                disabled={disabled || busy}
                label={t('upload')}
                folder="branding/backgrounds"
                accept="image/png,image/jpeg,image/webp"
                value={value.imageUrl || null}
                onChange={(url) => onChange(url ? { ...value, imageUrl: url } : null)}
                onPendingChange={uploadBusy}
                recommendedSize="1920×1080"
                helpText={t('uploadHelp')}
              />
              {!value.imageUrl && (
                <p role="status" className="text-xs text-[var(--color-muted-foreground)]">
                  {t('imageRequired')}
                </p>
              )}
              <label className="block space-y-2" htmlFor={`${prefix}-position`}>
                <span className="text-sm">{t('position')}</span>
                <select
                  id={`${prefix}-position`}
                  value={value.position}
                  className={control}
                  onChange={(e) =>
                    onChange({ ...value, position: e.target.value as 'center' | 'top' | 'bottom' })
                  }
                >
                  {(['center', 'top', 'bottom'] as const).map((position) => (
                    <option key={position} value={position}>
                      {t('positions.' + position)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2" htmlFor={`${prefix}-overlay`}>
                <span className="text-sm">
                  {t('overlay')} · {value.overlayOpacity}%
                </span>
                <input
                  id={`${prefix}-overlay`}
                  className="w-full"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value.overlayOpacity}
                  onChange={(e) => onChange({ ...value, overlayOpacity: Number(e.target.value) })}
                />
              </label>
              <p className="text-xs text-[var(--color-muted-foreground)]">{t('overlayHelp')}</p>
            </>
          )}
          <label className="block space-y-2" htmlFor={`${prefix}-copy`}>
            <span className="text-sm">{t('copyFrom')}</span>
            <select
              id={`${prefix}-copy`}
              className={control}
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value as EntryScreen | '')}
            >
              <option value="">{t('choose')}</option>
              {screens
                .filter((item) => item !== screen)
                .map((item) => (
                  <option key={item} value={item}>
                    {t('screens.' + item)}
                  </option>
                ))}
            </select>
          </label>
          <button
            data-brand-button
            type="button"
            disabled={!copyFrom || busy || disabled}
            onClick={() => copyFrom && onChange(copyEntryBackground(backgrounds[copyFrom]))}
            className="min-h-11 rounded-xl border border-[var(--color-border)] px-4 text-sm font-semibold disabled:opacity-50"
          >
            {t('copy')}
          </button>
        </div>
        <EntryAppearancePreview
          screen={screen}
          background={value?.mode === 'image' && !value.imageUrl ? null : value}
          identity={identity}
          title={title}
          description={description}
        />
      </div>
    </fieldset>
  );
}
