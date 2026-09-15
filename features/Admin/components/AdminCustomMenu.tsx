'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ExternalLink,
  Menu as MenuIconLucide,
  X,
  Loader2,
  Check,
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
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  createCustomMenuItem,
  deleteCustomMenuItem,
  reorderCustomMenuItems,
  updateCustomMenuItem,
} from '@/features/Admin/actions';
import { appToast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils';
import {
  type CustomMenuItem,
  type MenuIconName,
  isExternalUrl,
} from '@/features/Navigation/types';
import { MenuIcon } from '@/features/Navigation/components/MenuIcon';
import { MenuIconPicker } from './MenuIconPicker';
import { AdminPageHeader } from './AdminPageHeader';

type Props = {
  initialItems: CustomMenuItem[];
};

export function AdminCustomMenu({ initialItems }: Props) {
  const t = useTranslations('adminOperations.menu');
  const errors = useTranslations('adminOperations.errors');
  const [items, setItems] = useState<CustomMenuItem[]>(initialItems);
  const [editing, setEditing] = useState<CustomMenuItem | 'new' | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const accessibility = useMemo(() => ({
    screenReaderInstructions: { draggable: t('drag.instructions') },
    announcements: {
      onDragStart: ({ active }: { active: { id: string | number } }) =>
        t('drag.started', { label: items.find((item) => item.id === active.id)?.label ?? String(active.id) }),
      onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
        over
          ? t('drag.over', {
              label: items.find((item) => item.id === active.id)?.label ?? String(active.id),
              target: items.find((item) => item.id === over.id)?.label ?? String(over.id),
            })
          : t('drag.noTarget'),
      onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
        over
          ? t('drag.ended', {
              label: items.find((item) => item.id === active.id)?.label ?? String(active.id),
              target: items.find((item) => item.id === over.id)?.label ?? String(over.id),
            })
          : t('drag.cancelled'),
      onDragCancel: () => t('drag.cancelled'),
    },
  }), [items, t]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);

    startTransition(async () => {
      try {
        const result = await reorderCustomMenuItems(next.map((i) => i.id));
        if (result && 'error' in result && result.error) {
          appToast.danger(errors(result.error === 'notFound' ? 'notFound' : 'saveFailed'));
          setItems(previous);
        }
      } catch {
        appToast.danger(errors('saveFailed'));
        setItems(previous);
      }
    });
  }

  function handleToggleEnabled(item: CustomMenuItem) {
    const previous = items;
    const next = items.map((i) =>
      i.id === item.id ? { ...i, isEnabled: !i.isEnabled } : i,
    );
    setItems(next);

    startTransition(async () => {
      try {
        const result = await updateCustomMenuItem(item.id, {
          label: item.label,
          url: item.url,
          iconName: item.iconName,
          isEnabled: !item.isEnabled,
        });
        if ('error' in result && result.error) {
          appToast.danger(errors(result.error === 'notFound' ? 'notFound' : 'saveFailed'));
          setItems(previous);
        }
      } catch {
        appToast.danger(errors('saveFailed'));
        setItems(previous);
      }
    });
  }

  function handleDelete(item: CustomMenuItem) {
    if (!confirm(t('deleteConfirm', { label: item.label }))) return;
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    startTransition(async () => {
      try {
        const result = await deleteCustomMenuItem(item.id);
        if ('error' in result && result.error) {
          appToast.danger(errors(result.error === 'notFound' ? 'notFound' : 'deleteFailed'));
          setItems(previous);
        }
      } catch {
        appToast.danger(errors('deleteFailed'));
        setItems(previous);
      }
    });
  }

  async function handleSave(input: {
    label: string;
    url: string;
    iconName: MenuIconName | null;
    isEnabled: boolean;
  }) {
    try {
      if (editing === 'new') {
        const result = await createCustomMenuItem(input);
        if ('error' in result && result.error) {
          const key = result.error === 'labelRequired' || result.error === 'labelTooLong' || result.error === 'invalidUrl'
            ? result.error
            : 'saveFailed';
          appToast.danger(errors(key));
          return;
        }
        appToast.success(t('created'));
      } else if (editing) {
        const result = await updateCustomMenuItem(editing.id, input);
        if ('error' in result && result.error) {
          const key = result.error === 'labelRequired' || result.error === 'labelTooLong' || result.error === 'invalidUrl' || result.error === 'notFound'
            ? result.error
            : 'saveFailed';
          appToast.danger(errors(key));
          return;
        }
        appToast.success(t('saved'));
      }
    } catch {
      appToast.danger(errors('saveFailed'));
      return;
    }
    setEditing(null);
    // Server revalidated via revalidatePath('/', 'layout'); refresh local list
    // by requesting a fresh fetch next paint. Cheapest path: nav.reload().
    window.location.reload();
  }

  return (
    <div className="max-w-4xl mx-auto w-full">
      <AdminPageHeader
        eyebrow={t('header.eyebrow')}
        title={t('header.title')}
        description={t('header.description')}
        actions={
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Plus className="w-4 h-4" />
            {t('addItem')}
          </button>
        }
      />

      {items.length === 0 ? (
        <div className="rounded-2xl border border-hairline py-16 text-center">
          <MenuIconLucide className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-3" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-1">
            {t('empty.eyebrow')}
          </p>
          <p className="font-display text-xl font-medium text-[var(--color-foreground)]">
            {t('empty.title')}
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-2 max-w-sm mx-auto">
            {t('empty.description')}
          </p>
        </div>
      ) : (
        <DndContext
          id="admin-custom-menu"
          accessibility={accessibility}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {items.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  disabled={isPending}
                  onEdit={() => setEditing(item)}
                  onToggle={() => handleToggleEnabled(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editing && (
        <ItemDialog
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ─── Sortable row ─────────────────────────────────────────────────────────

function SortableRow({
  item,
  disabled,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: CustomMenuItem;
  disabled: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('adminOperations.menu');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const external = isExternalUrl(item.url);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 transition',
        isDragging && 'shadow-lg',
        !item.isEnabled && 'opacity-60',
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        {...attributes}
        {...listeners}
        aria-label={t('actions.drag', { label: item.label })}
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="w-9 h-9 rounded-lg bg-[var(--color-muted)] flex items-center justify-center shrink-0 text-[var(--color-foreground)]">
        <MenuIcon name={item.iconName} className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
          {item.label}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)] truncate flex items-center gap-1">
          {external && <ExternalLink className="w-3 h-3 shrink-0" />}
          {item.url}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
          title={item.isEnabled ? t('actions.hide') : t('actions.show')}
          aria-label={item.isEnabled ? t('actions.hide') : t('actions.show')}
        >
          {item.isEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
          title={t('actions.edit')}
          aria-label={t('actions.edit')}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition"
          title={t('actions.delete')}
          aria-label={t('actions.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Create / edit dialog ─────────────────────────────────────────────────

function ItemDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: CustomMenuItem | null;
  onClose: () => void;
  onSave: (input: {
    label: string;
    url: string;
    iconName: MenuIconName | null;
    isEnabled: boolean;
  }) => Promise<void>;
}) {
  const t = useTranslations('adminOperations.menu.dialog');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [iconName, setIconName] = useState<MenuIconName | null>(
    initial?.iconName ?? null,
  );
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? true);
  const [pending, startTransition] = useTransition();

  const canSave = label.trim().length > 0 && url.trim().length > 0 && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    startTransition(async () => {
      await onSave({ label: label.trim(), url: url.trim(), iconName, isEnabled });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-menu-dialog-title"
        className="w-full max-w-lg rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 id="custom-menu-dialog-title" className="font-bold text-[var(--color-foreground)]">
            {initial ? t('editTitle') : t('createTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="custom-menu-label" className="text-sm font-medium text-[var(--color-foreground)]">
              {t('label')}
            </label>
            <input
              id="custom-menu-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('labelPlaceholder')}
              maxLength={80}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="custom-menu-url" className="text-sm font-medium text-[var(--color-foreground)]">
              {t('url')}
            </label>
            <input
              id="custom-menu-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://wa.me/5511999999999"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {t('urlHelp')}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-foreground)]">
              {t('icon')}
            </label>
            <MenuIconPicker value={iconName} onChange={setIconName} label={t('icon')} />
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 cursor-pointer hover:bg-[var(--color-muted)]/40 transition">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                {t('enabled')}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t('enabledHelp')}
              </p>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-muted)]/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {pending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}
              </>
            ) : (
              <>
                <Check className="w-4 h-4" /> {t('save')}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
