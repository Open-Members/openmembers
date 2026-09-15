'use client';

import { ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthAction } from './shared/useAuthAction';
import { AuthErrorBanner } from './shared/AuthErrorBanner';
import { signOutAndNavigate } from './shared/signOut';

export function SuspendedNotice({ contactUrl }: { contactUrl: string | null }) {
  const t = useTranslations('auth.suspended');
  const { error, isPending, run } = useAuthAction();

  async function handleSignOut() {
    await run(signOutAndNavigate);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-[var(--color-background)] p-6 py-12">
      <div className="max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-muted)]">
            <ShieldOff className="h-10 w-10 text-[var(--color-muted-foreground)]" />
          </div>
        </div>

        <h1 className="mb-3 text-2xl font-black text-[var(--color-foreground)]">{t('title')}</h1>
        <p className="mb-6 text-sm leading-relaxed text-[var(--color-muted-foreground)]">{t('description')}</p>
        {contactUrl && (
          <a href={contactUrl} className="mb-6 inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] underline underline-offset-4">
            {t('contact')}
          </a>
        )}
        {error && <div className="mb-4"><AuthErrorBanner message={error} /></div>}
        <div>
          <button
            onClick={handleSignOut}
            disabled={isPending}
            className="min-h-11 rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90"
          >
            {t(isPending ? 'signingOut' : 'signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
