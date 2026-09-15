'use client';

import { useTranslations, useFormatter } from 'next-intl';

import { useId, useRef, useState } from 'react';
import {
  Upload,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Film,
} from 'lucide-react';
import { MAX_VIDEO_BYTES, VIDEO_MIME_TYPES } from '@/lib/services/r2/upload';

/**
 * Spins up a throwaway <video> element, points it at an ObjectURL for the
 * selected file, and reads duration once metadata loads. Browser does
 * container-level parsing — no bytes are uploaded.
 */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.src = '';
    };
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : null;
      cleanup();
      resolve(d);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = url;
  });
}

interface VideoUploadProps {
  /** Drives the R2 key prefix — lesson video vs. course trailer. */
  scope?: 'lesson' | 'course-trailer';
  /** ID of the owning lesson or course, depending on `scope`. */
  scopeId: string;
  /** Current R2 key, when the target already has a video. */
  existingKey?: string | null;
  /** Fired with the new key once upload completes successfully. */
  onUploaded: (key: string) => void;
  /** Fired when admin clicks "Remove" — parent should clear the external id. */
  onRemoved?: () => void;
  /** Fired with the video's duration in seconds, read from the file metadata. */
  onDurationDetected?: (seconds: number) => void;
  disabled?: boolean;
  available?: boolean;
}

/**
 * Direct browser-to-R2 upload with progress. Asks our /api/r2/upload-url
 * route for a presigned PUT URL, then uploads via XMLHttpRequest to get
 * progress events (fetch doesn't expose upload progress).
 */
export function VideoUpload({
  scope = 'lesson',
  scopeId,
  existingKey,
  onUploaded,
  onRemoved,
  onDurationDetected,
  disabled,
  available = false,
}: VideoUploadProps) {
  const t = useTranslations('adminContent');
  const format = useFormatter();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastUploadedName, setLastUploadedName] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!available || disabled || isUploading) return;
    setError(null);

    if (!(VIDEO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError(t('unsupportedVideo'));
      return;
    }
    if (file.size === 0 || file.size > MAX_VIDEO_BYTES) {
      setError(t('videoSize'));
      return;
    }

    // Best-effort duration read before upload — surfaces the duration field
    // auto-fill before the admin waits 10 minutes for a large upload.
    if (onDurationDetected) {
      readVideoDuration(file)
        .then((seconds) => {
          if (seconds && seconds > 0) onDurationDetected(Math.round(seconds));
        })
        .catch(() => {
          /* non-fatal — duration field just stays manual */
        });
    }

    setIsUploading(true);
    setProgress(0);

    try {
      // 1. Ask the server for a presigned PUT URL.
      const signRes = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope,
          scopeId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!signRes.ok) {
        throw new Error('uploadFailed');
      }
      const { uploadUrl, key } = (await signRes.json()) as {
        uploadUrl: string;
        key: string;
      };

      // 2. PUT the file directly to R2 with progress tracking.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('content-type', file.type);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
        xhr.send(file);
      });

      // 3. Tell the parent the key so it can persist video_external_id.
      setLastUploadedName(file.name);
      setProgress(100);
      onUploaded(key);
    } catch {
      setError(t('errors.uploadFailed'));
      setProgress(null);
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!available || disabled || isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const hasVideo = Boolean(lastUploadedName || existingKey);
  const displayName =
    lastUploadedName ?? (existingKey ? existingKey.split('/').pop() : null);

  return (
    <div className="space-y-3">
      {hasVideo && !isUploading && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Film className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                {displayName}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                <CheckCircle2 className="inline w-3 h-3 mr-1" />
                {t('uploaded')}{' '}
              </p>
            </div>
          </div>
          {onRemoved && (
            <button
              type="button"
              aria-label={t('removeVideo')}
              onClick={() => {
                setLastUploadedName(null);
                setProgress(null);
                onRemoved();
              }}
              disabled={disabled}
              className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-card)] hover:text-[var(--color-foreground)] disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Hidden native file input — drives the picker. Kept outside the
          dropzone so it's addressable both via the surrounding label and
          an explicit click on the browse button below. */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={VIDEO_MIME_TYPES.join(',')}
        className="sr-only"
        disabled={!available || isUploading || disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = ''; // allow re-selecting the same file
        }}
        aria-label={t('uploadVideoFile')}
      />

      {!available && (
        <p
          role="status"
          className="text-sm text-[var(--color-muted-foreground)]"
        >
          {t('videoUploadsAreUnavailableUntilR2StorageIsConfigured')}
        </p>
      )}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          !available || isUploading || disabled
            ? 'border-[var(--color-border)] opacity-60'
            : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-muted)]'
        }`}
      >
        {isUploading ? (
          <div className="space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)] mx-auto" />
            <p className="text-sm font-medium text-[var(--color-foreground)]">
              {t('uploading')}{' '}
              {format.number((progress ?? 0) / 100, { style: 'percent' })}
            </p>
            <div className="mx-auto w-full max-w-xs h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-6 h-6 text-[var(--color-muted-foreground)] mx-auto" />
            <div>
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                {hasVideo
                  ? t('replaceTheCurrentVideo')
                  : t('dragDropAVideoHere')}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                {t('mP4WebMMOVMKVUpTo2GB')}{' '}
              </p>
            </div>
            {/* Explicit browse button. Uses HTMLInputElement.showPicker()
                which is the modern API Chrome/Firefox/Safari expose for
                this exact case — it reliably opens the native dialog even
                when .click() on a hidden input is intercepted by the
                modal's event tree. Falls back to .click() for old Safari. */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const el = inputRef.current;
                if (!el) return;
                if (typeof el.showPicker === 'function') {
                  try {
                    el.showPicker();
                    return;
                  } catch {
                    /* fallthrough to click */
                  }
                }
                el.click();
              }}
              disabled={!available || isUploading || disabled}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                !available || isUploading || disabled
                  ? 'opacity-60 cursor-not-allowed bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                  : 'cursor-pointer text-white hover:brightness-110'
              }`}
              style={
                !available || isUploading || disabled
                  ? undefined
                  : { backgroundColor: 'var(--color-primary)' }
              }
            >
              <Upload className="w-4 h-4" />
              {hasVideo ? t('chooseADifferentFile') : t('chooseFile')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
