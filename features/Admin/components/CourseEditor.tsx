'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useMemo, useState, useTransition } from 'react';
import {
  X,
  Loader2,
  Plus,
  UserRound,
  ListTree,
  Video,
  BookOpen,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { updateCourse } from '@/features/Courses/actions';
import { ImageUpload } from '@/shared/components/ui/ImageUpload';
import { appToast } from '@/shared/lib/toast';
import { extractYoutubeId } from '@/shared/lib/youtube';
import type { AdminCourse } from '@/features/Admin/actions';
import type { AdminInstructor } from '@/features/Admin/instructors';
import { InstructorDialog } from './InstructorDialog';
import { VideoUpload } from './VideoUpload';

type Props = {
  course: AdminCourse;
  instructors: AdminInstructor[];
  r2Available?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  contentFormat: 'video' | 'ebook';
  shortDescription: string;
  description: string;
  thumbnailLandscapeUrl: string | null;
  thumbnailPortraitUrl: string | null;
  heroBannerUrl: string | null;
  heroOverlayOpacity: number;
  heroShowText: boolean;
  trailerYoutubeId: string;
  trailerR2Key: string | null;
  instructorId: string | null;
  durationMinutes: string;
  isFeatured: boolean;
  isNew: boolean;
  isFree: boolean;
  isComingSoon: boolean;
  certificateEnabled: boolean;
  checkoutUrl: string;
};

function init(course: AdminCourse): FormState {
  return {
    contentFormat: course.contentFormat ?? 'video',
    shortDescription: course.shortDescription ?? '',
    description: course.description ?? '',
    thumbnailLandscapeUrl:
      course.thumbnailLandscapeUrl ?? course.thumbnailUrl ?? null,
    thumbnailPortraitUrl: course.thumbnailPortraitUrl ?? null,
    heroBannerUrl: course.heroBannerUrl ?? null,
    heroOverlayOpacity: course.heroOverlayOpacity ?? 70,
    heroShowText: course.heroShowText ?? true,
    trailerYoutubeId: course.trailerYoutubeId ?? '',
    trailerR2Key: course.trailerR2Key ?? null,
    instructorId: course.instructorId ?? null,
    durationMinutes: course.durationMinutes?.toString() ?? '',
    isFeatured: course.isFeatured,
    isNew: course.isNew,
    isFree: course.isFree,
    isComingSoon: course.isComingSoon,
    certificateEnabled: course.certificateEnabled,
    checkoutUrl: course.checkoutUrl ?? '',
  };
}

export function CourseEditor({
  course,
  instructors,
  r2Available = false,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations('adminContent');
  const baseline = useMemo(() => init(course), [course]);
  const [form, setForm] = useState<FormState>(baseline);
  const [pending, startTransition] = useTransition();
  const [instructorDialog, setInstructorDialog] = useState<
    null | { mode: 'create' } | { mode: 'edit'; instructor: AdminInstructor }
  >(null);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  const selectedInstructor =
    instructors.find((i) => i.id === form.instructorId) ?? null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    // Accept either a bare ID or a full YouTube URL in the trailer field.
    let trailerId = '';
    if (form.trailerYoutubeId.trim()) {
      const parsed = extractYoutubeId(form.trailerYoutubeId);
      if (!parsed) {
        appToast.warning(t('couldNotReadThatYouTubeURLForTheTrailer'));
        return;
      }
      trailerId = parsed;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('id', course.id);
        fd.set('contentFormat', form.contentFormat);
        fd.set('shortDescription', form.shortDescription.trim());
        fd.set('description', form.description.trim());
        fd.set('thumbnailLandscapeUrl', form.thumbnailLandscapeUrl ?? '');
        fd.set('thumbnailPortraitUrl', form.thumbnailPortraitUrl ?? '');
        fd.set('heroBannerUrl', form.heroBannerUrl ?? '');
        fd.set('heroOverlayOpacity', String(form.heroOverlayOpacity));
        fd.set('heroShowText', form.heroShowText ? 'true' : 'false');
        fd.set('trailerYoutubeId', trailerId);
        fd.set('trailerR2Key', form.trailerR2Key ?? '');
        fd.set('instructorId', form.instructorId ?? '');
        fd.set('durationMinutes', form.durationMinutes);
        fd.set('isFeatured', form.isFeatured ? 'true' : 'false');
        fd.set('isNew', form.isNew ? 'true' : 'false');
        fd.set('isFree', form.isFree ? 'true' : 'false');
        fd.set('isComingSoon', form.isComingSoon ? 'true' : 'false');
        fd.set(
          'certificateEnabled',
          form.certificateEnabled ? 'true' : 'false',
        );
        fd.set('checkoutUrl', form.checkoutUrl.trim());

        const result = await updateCourse(fd);
        if (result && 'error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        appToast.success(t('courseSaved'));
        onSaved();
        onClose();
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl rounded-2xl bg-[var(--color-card)] shadow-xl max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <div>
              <h2 className="font-bold text-[var(--color-foreground)]">
                {t('editCourse')}
              </h2>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                {course.title} · /{course.slug}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/content/${course.slug}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
              >
                <ListTree className="w-3.5 h-3.5" />
                {t('manageContent')}{' '}
              </Link>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-[var(--color-muted)]"
                aria-label={t('close')}
              >
                <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ── Course type ── */}
            <Group title={t('courseType')}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormatCard
                  icon={<Video className="w-5 h-5" />}
                  title={t('videoCourse')}
                  description={t(
                    'videoLessonsWithOptionalTrailerDurationAndDownloadableMaterials',
                  )}
                  selected={form.contentFormat === 'video'}
                  onSelect={() => set('contentFormat', 'video')}
                />
                <FormatCard
                  icon={<BookOpen className="w-5 h-5" />}
                  title={t('ebookPDFLibrary')}
                  description={t('bookGridCatalogWhereEachLessonIsAPDF')}
                  selected={form.contentFormat === 'ebook'}
                  onSelect={() => set('contentFormat', 'ebook')}
                />
              </div>
            </Group>

            {/* ── Artwork ── */}
            <Group title={t('artwork')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImageUpload
                  label={t('landscapeThumbnail')}
                  value={form.thumbnailLandscapeUrl}
                  onChange={(url) => set('thumbnailLandscapeUrl', url)}
                  folder={`courses/${course.id}`}
                  aspectRatio="16/9"
                  recommendedSize="1280×720"
                  helpText={t('defaultCardShapeUsedInRowsAndGrids')}
                />
                <ImageUpload
                  label={t('portraitThumbnail')}
                  value={form.thumbnailPortraitUrl}
                  onChange={(url) => set('thumbnailPortraitUrl', url)}
                  folder={`courses/${course.id}`}
                  aspectRatio="2/3"
                  recommendedSize="600×900"
                  helpText={t('cinematicFormatForFeaturedRowsMasterclassStyle')}
                />
              </div>
              <ImageUpload
                label={t('heroBanner')}
                value={form.heroBannerUrl}
                onChange={(url) => set('heroBannerUrl', url)}
                folder={`courses/${course.id}`}
                aspectRatio="21/9"
                recommendedSize="1920×800"
                helpText={t('fullBleedBannerOnTheCourseDetailPage')}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label={t('overlayDarkness')}
                  hint={t('0BannerFullyVisible100HeavyOverlayForLegibility')}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={form.heroOverlayOpacity}
                      onChange={(e) =>
                        set('heroOverlayOpacity', Number(e.target.value))
                      }
                      className="flex-1 accent-[var(--color-primary)]"
                    />
                    <span className="w-10 text-right text-sm font-mono text-[var(--color-foreground)]">
                      {form.heroOverlayOpacity}
                    </span>
                  </div>
                </Field>
                <ToggleRow
                  label={t('showTitleAndSubtitleOverBanner')}
                  description={t(
                    'turnOffWhenTheBannerArtworkAlreadyCommunicatesThe',
                  )}
                  checked={form.heroShowText}
                  onChange={(v) => set('heroShowText', v)}
                />
              </div>
            </Group>

            {/* ── Meta ── */}
            <Group title={t('meta')}>
              <Field
                label={t('shortDescription')}
                hint={t('oneLinerShownOnCardsMax120Chars')}
              >
                <input
                  value={form.shortDescription}
                  onChange={(e) => set('shortDescription', e.target.value)}
                  maxLength={140}
                  placeholder={t('buildNewSkillsIn6Weeks')}
                  className={inputClass}
                />
              </Field>

              <Field
                label={t('fullDescription')}
                hint={t('editorialCopyOnTheCoursePage')}
              >
                <textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={4}
                  placeholder={t('aDetailedDescriptionOfThisCourse')}
                  className={`${inputClass} resize-none`}
                />
              </Field>

              {form.contentFormat === 'video' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                      label={t('trailerYouTubeURL')}
                      hint={t('pasteTheFullURLIDIsExtractedAutomatically')}
                    >
                      <input
                        value={form.trailerYoutubeId}
                        onChange={(e) =>
                          set('trailerYoutubeId', e.target.value)
                        }
                        placeholder="https://youtu.be/dQw4w9WgXcQ"
                        className={`${inputClass} text-xs`}
                      />
                    </Field>
                    <Field
                      label={t('durationMinutes')}
                      hint={t('approximateTotalLength')}
                    >
                      <input
                        type="number"
                        inputMode="numeric"
                        value={form.durationMinutes}
                        onChange={(e) =>
                          set(
                            'durationMinutes',
                            e.target.value.replace(/\D/g, ''),
                          )
                        }
                        placeholder={t('eG320')}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field
                    label={t('trailerR2HoverPreview')}
                    hint={t(
                      'shortMutedPreviewShownOnCatalogCardHoverOverrides',
                    )}
                  >
                    <VideoUpload
                      available={r2Available}
                      scope="course-trailer"
                      scopeId={course.id}
                      existingKey={form.trailerR2Key}
                      onUploaded={(key) => set('trailerR2Key', key)}
                      onRemoved={() => set('trailerR2Key', null)}
                    />
                  </Field>
                </>
              )}

              <Field
                label={t('checkoutURL')}
                hint={t('externalPurchaseLinkForUsersWhoDonTHave')}
              >
                <input
                  type="url"
                  value={form.checkoutUrl}
                  onChange={(e) => set('checkoutUrl', e.target.value)}
                  placeholder="https://pay.hotmart.com/…"
                  className={`${inputClass} font-mono text-xs`}
                />
              </Field>
            </Group>

            {/* ── Instructor ── */}
            <Group
              title={t('instructor')}
              action={
                <button
                  type="button"
                  onClick={() => setInstructorDialog({ mode: 'create' })}
                  className="text-xs font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('new')}{' '}
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-start">
                <select
                  value={form.instructorId ?? ''}
                  onChange={(e) => set('instructorId', e.target.value || null)}
                  className={`${inputClass} min-w-64`}
                >
                  <option value="">{t('noInstructor')}</option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>

                {selectedInstructor ? (
                  <div className="flex items-center gap-3 rounded-xl bg-[var(--color-muted)] p-3">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-[var(--color-border)] flex-shrink-0">
                      {selectedInstructor.portraitUrl ? (
                        <Image
                          src={selectedInstructor.portraitUrl}
                          alt={selectedInstructor.name}
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full">
                          <UserRound className="w-5 h-5 text-[var(--color-muted-foreground)]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                        {selectedInstructor.name}
                      </p>
                      {selectedInstructor.headline && (
                        <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                          {selectedInstructor.headline}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setInstructorDialog({
                          mode: 'edit',
                          instructor: selectedInstructor,
                        })
                      }
                      className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      {t('edit')}{' '}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-muted-foreground)] self-center">
                    {t('pickAnInstructorOrCreateANewOne')}{' '}
                  </p>
                )}
              </div>
            </Group>

            {/* ── Flags ── */}
            <Group title={t('flags')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ToggleRow
                  label={t('featured')}
                  description={t('promotedOnTheHomeHeroAndFeaturedRows')}
                  checked={form.isFeatured}
                  onChange={(v) => set('isFeatured', v)}
                />
                <ToggleRow
                  label={t('new')}
                  description={t('showsANEWBadgeOnCards')}
                  checked={form.isNew}
                  onChange={(v) => set('isNew', v)}
                />
                <ToggleRow
                  label={t('freeCourse')}
                  description={t(
                    'accessibleToAnySignedInUserWithoutPurchaseShows',
                  )}
                  checked={form.isFree}
                  onChange={(v) => set('isFree', v)}
                />
                <ToggleRow
                  label={t('comingSoon')}
                  description={t(
                    'teaseUnreleasedCoursesShowsACLASSIFIEDStampOnCards',
                  )}
                  checked={form.isComingSoon}
                  onChange={(v) => set('isComingSoon', v)}
                />
                <ToggleRow
                  label={t('certificateOnCompletion')}
                  description={t(
                    'studentsWhoFinish100EarnADownloadableCertificateRequires',
                  )}
                  checked={form.certificateEnabled}
                  onChange={(v) => set('certificateEnabled', v)}
                />
              </div>
            </Group>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {dirty ? t('youHaveUnsavedChanges') : t('noChanges')}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              >
                {t('cancel')}{' '}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || pending}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('saveChanges')}{' '}
              </button>
            </div>
          </div>
        </div>
      </div>

      {instructorDialog && (
        <InstructorDialog
          mode={instructorDialog.mode}
          instructor={
            instructorDialog.mode === 'edit'
              ? instructorDialog.instructor
              : null
          }
          onClose={() => setInstructorDialog(null)}
          onSaved={(newId) => {
            if (instructorDialog.mode === 'create' && newId) {
              set('instructorId', newId);
            }
            onSaved();
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]';

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

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

function FormatCard({
  icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-xl border p-4 transition ${
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-2 ring-[var(--color-primary)]/30'
          : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/40'
      }`}
    >
      <div className="flex items-center gap-2 text-[var(--color-foreground)]">
        <span
          className={
            selected
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-muted-foreground)]'
          }
        >
          {icon}
        </span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)] leading-relaxed">
        {description}
      </p>
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 cursor-pointer hover:bg-[var(--color-muted)]/40 transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">
          {label}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {description}
        </p>
      </div>
    </label>
  );
}
