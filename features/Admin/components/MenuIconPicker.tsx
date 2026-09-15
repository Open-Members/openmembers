'use client';

import { cn } from '@/shared/lib/utils';
import { useTranslations } from 'next-intl';
import { MENU_ICON_NAMES, type MenuIconName } from '@/features/Navigation/types';
import { MENU_ICON_COMPONENTS } from '@/features/Navigation/components/MenuIcon';

type Props = {
  value: MenuIconName | null;
  onChange: (value: MenuIconName | null) => void;
  label?: string;
};

export function MenuIconPicker({ value, onChange, label }: Props) {
  const t = useTranslations('adminOperations.menu.iconPicker');
  return (
    <div
      role="group"
      aria-label={label ?? t('group')}
      className="grid grid-cols-6 sm:grid-cols-10 gap-1.5"
    >
      <IconButton
        label={t('none')}
        active={value === null}
        onClick={() => onChange(null)}
      >
        <span className="text-xs font-semibold text-[var(--color-muted-foreground)]">
          —
        </span>
      </IconButton>
      {MENU_ICON_NAMES.map((name) => {
        const Icon = MENU_ICON_COMPONENTS[name];
        return (
          <IconButton
            key={name}
            label={t('choose', { name })}
            active={value === name}
            onClick={() => onChange(name)}
          >
            <Icon className="w-4 h-4" />
          </IconButton>
        );
      })}
    </div>
  );
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'aspect-square rounded-lg border flex items-center justify-center transition',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]',
      )}
    >
      {children}
    </button>
  );
}
