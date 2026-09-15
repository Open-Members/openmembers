'use client';

import { useTranslations, useLocale, useNow } from 'next-intl';
import { contentError } from '../content-errors';

import { useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Radio,
  Loader2,
  ExternalLink,
  Calendar,
  Clock,
  Globe,
  Check,
} from 'lucide-react';
import { appToast } from '@/shared/lib/toast';
import {
  createLiveClassAction,
  updateLiveClassAction,
  deleteLiveClassAction,
  getAdminLiveClasses,
} from '@/features/LiveClasses/actions';
import type { LiveClassWithCourse } from '@/features/LiveClasses/types';
import {
  CURATED_TIMEZONES,
  DEFAULT_ORIGIN_TIMEZONE,
  browserTimezone,
  formatTimeInZone,
  getAllTimezones,
  zonedWallClockToUtcIso,
} from '@/features/LiveClasses/lib/timezone';
import type { AdminCourse } from '../actions';
import { AdminPageHeader } from './AdminPageHeader';

type Props = {
  initialData: LiveClassWithCourse[];
  courses: AdminCourse[];
};

type DialogState =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; liveClass: LiveClassWithCourse };

function useCurrentTime() {
  return useNow({ updateInterval: 30_000 }).getTime();
}

const subscribeToTimezone = () => () => {};
const serverTimezone = () => 'UTC';

function formatStartsAtInZone(iso: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

/** Convert an ISO timestamp into the `YYYY-MM-DDTHH:mm` shape datetime-local
 * wants, rendered in a specific IANA timezone so editing feels natural when
 * the admin is in a different zone than the one the event was created in. */
function toDatetimeLocalValueInZone(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function AdminLiveClasses({ initialData, courses }: Props) {
  const t = useTranslations('adminContent');
  const [rows, setRows] = useState<LiveClassWithCourse[]>(initialData);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, startTransition] = useTransition();

  const now = useCurrentTime();
  const upcoming = useMemo(
    () =>
      rows.filter((r) => {
        const end = new Date(r.startsAt).getTime() + r.durationMinutes * 60_000;
        return end > now;
      }),
    [rows, now],
  );
  const past = useMemo(
    () =>
      rows.filter((r) => {
        const end = new Date(r.startsAt).getTime() + r.durationMinutes * 60_000;
        return end <= now;
      }),
    [rows, now],
  );

  function reload() {
    startTransition(async () => {
      try {
        const fresh = await getAdminLiveClasses();
        setRows(fresh);
      } catch {
        appToast.danger(t('errors.loadFailed'));
      }
    });
  }

  function handleDelete(id: string, title: string) {
    if (!confirm(t('deleteNamed', { title }))) return;
    startTransition(async () => {
      try {
        const result = await deleteLiveClassAction(id);
        if ('error' in result) {
          appToast.danger(contentError(result.error, t));
        } else {
          setRows((current) => current.filter((row) => row.id !== id));
          appToast.success(t('liveClassDeleted'));
        }
      } catch {
        appToast.danger(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16">
      <AdminPageHeader
        eyebrow={t('learning')}
        title={t('liveClasses')}
        description={t('scheduleLiveSessionsZoomMeetAnywherePickOneOr')}
        actions={
          <button
            type="button"
            onClick={() => setDialog({ mode: 'create' })}
            disabled={courses.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Plus className="w-4 h-4" />
            {t('newLiveClass')}{' '}
          </button>
        }
      />

      {courses.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted-foreground)]">
          {t('youNeedAtLeastOneCourseBeforeYouCan')}{' '}
        </div>
      )}

      <Section
        heading={t('upcoming')}
        count={upcoming.length}
        empty={t('noUpcomingLiveClassesYet')}
      >
        {upcoming.map((row) => (
          <Row
            key={row.id}
            row={row}
            onEdit={() => setDialog({ mode: 'edit', liveClass: row })}
            onDelete={() => handleDelete(row.id, row.title)}
            pending={pending}
          />
        ))}
      </Section>

      {past.length > 0 && (
        <Section heading={t('past')} count={past.length}>
          {past.map((row) => (
            <Row
              key={row.id}
              row={row}
              onEdit={() => setDialog({ mode: 'edit', liveClass: row })}
              onDelete={() => handleDelete(row.id, row.title)}
              pending={pending}
              dim
            />
          ))}
        </Section>
      )}

      {dialog && (
        <LiveClassDialog
          mode={dialog.mode}
          initial={dialog.mode === 'edit' ? dialog.liveClass : null}
          courses={courses}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Section({
  heading,
  count,
  empty,
  children,
}: {
  heading: string;
  count: number;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-3">
        {heading} · {count}
      </h2>
      {count === 0 ? (
        empty ? (
          <p className="text-sm text-[var(--color-muted-foreground)] italic">
            {empty}
          </p>
        ) : null
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function Row({
  row,
  onEdit,
  onDelete,
  pending,
  dim,
}: {
  row: LiveClassWithCourse;
  onEdit: () => void;
  onDelete: () => void;
  pending: boolean;
  dim?: boolean;
}) {
  const t = useTranslations('adminContent');
  const locale = useLocale();
  const courseLabel =
    row.courses.length === 0
      ? t('noCoursesLinked')
      : row.courses.length === 1
        ? row.courses[0].title
        : t('additionalCourses', {
            title: row.courses[0].title,
            count: row.courses.length - 1,
          });
  return (
    <article
      className={`flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 ${
        dim ? 'opacity-70' : ''
      }`}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor:
            'color-mix(in oklab, var(--color-primary) 12%, transparent)',
          color: 'var(--color-primary)',
        }}
      >
        <Radio className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm md:text-base font-bold text-[var(--color-foreground)] truncate">
            {row.title}
          </h3>
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatStartsAtInZone(row.startsAt, row.originTimezone, locale)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {t('minutes', { count: row.durationMinutes })}
          </span>
          <span className="truncate">· {courseLabel}</span>
        </p>
      </div>

      <a
        href={row.meetingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
        title={t('openMeetingLink')}
        aria-label={t('openMeetingLink')}
      >
        <ExternalLink className="w-4 h-4" />
      </a>

      <button
        type="button"
        onClick={onEdit}
        disabled={pending}
        className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"
        aria-label={t('edit')}
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-red-500"
        aria-label={t('delete')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </article>
  );
}

function LiveClassDialog({
  mode,
  initial,
  courses,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  initial: LiveClassWithCourse | null;
  courses: AdminCourse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('adminContent');
  const locale = useLocale();
  const [originTimezone, setOriginTimezone] = useState<string>(
    initial?.originTimezone ?? DEFAULT_ORIGIN_TIMEZONE,
  );
  const [courseIds, setCourseIds] = useState<string[]>(
    initial?.courses.map((c) => c.id) ?? (courses[0] ? [courses[0].id] : []),
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startsAt, setStartsAt] = useState(
    initial
      ? toDatetimeLocalValueInZone(initial.startsAt, initial.originTimezone)
      : '',
  );
  const [durationMinutes, setDurationMinutes] = useState(
    initial?.durationMinutes ?? 60,
  );
  const [meetingUrl, setMeetingUrl] = useState(initial?.meetingUrl ?? '');
  const [showAllZones, setShowAllZones] = useState(
    !CURATED_TIMEZONES.some((tz) => tz.id === originTimezone) &&
      originTimezone !== '',
  );
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Preview block — recomputes as admin edits time / zone.
  const browserTz = useSyncExternalStore(
    subscribeToTimezone,
    browserTimezone,
    serverTimezone,
  );
  const now = useCurrentTime();

  const previewUtcIso = useMemo(() => {
    if (!startsAt) return null;
    try {
      return zonedWallClockToUtcIso(startsAt, originTimezone);
    } catch {
      return null;
    }
  }, [startsAt, originTimezone]);

  // Derived: is the chosen time already in the past? Used to warn the
  // admin before submit — it's a common mistake when the date part of
  // the datetime-local input carries yesterday's date by default.
  const isInPast = useMemo(() => {
    if (!previewUtcIso) return false;
    // 2-minute grace so picking "right now" doesn't trip on request latency.
    return new Date(previewUtcIso).getTime() < now - 2 * 60_000;
  }, [previewUtcIso, now]);

  const allZones = useMemo(() => {
    const all = getAllTimezones();
    return all.length > 0 ? all : CURATED_TIMEZONES.map((t) => t.id);
  }, []);

  function toggleCourse(id: string) {
    setCourseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (courseIds.length === 0) {
      setError(t('selectAtLeastOneCourse'));
      return;
    }
    if (!title.trim() || !startsAt || !meetingUrl.trim()) {
      setError(t('fillTheRequiredFields'));
      return;
    }
    if (!previewUtcIso) {
      setError(t('errors.liveDate'));
      return;
    }
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 5 ||
      durationMinutes > 600
    ) {
      setError(t('errors.liveDuration'));
      return;
    }
    try {
      new URL(meetingUrl);
    } catch {
      setError(t('errors.liveUrl'));
      return;
    }
    // Block creating/editing into the past unless the row was already past
    // when opened (editing a historical record shouldn't be blocked).
    const initialStartMs = initial
      ? new Date(initial.startsAt).getTime()
      : Infinity;
    const earliestStart = now - 2 * 60_000;
    const selectedTimeIsPast =
      previewUtcIso !== null &&
      new Date(previewUtcIso).getTime() < earliestStart;
    if (selectedTimeIsPast && initialStartMs > earliestStart) {
      setError(t('theChosenTimeIsInThePastDoubleCheck'));
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('courseIds', JSON.stringify(courseIds));
        fd.set('title', title.trim());
        fd.set('description', description.trim());
        fd.set('startsAt', startsAt);
        fd.set('durationMinutes', String(durationMinutes));
        fd.set('meetingUrl', meetingUrl.trim());
        fd.set('originTimezone', originTimezone);

        const result = initial
          ? await updateLiveClassAction(initial.id, fd)
          : await createLiveClassAction(fd);

        if ('error' in result) {
          setError(contentError(result.error, t));
        } else {
          appToast.success(
            initial ? t('liveClassUpdated') : t('liveClassCreated'),
          );
          onSaved();
        }
      } catch {
        setError(t('errors.operationFailed'));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <form
        noValidate
        onSubmit={submit}
        className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-foreground)]">
            {mode === 'edit' ? t('editLiveClass') : t('newLiveClass')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-muted)]"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Courses (multi-select) */}
          <Field label={t('selectedCourses', { count: courseIds.length })}>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] max-h-48 overflow-y-auto">
              {courses.map((c) => {
                const active = courseIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCourse(c.id)}
                    aria-pressed={active}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      active
                        ? 'bg-[var(--color-muted)] text-[var(--color-foreground)] font-semibold'
                        : 'text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/50'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        active
                          ? 'border-transparent'
                          : 'border-[var(--color-border)]'
                      }`}
                      style={{
                        backgroundColor: active
                          ? 'var(--color-primary)'
                          : 'transparent',
                      }}
                    >
                      {active && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{c.title}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Title */}
          <Field label={t('title2')}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={t('qAWithRoy')}
              className="input"
              required
            />
          </Field>

          {/* Start + duration */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('startsAt')}>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="input"
                required
              />
            </Field>
            <Field label={t('durationMin')}>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                min={5}
                max={600}
                className="input"
                required
              />
            </Field>
          </div>

          {/* Timezone + preview */}
          <Field label={t('timezone')}>
            <div className="flex items-center gap-2">
              <select
                value={showAllZones ? '__other__' : originTimezone}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__other__') {
                    setShowAllZones(true);
                  } else {
                    setShowAllZones(false);
                    setOriginTimezone(v);
                  }
                }}
                className="input flex-1"
              >
                {CURATED_TIMEZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>
                    {tz.id}
                  </option>
                ))}
                <option value="__other__">{t('other')}</option>
              </select>
              {showAllZones && (
                <select
                  value={originTimezone}
                  onChange={(e) => setOriginTimezone(e.target.value)}
                  className="input flex-1"
                >
                  {allZones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </Field>

          {previewUtcIso && (
            <div
              className="rounded-xl border px-4 py-3 text-xs"
              style={
                isInPast
                  ? {
                      borderColor:
                        'color-mix(in oklab, #ef4444 45%, transparent)',
                      backgroundColor:
                        'color-mix(in oklab, #ef4444 10%, transparent)',
                    }
                  : {
                      borderColor:
                        'color-mix(in oklab, var(--color-primary) 30%, transparent)',
                      backgroundColor:
                        'color-mix(in oklab, var(--color-primary) 8%, transparent)',
                    }
              }
            >
              {isInPast && (
                <p className="font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  {t('headsUpThisTimeHasAlreadyPassed')}{' '}
                </p>
              )}
              <p
                className={`font-semibold mb-2 flex items-center gap-1.5 ${isInPast ? 'text-[var(--color-muted-foreground)]' : 'text-[var(--color-foreground)]'}`}
              >
                <Globe className="w-3.5 h-3.5" />
                {isInPast ? t('resolvedTo') : t('thisSessionWillRunAt')}
              </p>
              <ul className="space-y-1 text-[var(--color-muted-foreground)]">
                <li className="flex items-center justify-between gap-3">
                  <span className="font-bold text-[var(--color-foreground)] tabular-nums">
                    {formatTimeInZone(previewUtcIso, originTimezone, locale)}
                  </span>
                  <span className="truncate">{originTimezone}</span>
                </li>
                {browserTz !== originTimezone && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="tabular-nums">
                      {formatTimeInZone(previewUtcIso, browserTz, locale)}
                    </span>
                    <span className="truncate">
                      {browserTz} {t('yourBrowser')}
                    </span>
                  </li>
                )}
                {originTimezone !== 'UTC' && browserTz !== 'UTC' && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="tabular-nums">
                      {formatTimeInZone(previewUtcIso, 'UTC', locale)}
                    </span>
                    <span>UTC</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Meeting URL */}
          <Field label={t('meetingURL')}>
            <input
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://zoom.us/j/..."
              className="input"
              required
            />
          </Field>

          {/* Description */}
          <Field label={t('descriptionOptional')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t('whatWillYouCover')}
              className="input resize-y"
            />
          </Field>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            {t('cancel')}{' '}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'edit' ? t('saveChanges') : t('create')}
          </button>
        </div>

        <style jsx>{`
          .input {
            width: 100%;
            border-radius: 0.75rem;
            border: 1px solid var(--color-border);
            background: var(--color-background);
            color: var(--color-foreground);
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
          }
          .input:focus {
            box-shadow: 0 0 0 2px
              color-mix(in oklab, var(--color-primary) 40%, transparent);
            border-color: transparent;
          }
        `}</style>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[var(--color-muted-foreground)] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
