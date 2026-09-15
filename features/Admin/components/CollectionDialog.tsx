'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  X,
  Loader2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  BookOpen,
  Plus,
} from 'lucide-react';
import { appToast } from '@/shared/lib/toast';
import {
  createManualCollection,
  updateCollection,
  deleteCollection,
  setManualCollectionCourses,
  listCoursesForPicker,
} from '@/features/Admin/collections';
import type { AdminCollectionRow } from '@/features/Collections/types';

type Mode = 'create' | 'edit';

type PickerCourse = {
  id: string;
  title: string;
  slug: string;
  thumbnail: string | null;
  isPublished: boolean;
};

type Props = {
  mode: Mode;
  collection?: AdminCollectionRow | null;
  /** Pre-loaded current-picks for `edit` mode (manual collections only). */
  initialCourseIds?: string[];
  onClose: () => void;
  onSaved: () => void;
};

export function CollectionDialog({
  mode,
  collection,
  initialCourseIds = [],
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations('adminContent');
  const isManual = mode === 'create' ? true : collection?.rowType === 'manual';
  const isSystem = !!collection?.isSystem;

  const [title, setTitle] = useState(collection?.title ?? '');
  const [subtitle, setSubtitle] = useState(collection?.subtitle ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialCourseIds);
  const [allCourses, setAllCourses] = useState<PickerCourse[]>([]);
  const [search, setSearch] = useState('');
  const [loadingPicker, setLoadingPicker] = useState(isManual);
  const [pickerFailed, setPickerFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!isManual) return;
    let cancelled = false;
    listCoursesForPicker()
      .then((list) => {
        if (!cancelled) setAllCourses(list);
      })
      .catch(() => {
        if (!cancelled) {
          setPickerFailed(true);
          appToast.danger(t('couldNotLoadCoursesReopenTheDialogToRetry'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPicker(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isManual, t]);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCourses
      .filter((c) => !selectedIds.includes(c.id))
      .filter((c) =>
        q ? c.title.toLowerCase().includes(q) || c.slug.includes(q) : true,
      );
  }, [allCourses, selectedIds, search]);

  const selectedCourses = useMemo(
    () =>
      selectedIds
        .map((id) => allCourses.find((c) => c.id === id))
        .filter((c): c is PickerCourse => !!c),
    [selectedIds, allCourses],
  );

  function moveSelected(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= selectedIds.length) return;
    const copy = [...selectedIds];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setSelectedIds(copy);
  }

  function toggleCourse(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSave() {
    if (!title.trim()) {
      appToast.warning(t('titleIsRequired'));
      return;
    }
    startTransition(async () => {
      try {
        if (mode === 'create') {
          const result = await createManualCollection({
            title: title.trim(),
            subtitle: subtitle.trim() || null,
          });
          if ('error' in result && result.error) {
            appToast.danger(contentError(result.error, t));
            return;
          }
          const id = 'data' in result ? result.data?.id : null;
          if (id && selectedIds.length > 0) {
            const r2 = await setManualCollectionCourses(id, selectedIds);
            if ('error' in r2 && r2.error) {
              appToast.danger(contentError(r2.error, t));
              return;
            }
          }
          appToast.success(t('collectionCreated'));
        } else if (collection) {
          const r1 = await updateCollection(collection.id, {
            title: title.trim(),
            subtitle: subtitle.trim() || null,
          });
          if ('error' in r1 && r1.error) {
            appToast.danger(contentError(r1.error, t));
            return;
          }
          if (isManual) {
            const r2 = await setManualCollectionCourses(
              collection.id,
              selectedIds,
            );
            if ('error' in r2 && r2.error) {
              appToast.danger(contentError(r2.error, t));
              return;
            }
          }
          appToast.success(t('collectionUpdated'));
        }
        onSaved();
        onClose();
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function handleDelete() {
    if (!collection) return;
    startTransition(async () => {
      try {
        const result = await deleteCollection(collection.id);
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        appToast.success(t('collectionRemoved'));
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
        className="w-full max-w-3xl rounded-2xl bg-[var(--color-card)] shadow-xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="font-bold text-[var(--color-foreground)]">
              {mode === 'create' ? t('newCollection') : t('editCollection')}
            </h2>
            {isSystem && (
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                {t(
                  'systemRowCoursesAreChosenAutomaticallyTitleSubtitleAre',
                )}{' '}
              </p>
            )}
          </div>
          <button
            aria-label={t('close')}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-muted)]"
          >
            <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t('title')}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('continueWatching')}
                className={inputClass}
              />
            </Field>
            <Field label={t('subtitle')} hint={t('optionalOneLineDescription')}>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder={t('pickUpWhereYouLeftOff')}
                className={inputClass}
              />
            </Field>
          </div>

          {isManual && (
            <>
              <div className="border-t border-[var(--color-border)] pt-5">
                <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-1">
                  {t('coursesInThisRow')}{' '}
                </h3>
                <p className="text-xs text-[var(--color-muted-foreground)] mb-3">
                  {t('useTheArrowsToSetTheOrderStudentsWill')}{' '}
                </p>

                {loadingPicker ? (
                  <p className="text-sm text-[var(--color-muted-foreground)] py-4 text-center">
                    {t('loading')}
                  </p>
                ) : pickerFailed ? (
                  <p
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400 py-4 text-center"
                  >
                    {t('couldNotLoadCoursesReopenTheDialogToRetry')}
                  </p>
                ) : selectedCourses.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-xl">
                    {t('noCoursesYetPickFromTheListBelow')}{' '}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedCourses.map((c, idx) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2"
                      >
                        <div className="flex flex-col shrink-0">
                          <button
                            type="button"
                            aria-label={t('moveUp')}
                            onClick={() => moveSelected(idx, -1)}
                            disabled={idx === 0}
                            className="p-0.5 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('moveDown')}
                            onClick={() => moveSelected(idx, 1)}
                            disabled={idx === selectedCourses.length - 1}
                            className="p-0.5 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <CourseThumb course={c} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                            {c.title}
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)] font-mono truncate">
                            /{c.slug}
                            {!c.isPublished && t('draft2')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleCourse(c.id)}
                          className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                          aria-label={t('removeFromCollection')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--color-border)] pt-5">
                <h3 className="text-sm font-bold text-[var(--color-foreground)] mb-3">
                  {t('availableCourses')}{' '}
                </h3>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('searchCourses')}
                    className={`${inputClass} pl-9`}
                  />
                </div>

                {loadingPicker ||
                pickerFailed ? null : filteredAvailable.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)] py-4 text-center">
                    {t('noCoursesMatch')}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredAvailable.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCourse(c.id)}
                        className="flex items-center gap-3 w-full rounded-xl px-3 py-2 hover:bg-[var(--color-muted)] text-left"
                      >
                        <CourseThumb course={c} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                            {c.title}
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)] font-mono truncate">
                            /{c.slug}
                            {!c.isPublished && t('draft2')}
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-[var(--color-muted-foreground)]" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-muted)]/40">
          {mode === 'edit' && collection && !isSystem ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {t('deleteThisCollection')}{' '}
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
                {t('deleteCollection')}{' '}
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

// ─────────────────────────────────────────────────────────────────────────

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

function CourseThumb({ course }: { course: PickerCourse }) {
  return (
    <div className="relative w-14 h-9 rounded-md overflow-hidden bg-[var(--color-muted)] flex-shrink-0">
      {course.thumbnail ? (
        <Image
          src={course.thumbnail}
          alt={course.title}
          fill
          sizes="56px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full">
          <BookOpen className="w-4 h-4 text-[var(--color-muted-foreground)]" />
        </div>
      )}
    </div>
  );
}
