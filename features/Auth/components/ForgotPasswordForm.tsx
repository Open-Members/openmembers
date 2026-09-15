'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthAction } from './shared/useAuthAction';
import { Mail, CheckCircle } from 'lucide-react';
import {
  AuthInput,
  AuthButton,
  AuthErrorBanner,
} from './shared';
import { requestPasswordReset } from '../actions';

export default function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const { error, isPending, run } = useAuthAction();
  const [sent, setSent] = useState(false);

  async function handleSubmit(formData: FormData) {
    const result = await run(() => requestPasswordReset(formData));
    if (result?.success) setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-full"
          style={{
            background:
              'color-mix(in oklab, var(--color-score-excellent) 16%, transparent)',
          }}
        >
          <CheckCircle
            className="size-7 text-[var(--color-score-excellent)]"
            strokeWidth={1.75}
          />
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
          {t('recovery.confirmationTitle')}
        </h2>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--color-muted-foreground)]">
          {t('recovery.confirmationDescription')}
        </p>
      </div>
    );
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

      <AuthButton isPending={isPending} loadingLabel={t('recovery.pending')}>
        {t('recovery.submit')}
      </AuthButton>
    </form>
  );
}
