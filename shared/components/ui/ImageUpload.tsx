'use client';

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import Image from 'next/image';
import { Upload, X, AlertTriangle, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { createSignedUploadUrlAction } from '@/core/storage/actions';
import { appToast } from '@/shared/lib/toast';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // keep in sync with core/storage/server.ts

type Props = {
  label: string;
  value?: string | null;
  onChange: (url: string | null, path: string | null) => void;
  /** Storage folder prefix, e.g. "branding" or "courses/{id}". */
  folder: string;
  /** CSS aspect-ratio value, e.g. "16/9". Controls preview box shape. */
  aspectRatio?: string;
  /** Human-readable target dimensions, e.g. "1920×1080". */
  recommendedSize?: string;
  /** Soft ratio tolerance (0–1). Defaults to 0.1 (10%). */
  ratioTolerance?: number;
  /** Hint copy under the upload area. */
  helpText?: string;
  accept?: string;
};

function parseRatio(aspectRatio: string | undefined): number | null {
  if (!aspectRatio) return null;
  const [w, h] = aspectRatio.split('/').map((n) => parseFloat(n.trim()));
  if (!w || !h) return null;
  return w / h;
}

const MIME_LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WEBP',
  'image/svg+xml': 'SVG',
  'image/gif': 'GIF',
  'image/x-icon': 'ICO',
  'image/vnd.microsoft.icon': 'ICO',
};

function getAcceptedFormatLabels(accept: string): string {
  const labels = accept
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => MIME_LABELS[value] ?? value.replace(/^\./u, '').toUpperCase());
  return [...new Set(labels)].join(' / ');
}

export function ImageUpload({
  label,
  value,
  onChange,
  folder,
  aspectRatio = '16/9',
  recommendedSize,
  ratioTolerance = 0.1,
  helpText,
  accept = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif',
}: Props) {
  const t = useTranslations('adminOperations.shared.imageUpload');
  const format = useFormatter();
  const acceptedFormats = useMemo(() => getAcceptedFormatLabels(accept), [accept]);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function validateDimensions(file: File): Promise<string | null> {
    const expected = parseRatio(aspectRatio);
    if (!expected || file.type === 'image/svg+xml') return null;

    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const actual = img.width / img.height;
        const drift = Math.abs(actual - expected) / expected;
        if (drift > ratioTolerance) {
          resolve(t('dimensionWarning', {
            width: img.width,
            height: img.height,
            recommended: recommendedSize ?? t('ratio', { ratio: aspectRatio }),
          }));
        } else {
          resolve(null);
        }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(null);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function handleFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      appToast.danger(t('tooLarge', {
        size: format.number(file.size / 1024 / 1024, { maximumFractionDigits: 1 }),
        max: MAX_UPLOAD_BYTES / 1024 / 1024,
      }));
      return;
    }

    startTransition(async () => {
      try {
        setWarning(null);

        const ratioWarning = await validateDimensions(file);
        if (ratioWarning) setWarning(ratioWarning);

        const init = await createSignedUploadUrlAction(
          folder,
          file.name,
          file.type,
          file.size,
        );
        if ('error' in init) {
          appToast.danger(t('errors.initialize'));
          return;
        }

        const res = await fetch(init.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!res.ok) {
          appToast.danger(t('errors.upload'));
          return;
        }

      // A file may still be referenced by saved settings or another record.
      // Only change this form; a later explicit cleanup can remove unused assets.
        onChange(init.publicUrl, init.path);
        appToast.success(t('uploaded'));
      } catch {
        appToast.danger(t('errors.upload'));
      }
    });
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading same file
    if (file) handleFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function remove() {
    if (!value) return;
    onChange(null, null);
    setWarning(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-foreground)]">
          {label}
        </span>
        {recommendedSize && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {recommendedSize}
          </span>
        )}
      </div>

      <div
        role={!value ? 'button' : undefined}
        tabIndex={!value && !pending ? 0 : undefined}
        aria-label={!value ? t('dropArea', { label }) : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !value && !pending && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!value && !pending && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={[
          'relative w-full overflow-hidden rounded-xl border-2 border-dashed transition',
          'bg-[var(--color-muted)]',
          dragging
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
            : 'border-[var(--color-border)]',
          !value && !pending ? 'cursor-pointer hover:border-[var(--color-primary)]' : '',
        ].join(' ')}
        style={{ aspectRatio }}
      >
        {value ? (
          <>
            <Image
              src={value}
              alt={label}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              unoptimized
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove();
              }}
              disabled={pending}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 disabled:opacity-50"
              aria-label={t('remove', { label })}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : pending ? (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
            <span className="sr-only">{t('uploading')}</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
            <Upload className="h-6 w-6 text-[var(--color-muted-foreground)]" />
            <p className="text-sm text-[var(--color-foreground)]">
              {t('dropOrClick')}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {t('formats', {
                formats: acceptedFormats,
                max: MAX_UPLOAD_BYTES / 1024 / 1024,
              })}
            </p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        aria-label={t('file', { label })}
        accept={accept}
        hidden
        onChange={onFileInput}
      />

      {warning && (
        <div role="alert" className="flex items-start gap-2 text-xs text-[var(--color-score-fair)]">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{warning}</span>
        </div>
      )}

      {helpText && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {helpText}
        </p>
      )}
    </div>
  );
}
