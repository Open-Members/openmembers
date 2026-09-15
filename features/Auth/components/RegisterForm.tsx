'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthAction } from './shared/useAuthAction';
import { User, Mail, Lock, MailCheck } from 'lucide-react';
import {
  AuthInput,
  AuthButton,
  AuthErrorBanner,
} from './shared';
import { signUpWithEmail } from '../actions';

type RegisterFormProps = {
  /** Acquisition-source label (e.g. "youtube"); validated server-side. */
  source?: string;
  /** Same-site path to land on after email confirmation. */
  next?: string;
  /** Per-video attribution (YouTube video ID); validated server-side. */
  campaign?: string;
  /** Authored CTA override; the default follows the interface language. */
  submitLabel?: string;
};

export default function RegisterForm({
  source,
  next,
  campaign,
  submitLabel,
}: RegisterFormProps) {
  const t = useTranslations('auth');
  const { error, isPending, run } = useAuthAction();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await run(() => signUpWithEmail(formData));
    if (result?.success) setSentTo(result.email);
  }

  // Confirmation step — email verification is required, so we tell the user
  // to check their inbox rather than dropping them on a gated page.
  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            backgroundColor:
              'color-mix(in oklab, var(--color-primary) 14%, transparent)',
            color: 'var(--color-primary)',
          }}
        >
          <MailCheck className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
          {t('signUp.confirmationTitle')}
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t.rich('signUp.confirmationDescription', {
            email: sentTo,
            address: (chunks) => (
              <span className="font-semibold text-[var(--color-foreground)]">{chunks}</span>
            ),
          })}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {t('signUp.confirmationHelp')}
        </p>
      </div>
    );
  }

  return (
    <form noValidate action={handleSubmit} className="flex flex-col gap-5">
      {error && <AuthErrorBanner message={error} />}

      {source && <input type="hidden" name="source" value={source} />}
      {next && <input type="hidden" name="next" value={next} />}
      {campaign && <input type="hidden" name="campaign" value={campaign} />}

      <AuthInput
        name="displayName"
        type="text"
        label={t('fields.fullName')}
        placeholder={t('fields.namePlaceholder')}
        autoComplete="name"
        icon={User}
      />

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
        placeholder={t('fields.newPasswordPlaceholder')}
        autoComplete="new-password"
        icon={Lock}
        minLength={8}
      />

      <AuthButton isPending={isPending} loadingLabel={t('signUp.pending')}>
        {submitLabel ?? t('signUp.submit')}
      </AuthButton>
    </form>
  );
}
