'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { appToast } from '@/shared/lib/toast';
import { ArrowLeft, Download, BookOpen, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { setLessonCompleted } from '@/features/Progress/actions';
import { useAttachmentDownload } from './useAttachmentDownload';

type LessonSummary = {
  id: string;
  slug: string;
  title: string;
  isCompleted?: boolean;
};

type ModuleSummary = {
  id: string;
  title: string;
  lessons: LessonSummary[];
};

type Props = {
  course: {
    slug: string;
    title: string;
  };
  lesson: {
    id: string;
    title: string;
    description?: string;
    isCompleted: boolean;
  };
  attachment: {
    id: string;
    fileName: string;
    fileSizeBytes?: number;
  } | null;
  modules: ModuleSummary[];
};

export function EbookReader({ course, lesson, attachment, modules }: Props) {
  const t = useTranslations('learningMedia.reader');
  const [completed, setCompleted] = useState(lesson.isCompleted);
  const [marking, setMarking] = useState(false);

  const { isLoading: isDownloading, download } = useAttachmentDownload({
    id: attachment?.id ?? '',
    fileName: attachment?.fileName ?? 'ebook.pdf',
  });

  async function handleMarkRead() {
    if (completed || marking) return;
    setMarking(true);
    try {
      const result = await setLessonCompleted(lesson.id, true);
      if (result.error) {
        appToast.danger(t('saveFailedTitle'), t('saveFailed'));
        return;
      }
      setCompleted(true);
    } catch {
      appToast.danger(t('saveFailedTitle'), t('saveFailed'));
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#0b0a12]">
      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0b0a12]/90 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3">
          <Link
            href={`/courses/${course.slug}`}
            className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{course.title}</span>
            <span className="sm:hidden">{t('library')}</span>
          </Link>

          <div className="flex items-center gap-2">
            {attachment && (
              <button
                type="button"
                onClick={download}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-white bg-[var(--color-primary)] hover:brightness-110 transition-all disabled:opacity-70 disabled:cursor-wait"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isDownloading ? t('preparing') : t('download')}
              </button>
            )}
            <button
              onClick={handleMarkRead}
              disabled={completed || marking}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs md:text-sm font-semibold transition-colors ${
                completed
                  ? 'bg-emerald-500/15 text-emerald-300 cursor-default'
                  : 'bg-[var(--color-primary)] text-white hover:brightness-110'
              }`}
            >
              {completed ? t('read') : marking ? t('saving') : t('markRead')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body: reader + library sidebar ───────────────── */}
      <div className="grid md:grid-cols-[1fr_320px] gap-0">
        <div className="min-h-[70vh] md:min-h-[calc(100dvh-57px)]">
          <div className="px-4 md:px-6 pt-6 pb-4 max-w-4xl mx-auto">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50 mb-2 inline-flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" />
              {t('ebook')}
            </p>
            <h1 className="font-display text-2xl md:text-3xl font-medium text-white leading-tight tracking-tight">
              {lesson.title}
            </h1>
            {lesson.description && (
              <p className="mt-3 text-sm md:text-base text-white/65 leading-relaxed max-w-2xl">
                {lesson.description}
              </p>
            )}
          </div>

          <div className="px-4 md:px-6 pb-8">
            {attachment ? (
              <>
                {/* ── Mobile: iframe PDF viewers are broken on iOS Safari
                       and most Android browsers, so we surface a big
                       download CTA instead of a blank frame. ────────── */}
                <div className="md:hidden">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)]/15 flex items-center justify-center">
                      <FileText className="w-8 h-8 text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-base leading-tight">
                        {attachment.fileName}
                      </p>
                      <p className="mt-1 text-xs text-white/55">
                        {isDownloading
                          ? t('preparingHelp')
                          : t('mobileHelp')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={download}
                      disabled={isDownloading}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white bg-[var(--color-primary)] hover:brightness-110 active:brightness-95 transition-all disabled:opacity-80 disabled:cursor-wait"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {isDownloading ? t('preparing') : t('downloadPdf')}
                    </button>
                  </div>
                </div>

                {/* ── Desktop: keep the inline reader. ──────────────── */}
                <div className="hidden md:block">
                  <div className="rounded-lg overflow-hidden border border-white/10 bg-black">
                    <DesktopPdf attachmentId={attachment.id} title={lesson.title} />
                  </div>
                  <p className="mt-3 text-xs text-white/45 text-center">
                    {t.rich('desktopHelp', { download: (chunks) => <span className="text-white/70 font-medium">{chunks}</span> })}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-white/10 p-8 text-center text-white/60">
                {t('noPdf')}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar: library of other ebooks ───────────── */}
        <aside className="hidden md:block border-l border-white/10 bg-black/30 min-h-[calc(100dvh-57px)] p-5 overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50 mb-4">
            {t('inLibrary')}
          </p>
          <div className="flex flex-col gap-6">
            {modules.map((mod) => (
              <div key={mod.id}>
                <p className="text-xs font-semibold text-white/80 mb-2">
                  {mod.title}
                </p>
                <ul className="flex flex-col gap-1">
                  {mod.lessons.map((l) => {
                    const active = l.id === lesson.id;
                    return (
                      <li key={l.id}>
                        <Link
                          href={`/courses/${course.slug}/${l.slug}`}
                          prefetch={false}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            active
                              ? 'bg-white/10 text-white'
                              : 'text-white/65 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 shrink-0 ${active ? 'opacity-100' : 'opacity-30'}`}
                          />
                          <span className="line-clamp-2">{l.title}</span>
                          {l.isCompleted && (
                            <span className="ml-auto text-emerald-400 text-xs">✓</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

const desktopQuery = '(min-width: 768px)';
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function isDesktop() { return window.matchMedia(desktopQuery).matches; }
function serverDesktop() { return false; }

function DesktopPdf(props: { attachmentId: string; title: string }) {
  // Hiding an iframe with CSS does not stop mobile browsers downloading PDFs.
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, serverDesktop);
  return desktop ? <InlinePdf key={props.attachmentId} {...props} /> : null;
}

/** Load the bytes first so an API error cannot become raw text inside the reader. */
function InlinePdf({ attachmentId, title }: { attachmentId: string; title: string }) {
  const t = useTranslations('learningMedia.reader');
  const [pdf, setPdf] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}?inline=1`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') {
          throw new Error('Invalid PDF response');
        }
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdf({ url: objectUrl, failed: false });
      } catch {
        if (!cancelled) setPdf({ url: null, failed: true });
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (pdf.failed) {
    return <p role="alert" className="p-8 text-center text-sm text-white/70">{t('loadFailed')}</p>;
  }
  if (!pdf.url) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t('loading')}
      </p>
    );
  }
  return <iframe src={pdf.url} title={title} className="w-full h-[75vh] md:h-[calc(100dvh-220px)]" />;
}
