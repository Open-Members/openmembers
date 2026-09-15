/**
 * Toast helpers — wraps HeroUI's `toast()` with convenience shortcuts.
 *
 * Usage:
 *   import { appToast } from '@/shared/lib/toast';
 *   appToast.success('Settings saved');
 *   appToast.error('Something went wrong');
 */

import type { ReactNode } from 'react';
import { toast } from '@heroui/react';

export const appToast = {
  /** Generic success — green check */
  success(message: ReactNode, description?: ReactNode) {
    return toast.success(message, {
      description,
      timeout: 3000,
    });
  },

  /** Error — red accent */
  danger(message: ReactNode, description?: ReactNode) {
    return toast.danger(message, {
      description,
      timeout: 4000,
    });
  },

  /** Info — blue accent */
  info(message: ReactNode, description?: ReactNode) {
    return toast.info(message, {
      description,
      timeout: 3500,
    });
  },

  /** Warning — amber */
  warning(message: ReactNode, description?: ReactNode) {
    return toast.warning(message, {
      description,
      timeout: 4000,
    });
  },

  /** Async promise wrapper (e.g. saving settings) */
  promise<T>(
    promise: Promise<T> | (() => Promise<T>),
    opts: { loading: ReactNode; success: ReactNode; error: ReactNode },
  ) {
    return toast.promise(promise, {
      loading: opts.loading,
      success: opts.success,
      error: opts.error,
    });
  },
};
