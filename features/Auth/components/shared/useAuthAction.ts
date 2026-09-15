'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { unstable_rethrow } from 'next/navigation';

// Keep provider and transport details out of the interface. Next's navigation
// exceptions must still reach the framework after a successful Server Action.
export function useAuthAction() {
  const t = useTranslations('auth.errors');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setIsPending(true);
    setErrorCode(null);
    try {
      const result = await action();
      if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') {
        setErrorCode(result.error);
      }
      return result;
    } catch (error) {
      unstable_rethrow(error);
      setErrorCode('unexpected');
    } finally {
      setIsPending(false);
    }
  }

  return {
    error: errorCode ? t(t.has(errorCode) ? errorCode : 'unexpected') : null,
    isPending,
    run,
    setErrorCode,
  };
}
