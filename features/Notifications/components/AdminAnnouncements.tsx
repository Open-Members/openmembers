'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { Megaphone, Send, Loader2, Users, Package, BookOpen } from 'lucide-react';
import {
  sendBroadcast,
  type BroadcastAudience,
  type BroadcastOptions,
} from '@/features/Notifications/admin-actions';
import { AdminPageHeader } from '@/features/Admin/components/AdminPageHeader';
import { useAdminOperationsPresentation } from '@/features/Admin/operations-presentation';
import { appToast } from '@/shared/lib/toast';

type Props = { options: BroadcastOptions };
type AudienceKind = BroadcastAudience['kind'];

const TITLE_MAX = 120;
const MESSAGE_MAX = 600;

export function AdminAnnouncements({ options }: Props) {
  const { t, error, number } = useAdminOperationsPresentation();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('all');
  const [accessLevelId, setAccessLevelId] = useState(options.accessLevels[0]?.id ?? '');
  const [courseId, setCourseId] = useState(options.courses[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const deliveryId = useRef<string | null>(null);

  const audience = useMemo<BroadcastAudience | null>(() => {
    if (audienceKind === 'all') return { kind: 'all' };
    if (audienceKind === 'access_level' && accessLevelId) {
      return { kind: 'access_level', id: accessLevelId };
    }
    if (audienceKind === 'course' && courseId) {
      return { kind: 'course', id: courseId };
    }
    return null;
  }, [audienceKind, accessLevelId, courseId]);

  const reachCount = useMemo(() => {
    if (!audience) return 0;
    if (audience.kind === 'all') return options.totalUsers;
    if (audience.kind === 'access_level') {
      return options.accessLevels.find((level) => level.id === audience.id)?.memberCount ?? 0;
    }
    return options.courses.find((course) => course.id === audience.id)?.memberCount ?? 0;
  }, [audience, options]);

  const canSend =
    !pending &&
    audience !== null &&
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    title.trim().length <= TITLE_MAX &&
    message.trim().length <= MESSAGE_MAX &&
    reachCount > 0;

  function handleSend() {
    if (!canSend || !audience) return;
    const requestId = deliveryId.current ?? crypto.randomUUID();
    deliveryId.current = requestId;
    startTransition(async () => {
      try {
        const result = await sendBroadcast({
          requestId,
          title: title.trim(),
          message: message.trim(),
          actionUrl: actionUrl.trim() || null,
          audience,
        });
        if ('error' in result) {
          appToast.danger(error(result.error));
          return;
        }
        appToast.success(t('announcements.success', { count: result.sent }));
        deliveryId.current = null;
        setTitle('');
        setMessage('');
        setActionUrl('');
      } catch (cause) {
        appToast.danger(error(cause));
      }
    });
  }

  return (
    <div className="pb-24 max-w-5xl mx-auto w-full">
      <AdminPageHeader
        eyebrow={t('announcements.header.eyebrow')}
        title={t('announcements.header.title')}
        description={t('announcements.header.description')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          <Section title={t('announcements.compose.title')}>
            <Field
              label={t('announcements.compose.headline.label')}
              hint={t('announcements.compose.headline.hint')}
              charCount={`${number(title.trim().length)} / ${number(TITLE_MAX)}`}
              over={title.trim().length > TITLE_MAX}
            >
              <input
                value={title}
                onChange={(event) => {
                  deliveryId.current = null;
                  setTitle(event.target.value);
                }}
                placeholder={t('announcements.compose.headline.placeholder')}
                maxLength={TITLE_MAX + 20}
                className={inputClass}
              />
            </Field>

            <Field
              label={t('announcements.compose.body.label')}
              hint={t('announcements.compose.body.hint')}
              charCount={`${number(message.trim().length)} / ${number(MESSAGE_MAX)}`}
              over={message.trim().length > MESSAGE_MAX}
            >
              <textarea
                value={message}
                onChange={(event) => {
                  deliveryId.current = null;
                  setMessage(event.target.value);
                }}
                placeholder={t('announcements.compose.body.placeholder')}
                rows={4}
                maxLength={MESSAGE_MAX + 50}
                className={`${inputClass} resize-none`}
              />
            </Field>

            <Field
              label={t('announcements.compose.actionUrl.label')}
              hint={t('announcements.compose.actionUrl.hint')}
            >
              <input
                value={actionUrl}
                onChange={(event) => {
                  deliveryId.current = null;
                  setActionUrl(event.target.value);
                }}
                placeholder="/courses/new-release"
                className={inputClass}
              />
            </Field>
          </Section>

          <Section title={t('announcements.audience.title')}>
            <AudienceOption
              value="all"
              current={audienceKind}
              onChange={(value) => {
                deliveryId.current = null;
                setAudienceKind(value);
              }}
              icon={Users}
              title={t('announcements.audience.all.title')}
              subtitle={t('announcements.audience.all.subtitle', { count: options.totalUsers })}
            />

            <AudienceOption
              value="access_level"
              current={audienceKind}
              onChange={(value) => {
                deliveryId.current = null;
                setAudienceKind(value);
              }}
              icon={Package}
              title={t('announcements.audience.accessLevel.title')}
              subtitle={t('announcements.audience.accessLevel.subtitle')}
            >
              <select
                value={accessLevelId}
                onChange={(event) => {
                  deliveryId.current = null;
                  setAccessLevelId(event.target.value);
                }}
                disabled={audienceKind !== 'access_level'}
                className={`${inputClass} mt-3 disabled:opacity-60`}
              >
                {options.accessLevels.length === 0 && (
                  <option value="">{t('announcements.audience.accessLevel.empty')}</option>
                )}
                {options.accessLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {t('announcements.audience.option', {
                      name: level.name,
                      count: level.memberCount,
                    })}
                  </option>
                ))}
              </select>
            </AudienceOption>

            <AudienceOption
              value="course"
              current={audienceKind}
              onChange={(value) => {
                deliveryId.current = null;
                setAudienceKind(value);
              }}
              icon={BookOpen}
              title={t('announcements.audience.course.title')}
              subtitle={t('announcements.audience.course.subtitle')}
            >
              <select
                value={courseId}
                onChange={(event) => {
                  deliveryId.current = null;
                  setCourseId(event.target.value);
                }}
                disabled={audienceKind !== 'course'}
                className={`${inputClass} mt-3 disabled:opacity-60`}
              >
                {options.courses.length === 0 && (
                  <option value="">{t('announcements.audience.course.empty')}</option>
                )}
                {options.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {t('announcements.audience.option', {
                      name: course.title,
                      count: course.memberCount,
                    })}
                  </option>
                ))}
              </select>
            </AudienceOption>
          </Section>
        </div>

        <div className="lg:sticky lg:top-4 self-start space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-3 flex items-center gap-1.5">
              <Megaphone className="w-3.5 h-3.5" />
              {t('announcements.preview.title')}
            </p>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
              <p className="font-display text-base font-semibold tracking-tight text-[var(--color-foreground)] leading-tight">
                {title.trim() || t('announcements.preview.headline')}
              </p>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-1.5 leading-relaxed whitespace-pre-wrap">
                {message.trim() || t('announcements.preview.body')}
              </p>
              {actionUrl.trim() && (
                <p className="text-xs text-[var(--color-primary)] mt-2 truncate">
                  → {actionUrl.trim()}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              {t('announcements.reach.title')}
            </p>
            <p className="font-display text-3xl font-semibold tracking-tight text-[var(--color-foreground)]">
              {number(reachCount)}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              {t('announcements.reach.description', { count: reachCount })}
            </p>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('announcements.actions.sending')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {t('announcements.actions.send')}
                </>
              )}
            </button>

            <p className="text-xs text-[var(--color-muted-foreground)] mt-3 leading-relaxed">
              {t('announcements.actions.warning')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  charCount,
  over,
  children,
}: {
  label: string;
  hint?: string;
  charCount?: string;
  over?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-[var(--color-foreground)]">{label}</label>
        {charCount && (
          <span
            className={`text-xs tabular-nums ${over ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted-foreground)]'}`}
          >
            {charCount}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>}
    </div>
  );
}

function AudienceOption({
  value,
  current,
  onChange,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  value: AudienceKind;
  current: AudienceKind;
  onChange: (value: AudienceKind) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  const active = current === value;
  return (
    <label
      className={`block rounded-xl border p-4 cursor-pointer transition ${
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="audience"
          value={value}
          checked={active}
          onChange={() => onChange(value)}
          className="mt-1 w-4 h-4 accent-[var(--color-primary)]"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-[var(--color-muted-foreground)]" />
            <p className="text-sm font-bold text-[var(--color-foreground)]">{title}</p>
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{subtitle}</p>
          {children}
        </div>
      </div>
    </label>
  );
}
