import { AlertCircle } from 'lucide-react';

interface AuthErrorBannerProps {
  message: string;
}

// Inline error banner for auth form server-action failures. Uses the
// accent/red scale so it stays legible in both light and dark themes.
export function AuthErrorBanner({ message }: AuthErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-accent-50)] px-4 py-3 text-sm font-medium text-[var(--color-accent)]"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
