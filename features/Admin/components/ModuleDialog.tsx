'use client';

import { useTranslations } from 'next-intl';
import { contentError } from '../content-errors';

import { useState, useTransition } from 'react';
import { X, Loader2, Trash2 } from 'lucide-react';
import {
  createModule,
  updateModule,
  deleteModule,
} from '@/features/Courses/actions';
import { appToast } from '@/shared/lib/toast';
import type { AdminModule } from '@/features/Admin/courseContent';

type Mode = 'create' | 'edit';

type Props = {
  mode: Mode;
  courseId: string;
  module?: AdminModule | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ModuleDialog({
  mode,
  courseId,
  module,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations('adminContent');
  const [title, setTitle] = useState(module?.title ?? '');
  const [description, setDescription] = useState(module?.description ?? '');
  const [isPublished, setIsPublished] = useState(module?.isPublished ?? false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!title.trim()) {
      appToast.warning(t('titleIsRequired'));
      return;
    }
    startTransition(async () => {
      try {
        if (mode === 'create') {
          const fd = new FormData();
          fd.set('courseId', courseId);
          fd.set('title', title.trim());
          fd.set('description', description.trim());
          const result = await createModule(fd);
          if ('error' in result && result.error) {
            appToast.danger(contentError(result.error, t));
            return;
          }
          appToast.success(t('moduleCreated'));
        } else {
          const fd = new FormData();
          fd.set('title', title.trim());
          fd.set('description', description.trim());
          fd.set('isPublished', isPublished ? 'true' : 'false');
          const result = await updateModule(module!.id, fd);
          if ('error' in result && result.error) {
            appToast.danger(contentError(result.error, t));
            return;
          }
          appToast.success(t('moduleUpdated'));
        }
        onSaved();
        onClose();
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  function handleDelete() {
    if (!module) return;
    startTransition(async () => {
      try {
        const result = await deleteModule(module.id);
        if ('error' in result && result.error) {
          appToast.danger(contentError(result.error, t));
          return;
        }
        appToast.success(t('moduleRemoved'));
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
        className="w-full max-w-lg rounded-2xl bg-[var(--color-card)] shadow-xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-foreground)]">
            {mode === 'create' ? t('newModule') : t('editModule')}
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
          <Field label={t('title')}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('eGGettingStarted')}
              className={inputClass}
            />
          </Field>

          <Field
            label={t('description')}
            hint={t('optionalContextShownBelowTheModuleHeader')}
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('whatThisModuleCovers')}
              className={`${inputClass} resize-none`}
            />
          </Field>

          {mode === 'edit' && (
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
                  {t('visibleToEnrolledStudentsDraftModulesAreHiddenFrom')}{' '}
                </p>
              </div>
            </label>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-muted)]/40">
          {mode === 'edit' && module ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {t('deleteThisModuleAndItsLessons')}{' '}
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
                {t('deleteModule')}{' '}
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
