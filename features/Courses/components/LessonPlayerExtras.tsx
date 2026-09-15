'use client';

import { Info, Paperclip, MessageCircle, Download, Star, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useAttachmentDownload } from './useAttachmentDownload';
import { CommentSection } from '@/features/Comments';
import { LessonRating } from './LessonRating';
import { sanitizeDescription } from '@/core/security/html-sanitize';
import type { LessonWithProgress } from '../types';

type Props = {
  lesson: LessonWithProgress;
  currentUserId: string;
  isAdmin: boolean;
};

/**
 * Single scrollable panel below the player: description, materials and
 * comments are rendered stacked as three sections. Anchor chips at the
 * top offer a quick scroll-to affordance without hiding content.
 */
export function LessonPlayerExtras({ lesson, currentUserId, isAdmin }: Props) {
  const t = useTranslations('learning.extras');
  const hasDescription = Boolean(
    lesson.description?.trim() ||
      (lesson.contentType !== 'text' ? lesson.textContent?.trim() : null),
  );
  const hasMaterials = lesson.attachments.length > 0;

  return (
    <section className="px-4 md:px-6 lg:px-8 py-6 md:py-10">
      <div className="max-w-5xl mx-auto">
        {/* Quick-jump chips — anchors to the sections below */}
        <nav
          aria-label={t('sections')}
          className="flex flex-wrap items-center gap-2 mb-8 pb-4 border-b border-[var(--color-border)]"
        >
          {hasDescription && (
            <AnchorChip href="#lesson-about" icon={Info} label={t('about')} />
          )}
          {hasMaterials && (
            <AnchorChip
              href="#lesson-materials"
              icon={Paperclip}
              label={t('materials')}
              badge={lesson.attachments.length}
            />
          )}
          <AnchorChip href="#lesson-rating" icon={Star} label={t('rate')} />
          <AnchorChip href="#lesson-comments" icon={MessageCircle} label={t('comments')} />
        </nav>

        <div className="space-y-12">
          {hasDescription && <AboutSection lesson={lesson} />}
          {hasMaterials && <MaterialsSection lesson={lesson} />}
          <LessonRating lessonId={lesson.id} />
          <CommentsSection
            lessonId={lesson.id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </section>
  );
}

function AnchorChip({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-primary)]/40 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge !== undefined && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--color-muted)] text-[10px] font-bold text-[var(--color-foreground)]">
          {badge}
        </span>
      )}
    </a>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  id,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  id?: string;
}) {
  return (
    <header className="flex items-center gap-2 mb-4">
      <Icon className="w-5 h-5 text-[var(--color-primary)]" />
      <h2 id={id} className="text-lg md:text-xl font-bold text-[var(--color-foreground)]">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-2 text-sm font-semibold text-[var(--color-muted-foreground)]">
            ({count})
          </span>
        )}
      </h2>
    </header>
  );
}

// Detect HTML so legacy plain-text descriptions keep their line-break
// rendering — we only swap to dangerouslySetInnerHTML when we see tags.
function looksLikeHtml(s: string): boolean {
  return /<(p|h[1-6]|a|strong|em|b|i|u|ul|ol|li|br|span)\b/i.test(s);
}

function AboutSection({ lesson }: { lesson: LessonWithProgress }) {
  const t = useTranslations('learning.extras');
  // Prefer the explicit description field (works across all content types).
  // Fall back to textContent on non-text lessons for backwards compat —
  // older video/quiz lessons sometimes stashed a blurb there.
  const text =
    lesson.description?.trim() ||
    (lesson.contentType !== 'text' ? lesson.textContent?.trim() : null) ||
    null;

  if (!text) return null;

  const isHtml = looksLikeHtml(text);
  // Tailwind v4 arbitrary-selector styling keeps us off the typography
  // plugin. `break-words` + `[overflow-wrap:anywhere]` stop long URLs
  // (e.g. WhatsApp invite links) from bursting the viewport on mobile.
  const className =
    'text-sm md:text-base text-[var(--color-foreground)] leading-relaxed max-w-3xl ' +
    'break-words [overflow-wrap:anywhere] ' +
    '[&_h3]:font-semibold [&_h3]:text-lg [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:first:mt-0 ' +
    '[&_h2]:font-semibold [&_h2]:text-xl [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:first:mt-0 ' +
    '[&_p]:mb-3 [&_p:last-child]:mb-0 ' +
    '[&_a]:text-[var(--color-primary)] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80 ' +
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 ' +
    '[&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic';

  return (
    <section id="lesson-about" aria-labelledby="lesson-about-title" className="scroll-mt-24">
      <SectionHeader id="lesson-about-title" icon={Info} title={t('aboutLesson')} />
      {isHtml ? (
        <div
          className={className}
          dangerouslySetInnerHTML={{ __html: sanitizeDescription(text) }}
        />
      ) : (
        <div className={`${className} whitespace-pre-wrap`}>{text}</div>
      )}
    </section>
  );
}

function MaterialsSection({ lesson }: { lesson: LessonWithProgress }) {
  const t = useTranslations('learning.extras');
  return (
    <section
      id="lesson-materials"
      aria-labelledby="lesson-materials-title"
      className="scroll-mt-24"
    >
      <SectionHeader id="lesson-materials-title" icon={Paperclip} title={t('materials')} count={lesson.attachments.length} />
      <div className="space-y-2 max-w-3xl">
        {lesson.attachments.map((attachment) => (
          <MaterialDownload key={attachment.id} attachment={attachment} />
        ))}
      </div>
    </section>
  );
}

function MaterialDownload({ attachment }: { attachment: LessonWithProgress['attachments'][number] }) {
  const t = useTranslations('learning.extras');
  const format = useFormatter();
  const { isLoading, download } = useAttachmentDownload(attachment);
  const bytes = attachment.fileSizeBytes;
  const size = bytes === null || bytes === undefined ? null : bytes < 1024
    ? `${format.number(bytes)} B`
    : bytes < 1024 * 1024
      ? `${format.number(bytes / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`
      : `${format.number(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={isLoading}
      aria-label={t(isLoading ? 'downloading' : 'download', { fileName: attachment.fileName })}
      className="w-full text-left flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 hover:bg-[var(--color-muted)] transition disabled:opacity-60"
    >
      <Paperclip className="w-4 h-4 text-[var(--color-muted-foreground)] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">{attachment.fileName}</p>
        {size !== null && <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{size}</p>}
      </div>
      {isLoading
        ? <Loader2 className="w-4 h-4 animate-spin text-[var(--color-muted-foreground)] shrink-0" />
        : <Download className="w-4 h-4 text-[var(--color-muted-foreground)] shrink-0" />}
    </button>
  );
}

function CommentsSection({
  lessonId,
  currentUserId,
  isAdmin,
}: {
  lessonId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  return (
    <section id="lesson-comments" aria-labelledby="lesson-comments-title" className="scroll-mt-24">
      <CommentSection
        lessonId={lessonId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </section>
  );
}
