'use client';

import { useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { normalizeHex } from '@/core/theme/contrast';

type Props = {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  presets?: string[];
  helpText?: string;
};

const DEFAULT_PRESETS = [
  '#0235A8', // Primary blue
  '#F20505', // Accent red
  '#111111',
  '#ffffff',
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ec4899', // Pink
];

export function ColorPicker({
  label,
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  helpText,
}: Props) {
  const t = useTranslations('adminOperations.shared.colorPicker');
  const [text, setText] = useState(value);

  function commitText() {
    const normalized = normalizeHex(text, value);
    setText(normalized);
    if (normalized !== value) onChange(normalized);
  }

  function handleNative(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setText(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-[var(--color-foreground)]">
        {label}
      </span>

      <div className="flex items-center gap-2">
        {/* Native color picker — opens system picker on click */}
        <label
          className="relative h-10 w-10 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[var(--color-border)]"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            aria-label={t('open', { label })}
            value={value}
            onChange={handleNative}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>

        <input
          type="text"
          aria-label={t('hex', { label })}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText();
            }
          }}
          className="w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-sm font-mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
          placeholder="#000000"
        />

        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setText(preset);
                onChange(preset);
              }}
              className={[
                'h-7 w-7 rounded-md border transition',
                value.toLowerCase() === preset.toLowerCase()
                  ? 'border-[var(--color-foreground)] ring-2 ring-[var(--color-primary)]/40'
                  : 'border-[var(--color-border)] hover:scale-110',
              ].join(' ')}
              style={{ backgroundColor: preset }}
              aria-label={t('preset', { color: preset })}
            />
          ))}
        </div>
      </div>

      {helpText && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {helpText}
        </p>
      )}
    </div>
  );
}
