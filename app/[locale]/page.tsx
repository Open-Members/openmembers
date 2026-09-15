import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { hasSupabaseConfiguration } from '@/core/config/env';
import { getInstallationConfig } from '@/core/config/installation.server';
import { Link } from '@/core/i18n/routing';
import { createClient } from '@/core/supabase/server';
import { AuthLogo } from '@/features/Auth/components/shared/AuthLogo';
import { SiteFooter } from '@/shared/components/ui/SiteFooter';

export default async function HomePage() {
  const configured = hasSupabaseConfiguration();

  if (configured) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/dashboard');
  }

  const [t, config] = await Promise.all([
    getTranslations('landing.home'),
    getInstallationConfig(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24 focus:outline-none"
      >
        <div className="mb-8"><AuthLogo /></div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-foreground)] sm:text-5xl">
          {config.public.title ?? t('title')}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-muted-foreground)]">
          {config.public.description ?? t('description')}
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--color-primary)] px-6 py-3 font-semibold text-[var(--color-primary-foreground)]"
          >
            {t('login')}
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--color-border)] px-6 py-3 font-semibold text-[var(--color-foreground)]"
          >
            {t('register')}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
