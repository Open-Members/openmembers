import { AlertCircle } from 'lucide-react';

interface AuthErrorBannerProps {
  message: string;
}

// Auth failures use semantic error colours, independent of tenant branding.
export function AuthErrorBanner({ message }: AuthErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-error-surface)] px-4 py-3 text-sm font-medium text-[var(--color-error-text)]"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
