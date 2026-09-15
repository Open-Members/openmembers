'use client';

import { useTranslations } from 'next-intl';
import { useAuthAction } from './shared/useAuthAction';
import { Lock } from 'lucide-react';
import {
  AuthInput,
  AuthButton,
  AuthErrorBanner,
} from './shared';
import { updatePassword } from '../actions';

export default function ResetPasswordForm() {
  const t = useTranslations('auth');
  const { error, isPending, run, setErrorCode } = useAuthAction();

  async function handleSubmit(formData: FormData) {
    if (formData.get('password') !== formData.get('confirmPassword')) {
      setErrorCode('passwordMismatch');
      return;
    }
    await run(() => updatePassword(formData));
  }

  return (
    <form noValidate action={handleSubmit} className="flex flex-col gap-5">
      {error && <AuthErrorBanner message={error} />}

      <AuthInput
        name="password"
        type="password"
        label={t('fields.newPassword')}
        placeholder={t('fields.newPasswordPlaceholder')}
        autoComplete="new-password"
        icon={Lock}
        minLength={8}
      />

      <AuthInput
        name="confirmPassword"
        type="password"
        label={t('fields.confirmPassword')}
        placeholder={t('fields.confirmPasswordPlaceholder')}
        autoComplete="new-password"
        icon={Lock}
        minLength={8}
      />

      <AuthButton isPending={isPending} loadingLabel={t('reset.pending')}>
        {t('reset.submit')}
      </AuthButton>
    </form>
  );
}
