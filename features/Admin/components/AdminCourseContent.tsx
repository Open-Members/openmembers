'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Pencil,
  ArrowUp,
  ArrowDown,
  Video,
  FileText,
  HelpCircle,
  Eye,
  EyeOff,
  Clock,
  Unlock,
  Layers,
} from 'lucide-react';
import { reorderModules, reorderLessons } from '@/features/Courses/actions';
import { getCourseContent } from '@/features/Admin/courseContent';
import type {
  AdminCourseContent as AdminCourseContentData,
  AdminModule,
  AdminLesson,
} from '@/features/Admin/courseContent';
import { ModuleDialog } from './ModuleDialog';
import { LessonDialog } from './LessonDialog';
import { AdminPageHeader } from './AdminPageHeader';
import { CourseCohorts } from './CourseCohorts';
import { appToast } from '@/shared/lib/toast';

type Props = {
  initialData: AdminCourseContentData;
  r2Available?: boolean;
};

export function AdminCourseContent({
  initialData,
  r2Available = false,
}: Props) {
  const t = useTranslations('adminContent');
  const [data, setData] = useState<AdminCourseContentData>(initialData);
  const [moduleDialog, setModuleDialog] = useState<
    null | { mode: 'create' } | { mode: 'edit'; module: AdminModule }
  >(null);
  const [lessonDialog, setLessonDialog] = useState<
    | null
    | { mode: 'create'; moduleId: string }
    | { mode: 'edit'; moduleId: string; lesson: AdminLesson }
  >(null);
  const [pending, startTransition] = useTransition();

  const { course, modules } = data;

  function reload() {
    startTransition(async () => {
      try {
        const fresh = await getCourseContent(course.slug);
        if (!fresh) {
          appToast.danger(t('errors.notFound'));
          return;
        }
        setData(fresh);
      } catch {
        appToast.danger(t('errors.loadFailed'));
      }
    });
  }

  function moveModule(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= modules.length) return;
    const previous = data;
    const newOrder = [...modules];
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    // Optimistic update
    setData({ ...data, modules: newOrder });
    startTransition(async () => {
      try {
        const result = await reorderModules(
          course.id,
          newOrder.map((module) => module.id),
        );
        if ('error' in result && result.error) {
          setData(previous);
          appToast.danger(contentError(result.error, t));
        }
      } catch {
        setData(previous);
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function moveLesson(moduleId: string, lessonIdx: number, direction: -1 | 1) {
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod) return;
    const target = lessonIdx + direction;
    if (target < 0 || target >= mod.lessons.length) return;
    const previous = data;
    const newLessons = [...mod.lessons];
    [newLessons[lessonIdx], newLessons[target]] = [
      newLessons[target],
      newLessons[lessonIdx],
    ];
    setData({
      ...data,
      modules: modules.map((m) =>
        m.id === moduleId ? { ...m, lessons: newLessons } : m,
      ),
    });
    startTransition(async () => {
      try {
        const result = await reorderLessons(
          moduleId,
          newLessons.map((lesson) => lesson.id),
        );
        if ('error' in result && result.error) {
          setData(previous);
          appToast.danger(contentError(result.error, t));
        }
      } catch {
        setData(previous);
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full pb-16">
      {/* Breadcrumb */}
      <Link
        href="/admin/content"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('courses')}{' '}
      </Link>

      <AdminPageHeader
        eyebrow={`${t('content')} · /${course.slug} · ${course.isPublished ? t('published') : t('draft')}`}
        title={course.title}
        description={t('addModulesReorderThemAndDropLessonsInsideThe')}
        actions={
          <button
            type="button"
            onClick={() => setModuleDialog({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Plus className="w-4 h-4" />
            {t('addModule')}{' '}
          </button>
        }
      />

      {/* Modules */}
      {modules.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] py-16 text-center">
          <Layers className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2" />
          <p className="font-semibold text-[var(--color-foreground)]">
            {t('noModulesYet')}{' '}
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            {t('addAModuleToStartStructuringTheCourse')}{' '}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {modules.map((mod, mIdx) => (
            <section
              key={mod.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden"
            >
              {/* Module header */}
              <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    onClick={() => moveModule(mIdx, -1)}
                    disabled={pending || mIdx === 0}
                    className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={t('moveModuleUp')}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveModule(mIdx, 1)}
                    disabled={pending || mIdx === modules.length - 1}
                    className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={t('moveModuleDown')}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                      {t('module')} {String(mIdx + 1).padStart(2, '0')}
                    </span>
                    {mod.isPublished ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs font-semibold">
                        <Eye className="w-3 h-3" />
                        {t('published')}{' '}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 text-xs font-semibold">
                        <EyeOff className="w-3 h-3" />
                        {t('draft')}{' '}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base md:text-lg font-bold text-[var(--color-foreground)] mt-0.5">
                    {mod.title}
                  </h2>
                  {mod.description && (
                    <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                      {mod.description}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setModuleDialog({ mode: 'edit', module: mod })}
                  className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
                  aria-label={t('editModule')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>

              {/* Lessons */}
              <div className="divide-y divide-[var(--color-border)]">
                {mod.lessons.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-[var(--color-muted-foreground)]">
                    {t('noLessonsYet')}{' '}
                  </div>
                ) : (
                  mod.lessons.map((lesson, lIdx) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      index={lIdx}
                      total={mod.lessons.length}
                      pending={pending}
                      onMoveUp={() => moveLesson(mod.id, lIdx, -1)}
                      onMoveDown={() => moveLesson(mod.id, lIdx, 1)}
                      onEdit={() =>
                        setLessonDialog({
                          mode: 'edit',
                          moduleId: mod.id,
                          lesson,
                        })
                      }
                    />
                  ))
                )}
              </div>

              {/* Add lesson */}
              <div className="px-5 py-3 bg-[var(--color-muted)]/20">
                <button
                  type="button"
                  onClick={() =>
                    setLessonDialog({ mode: 'create', moduleId: mod.id })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('addLesson')}{' '}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Turmas — per-course cohorts */}
      <CourseCohorts courseId={course.id} courseTitle={course.title} />

      {/* Dialogs */}
      {moduleDialog && (
        <ModuleDialog
          mode={moduleDialog.mode}
          courseId={course.id}
          module={moduleDialog.mode === 'edit' ? moduleDialog.module : null}
          onClose={() => setModuleDialog(null)}
          onSaved={reload}
        />
      )}
      {lessonDialog && (
        <LessonDialog
          r2Available={r2Available}
          mode={lessonDialog.mode}
          moduleId={lessonDialog.moduleId}
          courseSlug={course.slug}
          courseContentFormat={course.contentFormat}
          lesson={lessonDialog.mode === 'edit' ? lessonDialog.lesson : null}
          onClose={() => setLessonDialog(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

// ─── LessonRow ──────────────────────────────────────────────────────────────

function LessonRow({
  lesson,
  index,
  total,
  pending,
  onMoveUp,
  onMoveDown,
  onEdit,
}: {
  lesson: AdminLesson;
  index: number;
  total: number;
  pending: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations('adminContent');
  const TypeIcon =
    lesson.contentType === 'video'
      ? Video
      : lesson.contentType === 'text'
        ? FileText
        : HelpCircle;

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-muted)]/30 transition">
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={pending || index === 0}
          className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={t('moveLessonUp')}
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={pending || index === total - 1}
          className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={t('moveLessonDown')}
        >
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>

      <span className="text-xs font-mono font-bold text-[var(--color-muted-foreground)] w-6 text-right">
        {String(index + 1).padStart(2, '0')}
      </span>

      <TypeIcon className="w-4 h-4 text-[var(--color-muted-foreground)] shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
          {lesson.title}
        </p>
        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)] mt-0.5 flex-wrap">
          <span className="font-mono">/{lesson.slug}</span>
          {lesson.durationSeconds ? (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(lesson.durationSeconds)}
            </span>
          ) : null}
          {lesson.isFreePreview && (
            <span className="inline-flex items-center gap-1 text-[var(--color-accent)] font-semibold">
              <Unlock className="w-3 h-3" />
              {t('freePreview')}{' '}
            </span>
          )}
        </div>
      </div>

      {lesson.isPublished ? (
        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs font-semibold">
          <Eye className="w-3 h-3" />
          {t('published')}{' '}
        </span>
      ) : (
        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 text-xs font-semibold">
          <EyeOff className="w-3 h-3" />
          {t('draft')}{' '}
        </span>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
        aria-label={t('editLesson')}
      >
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
