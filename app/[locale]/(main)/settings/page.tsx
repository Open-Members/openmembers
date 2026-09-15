import { getTranslations } from 'next-intl/server';
import { SettingsPage } from '@/features/Settings/components/SettingsPage';

export default async function Settings() {
  const t = await getTranslations('settings.page');

  return (
    <div className="flex flex-col gap-10 md:gap-14 px-4 md:px-8 lg:px-12 py-8 md:py-12 pb-20">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
          {t('eyebrow')}
        </p>
        <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-medium leading-tight tracking-tight text-[var(--color-foreground)]">
          {t('heading')}
        </h1>
        <p className="text-sm md:text-base text-[var(--color-muted-foreground)] max-w-xl">
          {t('description')}
        </p>
      </header>

      <SettingsPage />
    </div>
  );
}
