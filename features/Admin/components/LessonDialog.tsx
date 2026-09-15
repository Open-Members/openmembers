'use client';

import { useTranslations, useLocale } from 'next-intl';
import { contentError } from '../content-errors';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  X,
  Loader2,
  Trash2,
  Paperclip,
  Upload,
  FileText,
  ShieldCheck,
  Info,
  BookOpen,
} from 'lucide-react';
import {
  createLesson,
  updateLesson,
  deleteLesson,
} from '@/features/Courses/actions';
import {
  listAttachmentsForLesson,
  createMaterialUploadUrlAction,
  finalizeAttachmentAction,
  deleteAttachment,
  type AdminAttachment,
} from '@/features/Admin/attachments';
import { VideoUpload } from './VideoUpload';
import { ImageUpload } from '@/shared/components/ui/ImageUpload';
import { createSignedUploadUrlAction } from '@/core/storage/actions';
import { appToast } from '@/shared/lib/toast';
import { extractYoutubeId } from '@/shared/lib/youtube';
import { extractVimeoEmbed } from '@/shared/lib/vimeo';
import type { AdminLesson } from '@/features/Admin/courseContent';

type VideoSource = 'youtube' | 'vimeo' | 'r2';

/**
 * Renders page 1 of a PDF to a PNG blob (1000px tall, aspect preserved)
 * so we can use it as the ebook cover. Lazy-imports pdfjs-dist so the
 * ~300KB library only ships when the admin actually picks a PDF.
 */
async function renderPdfFirstPageToPng(file: File): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const data = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = 1000 / baseViewport.height;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('Could not export cover PNG');
    return blob;
  } finally {
    await task.destroy();
  }
}

/** Uploads the rendered cover PNG to platform-assets. Returns the public URL. */
async function uploadEbookCover(
  lessonId: string,
  pngBlob: Blob,
): Promise<string> {
  const fileName = `${lessonId}.png`;
  const init = await createSignedUploadUrlAction(
    `ebook-covers/auto/${lessonId}`,
    fileName,
    'image/png',
    pngBlob.size,
  );
  if ('error' in init) throw new Error(init.error);

  const res = await fetch(init.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: pngBlob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return init.publicUrl;
}

type Mode = 'create' | 'edit';

type Props = {
  mode: Mode;
  moduleId: string;
  courseSlug: string;
  /** Course-level format flag. When 'ebook' the dialog collapses into a PDF-first flow: no video/text/duration inputs, and the uploader accepts only PDFs. New ebook lessons default to text while edits preserve the saved content type. */
  courseContentFormat?: 'video' | 'ebook';
  r2Available?: boolean;
  lesson?: AdminLesson | null;
  onClose: () => void;
  onSaved: () => void;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseDurationInput(raw: string): number | null {
  // Accepts "mm:ss", "hh:mm:ss", or plain seconds.
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length > 1 && parts.slice(1).some((n) => n >= 60)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatBytes(bytes: number, locale: string): string {
  const value =
    bytes < 1024
      ? bytes
      : bytes < 1024 * 1024
        ? bytes / 1024
        : bytes / (1024 * 1024);
  const unit = bytes < 1024 ? 'B' : bytes < 1024 * 1024 ? 'KB' : 'MB';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

function formatDurationInput(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function LessonDialog({
  mode,
  moduleId,
  courseSlug,
  courseContentFormat = 'video',
  r2Available = false,
  lesson,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations('adminContent');
  const locale = useLocale();
  const isEbookCourse = courseContentFormat === 'ebook';
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [slug, setSlug] = useState(lesson?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [contentType, setContentType] = useState<'video' | 'text' | 'quiz'>(
    lesson?.contentType ?? (isEbookCourse ? 'text' : 'video'),
  );
  // Provider picker — YouTube / Vimeo embeds or self-hosted via R2.
  const initialProvider: VideoSource =
    lesson?.videoProvider === 'vimeo'
      ? 'vimeo'
      : lesson?.videoProvider === 'r2'
        ? 'r2'
        : 'youtube';
  const [videoSource, setVideoSource] = useState<VideoSource>(initialProvider);
  const [videoUrl, setVideoUrl] = useState(() => {
    if (lesson?.videoProvider === 'vimeo' && lesson.videoExternalId) {
      return lesson.videoHash
        ? `https://vimeo.com/${lesson.videoExternalId}/${lesson.videoHash}`
        : `https://vimeo.com/${lesson.videoExternalId}`;
    }
    if (lesson?.videoProvider === 'r2') return ''; // R2 uses the upload component, not a URL field
    if (lesson?.videoExternalId) return lesson.videoExternalId;
    return lesson?.youtubeVideoId ?? '';
  });
  // R2 key (object path) for self-hosted videos. Lives outside videoUrl because
  // we never present it as text — the upload component writes here on success.
  const [r2Key, setR2Key] = useState<string | null>(
    lesson?.videoProvider === 'r2' ? (lesson.videoExternalId ?? null) : null,
  );
  // In create mode the lesson doesn't exist yet, but we still want uploads to
  // work so the admin doesn't have to save-then-reopen. Generate a draft
  // UUID once per dialog instance — R2 path just needs to be unique and
  // doesn't care whether it matches a real lessons.id.
  const [draftLessonId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [textContent, setTextContent] = useState(lesson?.textContent ?? '');
  const [durationInput, setDurationInput] = useState(
    formatDurationInput(lesson?.durationSeconds ?? null),
  );
  const [isPublished, setIsPublished] = useState(lesson?.isPublished ?? false);
  const [isFreePreview, setIsFreePreview] = useState(
    lesson?.isFreePreview ?? false,
  );
  const [ebookCoverUrl, setEbookCoverUrl] = useState<string | null>(
    lesson?.ebookCoverUrl ?? null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Materials state. createdLessonId lets attachments (which need a real
  // lesson row to FK against) work even in create mode — first upload
  // auto-creates the lesson, subsequent ones reuse that id, and Save
  // switches from "create" to "update" semantics under the hood.
  const [attachments, setAttachments] = useState<AdminAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentsFailed, setAttachmentsFailed] = useState(false);
  const [createdLessonId, setCreatedLessonId] = useState<string | null>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);

  const effectiveLessonId = lesson?.id ?? createdLessonId;

  useEffect(() => {
    if (mode !== 'edit' || !lesson?.id) return;
    let cancelled = false;
    listAttachmentsForLesson(lesson.id)
      .then((list) => {
        if (!cancelled) setAttachments(list);
      })
      .catch(() => {
        if (!cancelled) setAttachmentsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, lesson?.id]);

  async function handleAttachmentUpload(file: File) {
    setUploading(true);
    try {
      // If we don't have a lesson yet (create mode, nothing saved), spin one
      // up with whatever title/slug the admin typed. The rest of the form
      // fields flush through on the user's first Save.
      let lessonId = effectiveLessonId;
      if (!lessonId) {
        if (!title.trim()) {
          appToast.danger(t('enterALessonTitleBeforeAddingMaterials'));
          return;
        }
        const createFd = new FormData();
        createFd.set('moduleId', moduleId);
        createFd.set('title', title.trim());
        createFd.set('slug', (slug || slugify(title)).trim());
        createFd.set('contentType', contentType);
        if (description.trim()) createFd.set('description', description.trim());
        const createResult = await createLesson(createFd);
        if ('error' in createResult && createResult.error) {
          appToast.danger(contentError(createResult.error, t));
          return;
        }
        if (!('data' in createResult) || !createResult.data?.id) {
          appToast.danger(t('failedToCreateLesson'));
          return;
        }
        lessonId = createResult.data.id;
        setCreatedLessonId(lessonId);
      }

      if (!lessonId) return; // defensive — the branch above either sets or returns

      const mime = file.type || 'application/octet-stream';

      // Kick off auto-cover generation in parallel for ebook courses. Only
      // runs when the admin hasn't already set a custom cover — we never
      // overwrite an explicit choice. Failures here are non-fatal: the PDF
      // upload proceeds and the admin can always upload a cover manually.
      const shouldGenerateCover =
        isEbookCourse && mime === 'application/pdf' && !ebookCoverUrl;
      const coverPromise: Promise<string | null> = shouldGenerateCover
        ? (async () => {
            try {
              const png = await renderPdfFirstPageToPng(file);
              return await uploadEbookCover(lessonId, png);
            } catch (e) {
              console.warn('[ebook-cover] auto-generation failed', e);
              appToast.info(t('couldNotAutoGenerateCoverUploadOneManuallyIn'));
              return null;
            }
          })()
        : Promise.resolve(null);

      const init = await createMaterialUploadUrlAction({
        lessonId,
        fileName: file.name,
        mime,
        size: file.size,
      });
      if ('error' in init) {
        appToast.danger(contentError(init.error, t));
        return;
      }

      const putRes = await fetch(init.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!putRes.ok) {
        appToast.danger(t('errors.uploadFailed'));
        return;
      }

      const finalize = await finalizeAttachmentAction({
        lessonId,
        path: init.path,
        fileName: file.name,
        mime,
        size: file.size,
      });
      if ('error' in finalize) {
        appToast.danger(contentError(finalize.error, t));
        return;
      }
      setAttachments((prev) => [...prev, finalize.data]);

      const coverUrl = await coverPromise;
      if (coverUrl) setEbookCoverUrl(coverUrl);
      appToast.success(
        coverUrl ? t('materialUploadedCoverGenerated') : t('materialUploaded'),
      );
    } catch {
      appToast.danger(t('errors.uploadFailed'));
    } finally {
      setUploading(false);
      if (attachFileRef.current) attachFileRef.current.value = '';
    }
  }

  async function handleAttachmentDelete(id: string) {
    try {
      const result = await deleteAttachment(id);
      if ('error' in result && result.error) {
        appToast.danger(contentError(result.error, t));
        return;
      }
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      appToast.danger(t('errors.operationFailed'));
    }
  }
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  function handleSave() {
    if (!title.trim()) {
      appToast.warning(t('titleIsRequired'));
      return;
    }
    if (!slug.trim()) {
      appToast.warning(t('slugIsRequired'));
      return;
    }

    const durationSeconds = parseDurationInput(durationInput);
    if (durationInput.trim() && durationSeconds === null) {
      appToast.warning(t('durationMustBeMmSsHhMmSsOr'));
      return;
    }

    // Resolve provider-specific video fields from the current picker + URL
    let parsedExternalId: string | null = null;
    let parsedHash: string | null = null;
    if (contentType === 'video') {
      if (videoSource === 'r2') {
        // Self-hosted: VideoUpload has already set the R2 key.
        parsedExternalId = r2Key ?? null;
      } else if (videoUrl.trim()) {
        if (videoSource === 'youtube') {
          const id = extractYoutubeId(videoUrl);
          if (!id) {
            appToast.warning(t('couldNotReadThatYouTubeURLPasteAFull'));
            return;
          }
          parsedExternalId = id;
        } else if (videoSource === 'vimeo') {
          const embed = extractVimeoEmbed(videoUrl);
          if (!embed) {
            appToast.warning(t('couldNotReadThatVimeoURLPasteAVimeo'));
            return;
          }
          parsedExternalId = embed.id;
          parsedHash = embed.hash ?? null;
        }
      }
    }

    startTransition(async () => {
      try {
        // If a material upload already auto-created the lesson, the second
        // Save click should update that row instead of inserting a duplicate.
        if (mode === 'create' && !createdLessonId) {
          const fd = new FormData();
          fd.set('moduleId', moduleId);
          fd.set('title', title.trim());
          fd.set('slug', slug.trim());
          fd.set('contentType', contentType);
          if (description.trim()) fd.set('description', description.trim());
          // Legacy field: only populate when YouTube, so older read-paths still work
          if (videoSource === 'youtube' && parsedExternalId)
            fd.set('youtubeVideoId', parsedExternalId);
          if (parsedExternalId) {
            fd.set('videoProvider', videoSource);
            fd.set('videoExternalId', parsedExternalId);
            if (parsedHash) fd.set('videoHash', parsedHash);
          }
          if (textContent.trim()) fd.set('textContent', textContent);
          if (isEbookCourse) fd.set('ebookCoverUrl', ebookCoverUrl ?? '');
          const result = await createLesson(fd);
          if ('error' in result && result.error) {
            appToast.danger(contentError(result.error, t));
            return;
          }
          // If create succeeded and we have duration/publish/preview, push a follow-up update.
          if ('data' in result && result.data?.id) {
            const hasExtras =
              durationSeconds !== null || isPublished || isFreePreview;
            if (hasExtras) {
              const extraFd = new FormData();
              if (durationSeconds !== null)
                extraFd.set('durationSeconds', String(durationSeconds));
              extraFd.set('isPublished', isPublished ? 'true' : 'false');
              extraFd.set('isFreePreview', isFreePreview ? 'true' : 'false');
              const extraResult = await updateLesson(result.data.id, extraFd);
              if ('error' in extraResult) {
                setCreatedLessonId(result.data.id);
                appToast.danger(contentError(extraResult.error, t));
                return;
              }
            }
          }
          appToast.success(t('lessonCreated'));
        } else {
          const fd = new FormData();
          fd.set('title', title.trim());
          fd.set('slug', slug.trim());
          fd.set('contentType', contentType);
          fd.set('description', description.trim());
          // Legacy YouTube field — only written when the picker is YouTube.
          fd.set(
            'youtubeVideoId',
            videoSource === 'youtube' ? (parsedExternalId ?? '') : '',
          );
          fd.set('videoProvider', parsedExternalId ? videoSource : '');
          fd.set('videoExternalId', parsedExternalId ?? '');
          fd.set('videoHash', parsedHash ?? '');
          fd.set('textContent', textContent);
          if (durationSeconds !== null)
            fd.set('durationSeconds', String(durationSeconds));
          fd.set('isPublished', isPublished ? 'true' : 'false');
          fd.set('isFreePreview', isFreePreview ? 'true' : 'false');
          if (isEbookCourse) fd.set('ebookCoverUrl', ebookCoverUrl ?? '');
          // Target: the explicit edit target, or the draft that was auto-created
          // during the session (when the admin uploaded a material in create mode).
          const targetId = lesson?.id ?? createdLessonId;
          if (!targetId) {
            appToast.danger(t('noLessonToUpdate'));
            return;
          }
          const result = await updateLesson(targetId, fd);
          if ('error' in result && result.error) {
            appToast.danger(contentError(result.error, t));
            return;
          }
          appToast.success(t('lessonUpdated'));
        }
        onSaved();
        onClose();
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function handleDelete() {
    if (!lesson) return;
    startTransition(async () => {
      try {
        const result = await deleteLesson(lesson.id);
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        appToast.success(t('lessonRemoved'));
        onSaved();
        onClose();
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-[var(--color-card)] shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-card)] z-10">
          <h2 className="font-bold text-[var(--color-foreground)]">
            {mode === 'create' ? t('newLesson') : t('editLesson')}
          </h2>
          <button
            aria-label={t('close')}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-muted)]"
          >
            <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t('title')}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('eGWelcomeToTheCourse')}
                className={inputClass}
              />
            </Field>
            <Field
              label={t('slug')}
              hint={t('autoGeneratedFromTitleUnlessEdited')}
            >
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="welcome"
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
          </div>

          <Field
            label={t('description')}
            hint={t('shortContextShownOnTheStudentLessonPageWorks')}
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t('whatWillStudentsLearnInThisLesson')}
              className={`${inputClass} resize-none`}
              maxLength={2000}
            />
          </Field>

          {!isEbookCourse && (
            <Field label={t('type')}>
              <div className="flex items-center gap-2 flex-wrap">
                {(['video', 'text', 'quiz'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setContentType(kind)}
                    aria-pressed={contentType === kind}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      contentType === kind
                        ? 'text-white'
                        : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                    }`}
                    style={
                      contentType === kind
                        ? { backgroundColor: 'var(--color-primary)' }
                        : undefined
                    }
                  >
                    {t(kind)}
                  </button>
                ))}
              </div>
              {contentType === 'quiz' &&
                (mode === 'edit' && lesson?.slug ? (
                  <a
                    href={`/admin/content/${courseSlug}/quiz/${lesson.slug}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 w-fit"
                  >
                    {t('editQuizQuestions')}{' '}
                  </a>
                ) : (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {t('saveTheLessonFirstThenEditQuestionsFromThe')}{' '}
                  </p>
                ))}
            </Field>
          )}

          {!isEbookCourse && contentType === 'video' && (
            <>
              <Field label={t('source')}>
                <div className="flex items-center gap-2 flex-wrap">
                  {(['youtube', 'vimeo', 'r2'] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setVideoSource(src)}
                      aria-pressed={videoSource === src}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        videoSource === src
                          ? 'text-white'
                          : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                      }`}
                      style={
                        videoSource === src
                          ? { backgroundColor: 'var(--color-primary)' }
                          : undefined
                      }
                    >
                      {src === 'youtube'
                        ? 'YouTube'
                        : src === 'vimeo'
                          ? 'Vimeo'
                          : t('selfHosted')}
                    </button>
                  ))}
                </div>
              </Field>

              {videoSource === 'r2' ? (
                <Field
                  label={t('videoFile')}
                  hint={t('uploadedDirectlyToR2AdminOnlyStudentsStreamVia')}
                >
                  <VideoUpload
                    available={r2Available}
                    scopeId={effectiveLessonId ?? draftLessonId}
                    existingKey={r2Key}
                    onUploaded={(key) => setR2Key(key)}
                    onRemoved={() => setR2Key(null)}
                    onDurationDetected={(seconds) => {
                      // Only pre-fill if the admin hasn't typed something already.
                      if (!durationInput.trim()) {
                        setDurationInput(formatDurationInput(seconds));
                      }
                    }}
                  />
                </Field>
              ) : (
                <Field
                  label={
                    videoSource === 'youtube' ? t('youTubeURL') : t('vimeoURL')
                  }
                  hint={
                    videoSource === 'youtube'
                      ? t('pasteTheFullURLYoutuBeOrYoutubeCom')
                      : t('pasteTheFullURLVimeoComIDOrVimeo')
                  }
                >
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder={
                      videoSource === 'youtube'
                        ? 'https://youtu.be/dQw4w9WgXcQ'
                        : 'https://vimeo.com/76979871'
                    }
                    className={`${inputClass} text-xs`}
                  />
                </Field>
              )}
            </>
          )}

          {!isEbookCourse && contentType === 'text' && (
            <Field
              label={t('textContent')}
              hint={t('lineBreaksAndBlankLinesArePreserved')}
            >
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={8}
                placeholder={t('lessonContent')}
                className={`${inputClass} resize-none`}
              />
            </Field>
          )}

          {!isEbookCourse && (
            <Field label={t('duration')} hint={t('mmSsHhMmSsOrSecondsEG')}>
              <input
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                placeholder="8:45"
                className={`${inputClass} font-mono text-xs w-32`}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 cursor-pointer hover:bg-[var(--color-muted)]/40">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-semibold text-[var(--color-foreground)]">
                  {t('published')}{' '}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {t('visibleToEnrolledStudentsDraftHidesTheLesson')}{' '}
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 cursor-pointer hover:bg-[var(--color-muted)]/40">
              <input
                type="checkbox"
                checked={isFreePreview}
                onChange={(e) => setIsFreePreview(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-semibold text-[var(--color-foreground)]">
                  {t('freePreview')}{' '}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {t('playableEvenByUsersWhoDonTOwnThe')}{' '}
                </p>
              </div>
            </label>
          </div>

          {/* ── Ebook cover override ──────────────────── */}
          {isEbookCourse && (
            <div className="pt-4 border-t border-[var(--color-border)]">
              <ImageUpload
                label={t('coverImageOptional')}
                value={ebookCoverUrl}
                onChange={(url) => setEbookCoverUrl(url)}
                folder={`ebook-covers/custom/${effectiveLessonId ?? draftLessonId}`}
                aspectRatio="2/3"
                recommendedSize="1000×1500"
                helpText={t('leaveEmptyToUseTheAutoGeneratedCoverFrom')}
              />
            </div>
          )}

          {/* ── Materials / Ebook PDF ─────────────────── */}
          <div className="pt-4 border-t border-[var(--color-border)] space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-foreground)] flex items-center gap-1.5">
                {isEbookCourse ? (
                  <>
                    <BookOpen className="w-3.5 h-3.5" /> {t('ebookPDF')}{' '}
                  </>
                ) : (
                  <>
                    <Paperclip className="w-3.5 h-3.5" /> {t('materials')}{' '}
                  </>
                )}
              </h3>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {isEbookCourse
                  ? t('uploadThePDFStudentsWillReadTheFirstAttached')
                  : t('filesStudentsCanDownloadFromTheMaterialsTabDrag')}
              </p>
            </div>

            {/* Drop-zone: drag files in from OS Finder, OR click "Add file"
                for the native picker. Drag-drop is the reliable path when
                Chrome extensions swallow file-input clicks. */}
            <input
              ref={attachFileRef}
              id="lesson-attach-input"
              type="file"
              aria-label={isEbookCourse ? t('ebookPDF') : t('materials')}
              className="sr-only"
              accept={
                isEbookCourse
                  ? '.pdf'
                  : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,.png,.jpg,.jpeg'
              }
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAttachmentUpload(f);
              }}
            />
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploading) return;
                const f = e.dataTransfer.files?.[0];
                if (f) handleAttachmentUpload(f);
              }}
              className={`rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors ${
                uploading
                  ? 'border-[var(--color-border)] opacity-70'
                  : !effectiveLessonId && !title.trim()
                    ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-500/10 dark:border-yellow-500/40'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-muted)]'
              }`}
            >
              {!effectiveLessonId && !title.trim() ? (
                <div className="space-y-1">
                  <Info className="w-5 h-5 text-yellow-700 dark:text-yellow-300 mx-auto" />
                  <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200">
                    {t('enterALessonTitleFirst')}{' '}
                  </p>
                  <p className="text-xs text-yellow-800 dark:text-yellow-300/80">
                    {t('theMaterialUploaderEnablesOnceTheLessonHasA')}{' '}
                  </p>
                </div>
              ) : (
                <>
                  <Paperclip className="w-5 h-5 text-[var(--color-muted-foreground)] mx-auto mb-2" />
                  <p className="text-sm text-[var(--color-foreground)] mb-2">
                    {t('dragDropAFileHere')}{' '}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const el = attachFileRef.current;
                      if (!el) return;
                      if (typeof el.showPicker === 'function') {
                        try {
                          el.showPicker();
                          return;
                        } catch {
                          /* fallthrough */
                        }
                      }
                      el.click();
                    }}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {uploading ? t('uploading') : t('chooseFile')}
                  </button>
                </>
              )}
            </div>

            {attachmentsFailed ? (
              <p role="alert">{t('errors.loadFailed')}</p>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)] italic">
                {t('noMaterialsAttachedYet')}{' '}
              </p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map((a) => {
                  const isPdf = a.fileType === 'application/pdf';
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2"
                    >
                      <FileText className="w-4 h-4 text-[var(--color-muted-foreground)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                          {a.fileName}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)] mt-0.5">
                          {a.fileSizeBytes !== null && (
                            <span>{formatBytes(a.fileSizeBytes, locale)}</span>
                          )}
                          {isPdf ? (
                            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
                              <ShieldCheck className="w-3 h-3" />{' '}
                              {t('watermarked')}{' '}
                            </span>
                          ) : (
                            <span className="text-[var(--color-muted-foreground)]">
                              {t('unwatermarked')}{' '}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAttachmentDelete(a.id)}
                        className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                        aria-label={t('deleteMaterial')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-muted)]/40">
          {mode === 'edit' && lesson ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {t('deleteThisLesson')}{' '}
                </span>
                <button
                  onClick={handleDelete}
                  disabled={pending}
                  className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-semibold"
                >
                  {t('confirm')}{' '}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                >
                  {t('cancel')}{' '}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('deleteLesson')}{' '}
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              aria-label={t('close')}
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              {t('cancel')}{' '}
            </button>
            <button
              onClick={handleSave}
              disabled={pending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? t('create') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-[var(--color-foreground)]">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}
