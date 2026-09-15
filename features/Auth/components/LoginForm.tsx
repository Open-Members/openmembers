'use client';

import { useTranslations } from 'next-intl';
import { useAuthAction } from './shared/useAuthAction';
import { Mail, Lock } from 'lucide-react';
import { Link } from '@/core/i18n/routing';
import {
  AuthInput,
  AuthButton,
  AuthErrorBanner,
} from './shared';
import { signInWithEmail } from '../actions';

export default function LoginForm() {
  const t = useTranslations('auth');
  const { error, isPending, run } = useAuthAction();

  async function handleSubmit(formData: FormData) {
    await run(() => signInWithEmail(formData));
  }

  return (
    <form noValidate action={handleSubmit} className="flex flex-col gap-5">
      {error && <AuthErrorBanner message={error} />}

      <AuthInput
        name="email"
        type="email"
        label={t('fields.email')}
        placeholder={t('fields.emailPlaceholder')}
        autoComplete="email"
        icon={Mail}
      />

      <AuthInput
        name="password"
        type="password"
        label={t('fields.password')}
        placeholder={t('fields.currentPasswordPlaceholder')}
        autoComplete="current-password"
        icon={Lock}
      />

      <div className="flex items-center justify-end">
        <Link
          href="/forgot-password"
          className="text-xs font-semibold text-[var(--color-primary)] transition-opacity hover:opacity-80"
        >
          {t('signIn.forgotPassword')}
        </Link>
      </div>

      <AuthButton isPending={isPending} loadingLabel={t('signIn.pending')}>
        {t('signIn.submit')}
      </AuthButton>

      <p className="text-center text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">
        {t.rich('signIn.inviteHint', {
          reset: (chunks) => (
            <Link
              href="/forgot-password"
              className="font-semibold text-[var(--color-foreground)] hover:text-[var(--color-primary)] transition-colors"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </form>
  );
}
