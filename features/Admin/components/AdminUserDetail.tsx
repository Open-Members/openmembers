"use client";
import { adminValueLabel, useAdminPeopleFormat } from "../people-presentation";
import { notificationDay } from "@/features/Notifications/formatting";
import { useTranslations } from "next-intl";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  MapPin,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Star,
  UserPlus,
  MessageSquare,
  Radio,
  Package,
  Infinity as InfinityIcon,
  ExternalLink,
  Activity,
  Circle,
  Phone,
  Pencil,
  Megaphone,
  Settings as SettingsIcon,
} from "lucide-react";
import type {
  StudentDetail,
  StudentProfile,
  StudentEnrollmentRow,
  ActivityItem,
  ActivityKind,
} from "../user-detail-queries";
import { AdminPageHeader } from "./AdminPageHeader";
import { UserEnrollmentsPanel } from "./UserEnrollmentsPanel";
import { EditProfileDialog } from "./EditProfileDialog";

type Props = { detail: StudentDetail };

type TabKey = "profile" | "enrollments" | "activity";

export function AdminUserDetail({ detail }: Props) {
  const t = useTranslations("adminPeople");
  const format = useAdminPeopleFormat();
  const [tab, setTab] = useState<TabKey>("profile");
  const [enrollPanelOpen, setEnrollPanelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] mb-2"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("backToStudents")}{" "}
        </Link>
      </div>

      <AdminPageHeader
        eyebrow={t("people")}
        title={detail.profile.displayName || t("unnamedStudent")}
        description={detail.profile.email || "—"}
        actions={
          <button
            type="button"
            onClick={() => setEnrollPanelOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <SettingsIcon className="w-4 h-4" />
            {t("manageEnrollments")}{" "}
          </button>
        }
      />

      <nav className="flex items-center border-b border-[var(--color-border)] -mt-2">
        {(
          [
            ["profile", t("profile")],
            [
              "enrollments",
              t("enrollmentsCount", {
                count: format.number(detail.enrollments.length),
              }),
            ],
            [
              "activity",
              t("activityCount", {
                count: format.number(detail.activity.length),
              }),
            ],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                active
                  ? "text-[var(--color-foreground)] border-[var(--color-primary)]"
                  : "text-[var(--color-muted-foreground)] border-transparent hover:text-[var(--color-foreground)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {tab === "profile" && (
        <ProfileTab profile={detail.profile} onEdit={() => setEditOpen(true)} />
      )}
      {tab === "enrollments" && (
        <EnrollmentsTab
          enrollments={detail.enrollments}
          onManage={() => setEnrollPanelOpen(true)}
        />
      )}
      {tab === "activity" && <ActivityTab items={detail.activity} />}

      {editOpen && (
        <EditProfileDialog
          profile={detail.profile}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            // Hard refresh so the profile cards reflect the saved values.
            if (typeof window !== "undefined") window.location.reload();
          }}
        />
      )}

      {enrollPanelOpen && (
        <UserEnrollmentsPanel
          userId={detail.profile.id}
          userName={
            detail.profile.displayName ||
            detail.profile.email ||
            t("unnamedStudent")
          }
          onClose={() => {
            setEnrollPanelOpen(false);
            // Soft refresh so the embedded enrollments list reflects
            // any grants/deactivations made inside the panel.
            if (typeof window !== "undefined") window.location.reload();
          }}
        />
      )}
    </div>
  );
}

/* ─── Profile tab ───────────────────────────────────────────────── */

function ProfileTab({
  profile,
  onEdit,
}: {
  profile: StudentProfile;
  onEdit: () => void;
}) {
  const t = useTranslations("adminPeople");
  const format = useAdminPeopleFormat();
  const statusTone =
    profile.status === "suspended"
      ? "text-red-500"
      : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
        >
          <Pencil className="w-4 h-4" />
          {t("editProfile")}{" "}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoRow
          icon={<Mail className="w-4 h-4" />}
          label={t("emailMore")}
          value={profile.email || "—"}
        />
        <InfoRow
          icon={<ShieldCheck className="w-4 h-4" />}
          label={t("role")}
          value={adminValueLabel(t, "roles", profile.role)}
        />
        <InfoRow
          icon={<CheckCircle2 className="w-4 h-4" />}
          label={t("status")}
          value={
            <span className={statusTone}>
              {adminValueLabel(t, "statuses", profile.status)}
            </span>
          }
        />
        <InfoRow
          icon={<Phone className="w-4 h-4" />}
          label={t("phone")}
          value={profile.phone || "—"}
        />
        <InfoRow
          icon={<MapPin className="w-4 h-4" />}
          label={t("country")}
          value={profile.country || "—"}
        />
        <InfoRow
          icon={<Megaphone className="w-4 h-4" />}
          label={t("signupSource")}
          value={
            profile.signupSource
              ? adminValueLabel(t, "sources", profile.signupSource)
              : "—"
          }
        />
        <InfoRow
          icon={<Calendar className="w-4 h-4" />}
          label={t("joined")}
          value={format.date(profile.createdAt)}
        />
        <InfoRow
          icon={<Clock className="w-4 h-4" />}
          label={t("lastSignInMore")}
          value={
            profile.lastLoginAt
              ? `${format.date(profile.lastLoginAt)} · ${format.relative(profile.lastLoginAt)}`
              : t("never")
          }
        />
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          backgroundColor:
            "color-mix(in oklab, var(--color-primary) 12%, transparent)",
          color: "var(--color-primary)",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-[var(--color-muted-foreground)] uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm text-[var(--color-foreground)] font-semibold truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ─── Enrollments tab ───────────────────────────────────────────── */

function EnrollmentsTab({
  enrollments,
  onManage,
}: {
  enrollments: StudentEnrollmentRow[];
  onManage: () => void;
}) {
  const t = useTranslations("adminPeople");
  const format = useAdminPeopleFormat();
  const now = format.now.getTime();
  if (enrollments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          {t("noEnrollmentsYet")}{" "}
        </p>
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <UserPlus className="w-4 h-4" />
          {t("grantAccess")}{" "}
        </button>
      </div>
    );
  }
  return (
    <ul className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
      {enrollments.map((e) => {
        const expired =
          e.expiresAt !== null && new Date(e.expiresAt).getTime() < now;
        const toneClass =
          !e.isActive || expired
            ? "text-[var(--color-muted-foreground)]"
            : "text-emerald-600 dark:text-emerald-400";
        const statusLabel = !e.isActive
          ? t("revoked")
          : expired
            ? t("expired")
            : t("active");
        return (
          <li key={e.id} className="px-4 py-3 flex items-center gap-3">
            <Package className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                {e.accessLevelName}
              </p>
              <p className="text-[11px] text-[var(--color-muted-foreground)] truncate">
                {t("enrolledSource", {
                  date: format.date(e.enrolledAt),
                  source: adminValueLabel(t, "sources", e.source),
                })}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs shrink-0">
              <div className="text-right">
                <p className="font-semibold tabular-nums text-[var(--color-foreground)] inline-flex items-center gap-1">
                  {e.expiresAt ? (
                    format.date(e.expiresAt)
                  ) : (
                    <>
                      <InfinityIcon className="w-3 h-3" />
                      {t("lifetime")}{" "}
                    </>
                  )}
                </p>
                <p
                  className={`text-[10px] uppercase tracking-wider font-bold ${toneClass}`}
                >
                  {statusLabel}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Activity tab ─────────────────────────────────────────────── */

const ACTIVITY_META: Record<
  ActivityKind,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  lesson_completed: { icon: CheckCircle2, color: "#22c55e" },
  rating_given: { icon: Star, color: "#f59e0b" },
  enrollment_new: { icon: UserPlus, color: "#3b82f6" },
  chat_started: { icon: MessageSquare, color: "#8b5cf6" },
  live_class_clicked: { icon: Radio, color: "#ef4444" },
};

function ActivityTab({ items }: { items: ActivityItem[] }) {
  const t = useTranslations("adminPeople");
  const format = useAdminPeopleFormat();
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
        <Activity className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2" />
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t("noActivityYetForThisStudent")}{" "}
        </p>
      </div>
    );
  }

  // Group by local date.
  const grouped = groupByDay(
    items,
    format.now,
    format.locale,
    format.timeZone,
    { today: t("today"), yesterday: t("yesterday"), unknownDate: "—" },
  );

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ day, label, items: dayItems }) => (
        <section key={day}>
          <header className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)] mb-2">
            {label}
          </header>
          <ol className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
            {dayItems.map((it, idx) => {
              const meta = ACTIVITY_META[it.kind];
              const Icon = meta?.icon ?? Circle;
              return (
                <li
                  key={`${day}-${idx}-${it.at}`}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
                      color: meta.color,
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                      {t(`activity.${it.kind}`, {
                        title: it.title || t("unknown"),
                        stars: it.stars ?? 0,
                      })}
                    </p>
                    {(it.detail || it.source) && (
                      <p className="text-[11px] text-[var(--color-muted-foreground)] truncate">
                        {it.source
                          ? t("filterValue", {
                              label: t("source"),
                              value: adminValueLabel(t, "sources", it.source),
                            })
                          : it.detail}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--color-muted-foreground)] tabular-nums shrink-0">
                    {new Date(it.at).toLocaleTimeString(format.locale, {
                      timeZone: format.timeZone,
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {it.href && (
                    <Link
                      href={it.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:bg-[var(--color-muted)] shrink-0"
                      aria-label={t("open")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function groupByDay(
  items: ActivityItem[],
  now: Date,
  locale: string,
  timeZone: string,
  labels: { today: string; yesterday: string; unknownDate: string },
) {
  const groups = new Map<
    string,
    { day: string; label: string; items: ActivityItem[] }
  >();
  for (const item of items) {
    const day = notificationDay(item.at, now, locale, timeZone, labels);
    const group = groups.get(day.key) ?? {
      day: day.key,
      label: day.label,
      items: [],
    };
    group.items.push(item);
    groups.set(day.key, group);
  }
  return [...groups.values()];
}
