'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  BookOpen,
  Users,
  Layers,
  Star,
  Sparkles,
  UserRound,
  ListTree,
  Gift,
  Clock,
  GripVertical,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';
import { appToast } from '@/shared/lib/toast';
import {
  createCourse,
  deleteCourse,
  toggleCoursePublished,
} from '@/features/Courses/actions';
import type { AdminCourse } from '../actions';
import { getAdminCourses, reorderCourses } from '../actions';
import { getInstructors, type AdminInstructor } from '../instructors';
import { CourseEditor } from './CourseEditor';
import { InstructorDialog } from './InstructorDialog';
import { AdminPageHeader } from './AdminPageHeader';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

function CreateCourseForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('adminContent');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleTitleChange(value: string) {
    setTitle(value);
    setSlug(slugify(value));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('titleIsRequired'));
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('title', title.trim());
        formData.set('slug', slug || slugify(title));
        formData.set('description', description.trim());

        const result = await createCourse(formData);
        if (result && 'error' in result && result.error) {
          setError(contentError(result.error, t));
        } else {
          onCreated();
          onClose();
        }
      } catch {
        setError(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-foreground)]">
            {t('createCourse')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--color-muted)]"
            aria-label={t('close')}
          >
            <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label={t('title')}>
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={t('eGGettingStartedWithMarketing')}
              className={inputClass}
            />
          </Field>

          <Field label={t('slug')}>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t('autoSlug')}
              className={`${inputClass} font-mono`}
            />
          </Field>

          <Field label={t('description')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('aBriefDescriptionOfThisCourse')}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="text-sm text-[var(--color-accent)] font-medium"
            >
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              {t('cancel')}{' '}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-4 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {isPending ? t('creating') : t('createCourse')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InstructorsPanel({
  instructors,
  onClose,
  onChanged,
}: {
  instructors: AdminInstructor[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('adminContent');
  const [dialog, setDialog] = useState<
    null | { mode: 'create' } | { mode: 'edit'; instructor: AdminInstructor }
  >(null);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl rounded-2xl bg-[var(--color-card)] shadow-xl max-h-[80vh] flex flex-col"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <h2 className="font-bold text-[var(--color-foreground)]">
              {t('instructors')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--color-muted)]"
              aria-label={t('close')}
            >
              <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {instructors.length === 0 ? (
              <div className="py-12 text-center">
                <UserRound className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2" />
                <p className="font-semibold text-[var(--color-foreground)]">
                  {t('noInstructorsYet')}
                </p>
                <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                  {t('createOneToAssignToYourCourses')}{' '}
                </p>
              </div>
            ) : (
              instructors.map((ins) => (
                <div
                  key={ins.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3 hover:bg-[var(--color-muted)]/40 transition"
                >
                  <div className="relative w-12 h-12 rounded-full overflow-hidden bg-[var(--color-muted)] flex-shrink-0">
                    {ins.portraitUrl ? (
                      <Image
                        src={ins.portraitUrl}
                        alt={ins.name}
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
                      {ins.name}
                    </p>
                    {ins.headline && (
                      <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                        {ins.headline}
                      </p>
                    )}
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                      {t('courseCount', { count: ins.courseCount })}
                    </p>
                  </div>
                  <button
                    onClick={() => setDialog({ mode: 'edit', instructor: ins })}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                  >
                    {t('edit')}{' '}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-4 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setDialog({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white w-full justify-center"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Plus className="w-4 h-4" /> {t('newInstructor')}{' '}
            </button>
          </div>
        </div>
      </div>

      {dialog && (
        <InstructorDialog
          mode={dialog.mode}
          instructor={dialog.mode === 'edit' ? dialog.instructor : null}
          onClose={() => setDialog(null)}
          onSaved={() => onChanged()}
        />
      )}
    </>
  );
}

export function AdminCourses({
  initialCourses,
  initialInstructors,
  r2Available = false,
}: {
  initialCourses: AdminCourse[];
  initialInstructors: AdminInstructor[];
  r2Available?: boolean;
}) {
  const t = useTranslations('adminContent');
  const [courses, setCourses] = useState<AdminCourse[]>(initialCourses);
  const [instructors, setInstructors] =
    useState<AdminInstructor[]>(initialInstructors);
  const [showCreate, setShowCreate] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AdminCourse | null>(null);
  const [showInstructors, setShowInstructors] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function reload() {
    startTransition(async () => {
      try {
        const [c, i] = await Promise.all([getAdminCourses(), getInstructors()]);
        setCourses(c);
        setInstructors(i);
      } catch {
        appToast.danger(t('errors.loadFailed'));
      }
    });
  }

  function handleTogglePublish(courseId: string) {
    startTransition(async () => {
      try {
        const result = await toggleCoursePublished(courseId);
        if (result?.success) {
          setCourses((prev) =>
            prev.map((course) =>
              course.id === courseId
                ? { ...course, isPublished: result.data!.isPublished }
                : course,
            ),
          );
        } else {
          appToast.danger(contentError(result?.error, t));
        }
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function handleDelete(courseId: string) {
    startTransition(async () => {
      try {
        const result = await deleteCourse(courseId);
        if (result?.success) {
          setCourses((prev) => prev.filter((course) => course.id !== courseId));
          setDeletingId(null);
        } else {
          appToast.danger(contentError(result?.error, t));
        }
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = courses.findIndex((c) => c.id === active.id);
    const newIndex = courses.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = courses;
    const next = arrayMove(courses, oldIndex, newIndex);
    setCourses(next);

    startTransition(async () => {
      try {
        const result = await reorderCourses(next.map((course) => course.id));
        if (result && 'error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          setCourses(previous);
        }
      } catch {
        setCourses(previous);
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div className="max-w-6xl mx-auto w-full">
      <AdminPageHeader
        eyebrow={t('content')}
        title={t('courses')}
        description={t('coursesSummary', {
          courses: courses.length,
          instructors: instructors.length,
        })}
        actions={
          <>
            <button
              onClick={() => setShowInstructors(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-hairline text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
            >
              <UserRound className="w-4 h-4" />
              {t('instructors')}{' '}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Plus className="w-4 h-4" />
              {t('createCourse')}{' '}
            </button>
          </>
        }
      />

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-hairline py-16 text-center">
          <BookOpen className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-3" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-1">
            {t('nothingYet')}{' '}
          </p>
          <p className="font-display text-xl font-medium text-[var(--color-foreground)]">
            {t('noCoursesYet')}{' '}
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-2">
            {t('createYourFirstCourseToGetStarted')}{' '}
          </p>
        </div>
      ) : (
        <DndContext
          id="admin-courses"
          accessibility={{
            screenReaderInstructions: { draggable: t('dragInstructions') },
            announcements: {
              onDragStart: () => t('dragPicked'),
              onDragOver: () => t('dragMoved'),
              onDragEnd: () => t('dragDropped'),
              onDragCancel: () => t('dragCancelled'),
            },
          }}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={courses.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {courses.map((course) => (
                <SortableCourseRow
                  key={course.id}
                  course={course}
                  isPending={isPending}
                  deletingId={deletingId}
                  onEdit={() => setEditingCourse(course)}
                  onTogglePublish={() => handleTogglePublish(course.id)}
                  onDelete={() => handleDelete(course.id)}
                  onRequestDelete={() => setDeletingId(course.id)}
                  onCancelDelete={() => setDeletingId(null)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showCreate && (
        <CreateCourseForm
          onClose={() => setShowCreate(false)}
          onCreated={reload}
        />
      )}

      {editingCourse && (
        <CourseEditor
          r2Available={r2Available}
          course={editingCourse}
          instructors={instructors}
          onClose={() => setEditingCourse(null)}
          onSaved={reload}
        />
      )}

      {showInstructors && (
        <InstructorsPanel
          instructors={instructors}
          onClose={() => setShowInstructors(false)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

// ─── Sortable course row ────────────────────────────────────────────────────

function SortableCourseRow({
  course,
  isPending,
  deletingId,
  onEdit,
  onTogglePublish,
  onDelete,
  onRequestDelete,
  onCancelDelete,
}: {
  course: AdminCourse;
  isPending: boolean;
  deletingId: string | null;
  onEdit: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
}) {
  const t = useTranslations('adminContent');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: course.id });

  const thumb = course.thumbnailLandscapeUrl ?? course.thumbnailUrl;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={`bg-[var(--color-card)] rounded-xl border p-4 transition-colors ${
        isDragging
          ? 'border-[var(--color-primary)] shadow-lg'
          : 'border-hairline hover:border-[color-mix(in_oklab,var(--color-foreground)_18%,transparent)]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          title={t('dragToReorder')}
          aria-label={t('dragToReorder')}
          className="mt-1 p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Thumbnail */}
        <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-[var(--color-muted)] flex-shrink-0">
          {thumb ? (
            <Image
              src={thumb}
              alt={course.title}
              fill
              sizes="128px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <BookOpen className="w-5 h-5 text-[var(--color-muted-foreground)]" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="font-display text-lg font-medium text-[var(--color-foreground)] leading-tight tracking-tight truncate">
              {course.title}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                course.isPublished
                  ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                  : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
              }`}
            >
              {course.isPublished ? t('published') : t('draft')}
            </span>
            {course.isFeatured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] px-2 py-0.5 text-xs font-medium">
                <Star className="w-3 h-3" /> {t('featured')}{' '}
              </span>
            )}
            {course.isNew && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] px-2 py-0.5 text-xs font-medium">
                <Sparkles className="w-3 h-3" /> {t('new')}{' '}
              </span>
            )}
            {course.isFree && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs font-medium">
                <Gift className="w-3 h-3" /> {t('free')}{' '}
              </span>
            )}
            {course.isComingSoon && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
                <Clock className="w-3 h-3" /> {t('comingSoon')}{' '}
              </span>
            )}
            {course.contentFormat === 'ebook' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-400 px-2 py-0.5 text-xs font-medium">
                <BookOpen className="w-3 h-3" /> {t('ebook')}{' '}
              </span>
            )}
          </div>

          {(course.shortDescription || course.description) && (
            <p className="text-sm text-[var(--color-muted-foreground)] mb-2 line-clamp-1">
              {course.shortDescription || course.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)] flex-wrap">
            {course.instructorName && (
              <span className="flex items-center gap-1">
                <UserRound className="w-3.5 h-3.5" />
                {course.instructorName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              {t('moduleCount', { count: course.moduleCount })}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              {t('lessonCount', { count: course.lessonCount })}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {t('enrollmentCount', { count: course.enrollmentCount })}
            </span>
            <span className="font-mono">/{course.slug}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={`/admin/content/${course.slug}`}
            title={t('manageModulesAndLessons')}
            className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            <ListTree className="w-4 h-4" />
          </Link>
          <button
            onClick={onEdit}
            title={t('editCourse')}
            className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onTogglePublish}
            disabled={isPending}
            title={course.isPublished ? t('unpublish') : t('publish')}
            className={`p-2 rounded-lg transition-colors ${
              course.isPublished
                ? 'text-green-600 hover:bg-green-500/10'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
            }`}
          >
            {course.isPublished ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>
          {deletingId === course.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                disabled={isPending}
                className="px-2 py-1 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium"
              >
                {t('confirm')}{' '}
              </button>
              <button
                onClick={onCancelDelete}
                className="px-2 py-1 rounded-lg text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              >
                {t('cancel')}{' '}
              </button>
            </div>
          ) : (
            <button
              onClick={onRequestDelete}
              title={t('deleteCourse')}
              className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Local helpers ──────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}
