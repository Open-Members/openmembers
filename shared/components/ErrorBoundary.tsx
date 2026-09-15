'use client';

import { Component, type ErrorInfo } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

function DefaultErrorFallback({ onRefresh }: { onRefresh: () => void }) {
  const t = useTranslations('system.componentError');

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center">
      <p className="text-lg font-bold text-[var(--color-foreground)]">
        {t('title')}
      </p>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t('description')}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_var(--color-primary-dark)] transition-all active:translate-y-[2px] active:shadow-[0_2px_0_var(--color-primary-dark)]"
      >
        {t('refresh')}
      </button>
    </div>
  );
}

// Next.js signals notFound() and redirect() by *throwing* a control-flow
// error tagged with a `digest`. A catch-all error boundary that swallows
// these would show a generic crash instead of letting Next render the 404
// / perform the redirect — which is exactly how a valid notFound() lesson
// surfaced as "Something went wrong". Detect them so we can rethrow.
function isNextControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== 'string') return false;
  return (
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('NEXT_REDIRECT') ||
    digest.startsWith('NEXT_HTTP_ERROR_FALLBACK')
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    // Let Next's notFound()/redirect() bubble to the framework boundary
    // instead of being caught here and rendered as a generic error.
    if (isNextControlFlowError(error)) throw error;
    return { hasError: true };
  }

  // Surface the real error instead of swallowing it. Without this the
  // fallback renders but nothing reaches the logs, so production crashes
  // are invisible. Logs to the browser console (client) and, during SSR
  // hydration failures, to the server stdout that streams the RSC — which
  // is what we grep in the container logs.
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isNextControlFlowError(error)) return;
    console.error(
      '[ErrorBoundary] caught error:',
      error?.message,
      '\nstack:',
      error?.stack,
      '\ncomponentStack:',
      info?.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <DefaultErrorFallback
          onRefresh={() => {
              this.setState({ hasError: false });
              window.location.reload();
          }}
        />
      );
    }

    return this.props.children;
  }
}
