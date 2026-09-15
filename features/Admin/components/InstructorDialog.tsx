'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useState, useTransition } from 'react';
import { X, Loader2, Trash2 } from 'lucide-react';
import {
  createInstructor,
  updateInstructor,
  deleteInstructor,
  type AdminInstructor,
} from '@/features/Admin/instructors';
import { ImageUpload } from '@/shared/components/ui/ImageUpload';
import { appToast } from '@/shared/lib/toast';

type Mode = 'create' | 'edit';

type Props = {
  mode: Mode;
  instructor?: AdminInstructor | null;
  onClose: () => void;
  onSaved: (id?: string) => void;
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

export function InstructorDialog({
  mode,
  instructor,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations('adminContent');
  const [name, setName] = useState(instructor?.name ?? '');
  const [customSlug, setSlug] = useState(instructor?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [headline, setHeadline] = useState(instructor?.headline ?? '');
  const [portraitUrl, setPortraitUrl] = useState<string | null>(
    instructor?.portraitUrl ?? null,
  );
  const [bio, setBio] = useState(instructor?.bio ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const slug = slugTouched ? customSlug : slugify(name);

  // We need an id to scope storage uploads for a new instructor BEFORE saving.
  // For create, use a temporary 'new' prefix; once saved, the record owns it.
  // For edit, use the instructor's id.
  const storageFolder = `instructors/${instructor?.id ?? 'new'}`;

  function handleSave() {
    if (!name.trim()) {
      appToast.warning(t('nameIsRequired'));
      return;
    }
    startTransition(async () => {
      try {
        const payload = {
          name: name.trim(),
          slug: slug.trim() || undefined,
          headline: headline.trim() || null,
          portraitUrl,
          bio: bio.trim() || null,
        };

        if (mode === 'create') {
          const result = await createInstructor(payload);
          if ('error' in result && result.error) {
            appToast.danger(contentError(result.error, t));
            return;
          }
          appToast.success(t('instructorCreated'));
          onSaved('data' in result ? result.data?.id : undefined);
        } else {
          const result = await updateInstructor(instructor!.id, payload);
          if ('error' in result && result.error) {
            appToast.danger(contentError(result.error, t));
            return;
          }
          appToast.success(t('instructorUpdated'));
          onSaved(instructor?.id);
        }
        onClose();
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function handleDelete() {
    if (!instructor) return;
    startTransition(async () => {
      try {
        const result = await deleteInstructor(instructor.id);
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        appToast.success(t('instructorRemoved'));
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
            {mode === 'create' ? t('newInstructor') : t('editInstructor')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-muted)]"
            aria-label={t('close')}
          >
            <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
            <ImageUpload
              label={t('portrait')}
              value={portraitUrl}
              onChange={(url) => setPortraitUrl(url)}
              folder={storageFolder}
              aspectRatio="4/5"
              recommendedSize="800×1000"
            />

            <div className="space-y-4">
              <Field label={t('name')}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('examples.instructorName')}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </Field>

              <Field
                label={t('slug')}
                hint={t(
                  'uRLFriendlyIdentifierAutoGeneratedFromNameUnlessEdited',
                )}
              >
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder={t('examples.instructorSlug')}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm font-mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </Field>

              <Field
                label={t('headline')}
                hint={t('oneLineTaglineShownUnderTheName')}
              >
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder={t('experiencedCourseInstructor')}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </Field>
            </div>
          </div>

          <Field label={t('bio')} hint={t('shownOnTheInstructorProfilePage')}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              placeholder={t('aShortBiography')}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] resize-none focus:outline-none focus:border-[var(--color-primary)]"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-muted)]/40">
          {mode === 'edit' && instructor ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {t('deletePermanently')}{' '}
                </span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-semibold"
                >
                  {t('confirm')}{' '}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                >
                  {t('cancel')}{' '}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending || instructor.courseCount > 0}
                title={
                  instructor.courseCount > 0
                    ? t('unassignCourses', { count: instructor.courseCount })
                    : undefined
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('delete')}{' '}
              </button>
            )
          ) : (
            <span />
          )}

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
              disabled={pending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'create' ? t('create') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
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
