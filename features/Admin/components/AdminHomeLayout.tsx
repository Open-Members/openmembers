'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Pencil,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Home,
  Sparkles,
  Star,
  BookOpen,
  Gift,
  PlayCircle,
  Grid2x2,
  Lock,
} from 'lucide-react';
import { appToast } from '@/shared/lib/toast';
import {
  getAdminCollections,
  reorderCollections,
  updateCollection,
} from '@/features/Admin/collections';
import type { AdminCollectionRow, RowType } from '@/features/Collections/types';
import { AdminPageHeader } from './AdminPageHeader';
import { CollectionDialog } from './CollectionDialog';
import { createClient } from '@/core/supabase/client';

const COLLECTION_SOFT_LIMIT = 15;

type Props = {
  initialData: AdminCollectionRow[];
};

const typeMeta: Record<
  RowType,
  { icon: React.ComponentType<{ className?: string }> }
> = {
  continue_watching: { icon: PlayCircle },
  enrolled: { icon: BookOpen },
  featured: { icon: Star },
  new: { icon: Sparkles },
  free: { icon: Gift },
  manual: { icon: Grid2x2 },
};

export function AdminHomeLayout({ initialData }: Props) {
  const t = useTranslations('adminOperations.home');
  const errors = useTranslations('adminOperations.errors');
  const [rows, setRows] = useState<AdminCollectionRow[]>(initialData);
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<
    | null
    | { mode: 'create' }
    | { mode: 'edit'; row: AdminCollectionRow; courseIds: string[] }
  >(null);

  function reload() {
    startTransition(async () => {
      try {
        const fresh = await getAdminCollections();
        setRows(fresh);
      } catch {
        appToast.danger(errors('loadFailed'));
      }
    });
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    const newOrder = [...rows];
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    setRows(newOrder);
    startTransition(async () => {
      try {
        const result = await reorderCollections(newOrder.map((r) => r.id));
        if ('error' in result && result.error) {
          appToast.danger(errors(result.error === 'notFound' ? 'notFound' : 'saveFailed'));
          reload();
        }
      } catch {
        appToast.danger(errors('saveFailed'));
        reload();
      }
    });
  }

  function toggleEnabled(row: AdminCollectionRow) {
    const next = !row.isEnabled;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, isEnabled: next } : r)),
    );
    startTransition(async () => {
      try {
        const result = await updateCollection(row.id, { isEnabled: next });
        if ('error' in result && result.error) {
          appToast.danger(errors(result.error === 'notFound' ? 'notFound' : 'saveFailed'));
          reload();
        }
      } catch {
        appToast.danger(errors('saveFailed'));
        reload();
      }
    });
  }

  async function openEdit(row: AdminCollectionRow) {
    let courseIds: string[] = [];
    if (row.rowType === 'manual') {
      const supabase = createClient();
      try {
        const { data, error } = await supabase
          .from('collection_courses')
          .select('course_id, sort_order')
          .eq('collection_id', row.id)
          .order('sort_order');
        if (error) {
          appToast.danger(errors('loadFailed'));
          return;
        }
        courseIds = (data ?? []).map((r: { course_id: string }) => r.course_id);
      } catch {
        appToast.danger(errors('loadFailed'));
        return;
      }
    }
    setDialog({ mode: 'edit', row, courseIds });
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16">
      <AdminPageHeader
        eyebrow={t('header.eyebrow')}
        title={t('header.title')}
        description={t('header.description')}
        actions={
          <>
            {rows.length > COLLECTION_SOFT_LIMIT && (
              <span className="text-xs text-[var(--color-muted-foreground)] max-w-[220px]">
                {t('softLimit', { count: rows.length })}
              </span>
            )}
            <button
              type="button"
              onClick={() => setDialog({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Plus className="w-4 h-4" />
              {t('addRow')}
            </button>
          </>
        }
      />

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] py-16 text-center">
          <Home className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2" />
          <p className="font-semibold text-[var(--color-foreground)]">
            {t('empty.title')}
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            {t('empty.description')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => {
            const meta = typeMeta[row.rowType];
            const TypeIcon = meta.icon;
            return (
              <section
                key={row.id}
                className={`flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 transition ${
                  row.isEnabled ? '' : 'opacity-60'
                }`}
              >
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={pending || idx === 0}
                    className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                    aria-label={t('actions.moveUp')}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={pending || idx === rows.length - 1}
                    className="p-1 rounded hover:bg-[var(--color-muted)] disabled:opacity-30"
                    aria-label={t('actions.moveDown')}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor:
                      'color-mix(in oklab, var(--color-primary) 12%, transparent)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <TypeIcon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm md:text-base font-bold text-[var(--color-foreground)] truncate">
                      {row.title}
                    </h3>
                    {row.isSystem && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        <Lock className="w-2.5 h-2.5" /> {t('system')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                    {t(`types.${row.rowType}.source`)}
                    {row.rowType === 'manual' &&
                      ` · ${t('courseCount', { count: row.courseCount })}`}
                    {row.subtitle && ` · ${row.subtitle}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleEnabled(row)}
                  disabled={pending}
                  title={row.isEnabled ? t('actions.hide') : t('actions.show')}
                  aria-label={row.isEnabled ? t('actions.hide') : t('actions.show')}
                  className={`p-2 rounded-lg transition ${
                    row.isEnabled
                      ? 'text-green-600 hover:bg-green-500/10'
                      : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
                  }`}
                >
                  {row.isEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
                  aria-label={t('actions.edit')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </section>
            );
          })}
        </div>
      )}

      {dialog && (
        <CollectionDialog
          mode={dialog.mode}
          collection={dialog.mode === 'edit' ? dialog.row : null}
          initialCourseIds={dialog.mode === 'edit' ? dialog.courseIds : []}
          onClose={() => setDialog(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
