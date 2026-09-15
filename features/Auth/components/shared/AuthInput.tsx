'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';

interface AuthInputProps {
  name: string;
  type?: 'email' | 'password' | 'text';
  label: string;
  placeholder?: string;
  autoComplete?: string;
  icon?: LucideIcon;
  required?: boolean;
  defaultValue?: string;
  minLength?: number;
}

export function AuthInput({
  name,
  type = 'text',
  label,
  placeholder,
  autoComplete,
  icon: Icon,
  required = true,
  defaultValue,
  minLength,
}: AuthInputProps) {
  const t = useTranslations('auth.shared');
  const id = useId();
  const [isVisible, setIsVisible] = useState(false);
  const isPassword = type === 'password';
  const actualType = isPassword && isVisible ? 'text' : type;

  return (
    <div className="flex flex-col">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]"
      >
        {label}
      </label>
      <div
        className="group mt-2 flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-150 focus-within:border-[var(--color-primary)]"
        style={{
          background:
            'color-mix(in oklab, var(--color-foreground) 3%, transparent)',
          borderColor:
            'color-mix(in oklab, var(--color-foreground) 10%, transparent)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
        }}
      >
        {Icon && (
          <Icon
            size={16}
            className="shrink-0 text-[var(--color-muted-foreground)] transition-colors group-focus-within:text-[var(--color-primary)]"
            strokeWidth={1.75}
          />
        )}
        <input
          id={id}
          name={name}
          type={actualType}
          placeholder={placeholder}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          required={required}
          minLength={minLength}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/70 focus:outline-none focus-visible:outline-none"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            className="shrink-0 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            aria-label={t(isVisible ? 'hidePassword' : 'showPassword')}
            aria-controls={id}
            aria-pressed={isVisible}
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}
