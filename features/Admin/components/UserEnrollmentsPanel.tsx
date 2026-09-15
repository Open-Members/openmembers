"use client";
import {
  adminPeopleError,
  adminValueLabel,
  useAdminPeopleFormat,
} from "../people-presentation";
import { appToast } from "@/shared/lib/toast";
import { useTranslations } from "next-intl";

import { useState, useTransition, useEffect, useMemo } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  Infinity as InfinityIcon,
  CalendarDays,
} from "lucide-react";
import { useFocusTrap } from "@/shared/lib/useFocusTrap";
import { getUserEnrollments, getAdminAccessLevels } from "../actions";
import type { UserEnrollment, AdminAccessLevel } from "../actions";
import {
  enrollUser,
  deactivateEnrollment,
  reactivateEnrollment,
} from "@/features/Enrollment/actions";
import {
  getCohortsForCourses,
  type AdminCohort,
} from "@/features/Cohorts/actions";

// Internal helpers — kept local because they're only meaningful for
// this picker; if other surfaces need them later, hoist to features/
// Admin/lib/.

type PickerMode = "byCourse" | "byAccessLevel";
type ExpirationMode = "preset" | "custom" | "lifetime";

const EXPIRATION_PRESETS = [1, 3, 6, 12] as const;

function addMonthsIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function resolveExpiresAt(
  mode: ExpirationMode,
  presetMonths: number,
  customDate: string,
): string | undefined {
  if (mode === "lifetime") return undefined;
  if (mode === "preset") return addMonthsIso(presetMonths);
  if (mode === "custom" && customDate) return customDate;
  return undefined;
}

interface UserEnrollmentsPanelProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

/**
 * Modal panel that lets an admin grant new access (by course or by
 * product), set an expiration, optionally pick cohorts per course, and
 * deactivate / reactivate existing enrollments. Used from both the
 * /admin/users list and the per-user /admin/users/[id] detail page.
 */
export function UserEnrollmentsPanel(props: UserEnrollmentsPanelProps) {
  return <UserEnrollmentsPanelContent key={props.userId} {...props} />;
}

function UserEnrollmentsPanelContent({
  userId,
  userName,
  onClose,
}: UserEnrollmentsPanelProps) {
  const t = useTranslations("adminAccess");
  const format = useAdminPeopleFormat();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [enrollments, setEnrollments] = useState<UserEnrollment[]>([]);
  const [accessLevels, setAccessLevels] = useState<AdminAccessLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Picker state
  const [mode, setMode] = useState<PickerMode>("byCourse");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedAccessLevelId, setSelectedAccessLevelId] = useState("");
  const [expirationMode, setExpirationMode] =
    useState<ExpirationMode>("preset");
  const [presetMonths, setPresetMonths] = useState<number>(12);
  const [customDate, setCustomDate] = useState("");
  const [statusMsg, setStatusMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Cohorts for each course granted by the currently selected access_level.
  const [cohortData, setCohortData] = useState<{
    accessLevelId: string;
    courses: Record<string, AdminCohort[]>;
  } | null>(null);
  const [cohortPicks, setCohortPicks] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUserEnrollments(userId), getAdminAccessLevels()])
      .then(([enr, als]) => {
        if (cancelled) return;
        setEnrollments(enr);
        setAccessLevels(als);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setStatusMsg({
            type: "err",
            text: t("couldNotLoadEnrollmentsReopenThePanelToRetry"),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const al of accessLevels) {
      al.courseIds.forEach((id, i) => {
        if (!map.has(id)) map.set(id, al.courseNames[i] ?? t("unknown"));
      });
    }
    return [...map.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [accessLevels, t]);

  const accessLevelsForCourse = useMemo(() => {
    if (!selectedCourseId) return [] as AdminAccessLevel[];
    return accessLevels.filter((al) => al.courseIds.includes(selectedCourseId));
  }, [accessLevels, selectedCourseId]);

  const resolvedAccessLevelId =
    mode === "byCourse"
      ? accessLevelsForCourse.length === 1
        ? accessLevelsForCourse[0].id
        : accessLevelsForCourse.some(
              (level) => level.id === selectedAccessLevelId,
            )
          ? selectedAccessLevelId
          : ""
      : selectedAccessLevelId;
  const cohortsByCourse =
    cohortData?.accessLevelId === resolvedAccessLevelId
      ? cohortData.courses
      : {};
  const canEnroll =
    Boolean(resolvedAccessLevelId) &&
    (expirationMode !== "custom" || Boolean(customDate)) &&
    cohortData?.accessLevelId === resolvedAccessLevelId;

  const grantedCourses = useMemo(() => {
    const al = accessLevels.find((a) => a.id === resolvedAccessLevelId);
    if (!al) return [] as Array<{ id: string; name: string }>;
    return al.courseIds.map((id, i) => ({
      id,
      name: al.courseNames[i] ?? t("unknown"),
    }));
  }, [accessLevels, resolvedAccessLevelId, t]);

  useEffect(() => {
    if (grantedCourses.length === 0) return;
    let cancelled = false;
    getCohortsForCourses(grantedCourses.map((c) => c.id))
      .then((map) => {
        if (cancelled) return;
        setCohortData({ accessLevelId: resolvedAccessLevelId, courses: map });
      })
      .catch(() => {
        if (!cancelled)
          setStatusMsg({
            type: "err",
            text: t("couldNotLoadCohortsSelectTheProductAgainTo"),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [grantedCourses, resolvedAccessLevelId, t]);

  function handleEnroll() {
    if (!canEnroll) return;
    setStatusMsg(null);
    const expiresAt = resolveExpiresAt(
      expirationMode,
      presetMonths,
      customDate,
    );

    const cohortAssignments = grantedCourses
      .map(({ id: courseId }) => ({
        courseId,
        cohortId: cohortPicks[courseId],
      }))
      .filter(
        ({ courseId, cohortId }) =>
          Boolean(cohortId) &&
          (cohortsByCourse[courseId] ?? []).some(
            (cohort) => cohort.id === cohortId,
          ),
      );

    startTransition(async () => {
      try {
        const result = await enrollUser({
          userId,
          accessLevelId: resolvedAccessLevelId,
          source: "manual",
          expiresAt,
          cohortAssignments,
        });
        if (result && "error" in result && result.error) {
          setStatusMsg({
            type: "err",
            text: adminPeopleError(t, result.error),
          });
        } else {
          const updated = await getUserEnrollments(userId);
          setEnrollments(updated);
          const al = accessLevels.find((a) => a.id === resolvedAccessLevelId);
          const cohortCount = cohortAssignments.length;
          setStatusMsg({
            type: "ok",
            text:
              (expiresAt
                ? t("grantedUntil", {
                    name: al?.name || t("selectedLevel"),
                    date: format.civilDate(expiresAt),
                  })
                : t("grantedLifetime", {
                    name: al?.name || t("selectedLevel"),
                  })) +
              (cohortCount
                ? ` ${t("assignedCohorts", { count: cohortCount })}`
                : ""),
          });
          setSelectedCourseId("");
          if (mode === "byCourse") setSelectedAccessLevelId("");
          setCohortPicks({});
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleToggleEnrollment(enrollmentId: string, isActive: boolean) {
    startTransition(async () => {
      try {
        const result = isActive
          ? await deactivateEnrollment(enrollmentId)
          : await reactivateEnrollment(enrollmentId);
        if (!result.success) {
          setStatusMsg({
            type: "err",
            text: adminPeopleError(t, result.error),
          });
          return;
        }
        const updated = await getUserEnrollments(userId);
        setEnrollments(updated);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  const activeEnrollments = enrollments.filter(
    (e) => e.isActive && !e.isExpired,
  );
  const expiredEnrollments = enrollments.filter((e) => e.isExpired);
  const deactivatedEnrollments = enrollments.filter(
    (e) => !e.isActive && !e.isExpired,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("manageNamed", { name: userName })}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="font-bold text-[var(--color-foreground)]">
              {t("grantAccess")}
            </h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {userName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="p-2 rounded-xl hover:bg-[var(--color-muted)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : loadFailed ? (
            <p role="alert">{t("errors.loadFailed")}</p>
          ) : (
            <>
              {/* Grant new access */}
              <div className="border border-[var(--color-border)] rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  {t("grantNewAccess")}{" "}
                </p>

                <div className="inline-flex rounded-lg bg-[var(--color-muted)] p-1 text-xs font-semibold">
                  <button
                    onClick={() => {
                      setMode("byCourse");
                      setSelectedAccessLevelId("");
                      setCohortPicks({});
                    }}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      mode === "byCourse"
                        ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                        : "text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    {t("byCourse")}{" "}
                  </button>
                  <button
                    onClick={() => {
                      setMode("byAccessLevel");
                      setSelectedAccessLevelId("");
                      setCohortPicks({});
                    }}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      mode === "byAccessLevel"
                        ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                        : "text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    {t("byProduct")}{" "}
                  </button>
                </div>

                {mode === "byCourse" ? (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                      {t("course")}
                    </label>
                    <select
                      value={selectedCourseId}
                      onChange={(e) => {
                        setSelectedCourseId(e.target.value);
                        setSelectedAccessLevelId("");
                        setCohortPicks({});
                      }}
                      className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">{t("selectACourse")}</option>
                      {courseOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>

                    {selectedCourseId && accessLevelsForCourse.length > 1 && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                          {t("multipleProductsIncludeThisCoursePickOne")}{" "}
                        </label>
                        <select
                          value={resolvedAccessLevelId}
                          onChange={(e) => {
                            setSelectedAccessLevelId(e.target.value);
                            setCohortPicks({});
                          }}
                          className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="">{t("selectProduct")}</option>
                          {accessLevelsForCourse.map((al) => (
                            <option key={al.id} value={al.id}>
                              {al.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedCourseId && accessLevelsForCourse.length === 0 && (
                      <p className="text-xs text-red-600">
                        {t("noProductIncludesThisCourseYetCreateOneUnder")}{" "}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                      {t("product")}
                    </label>
                    <select
                      value={resolvedAccessLevelId}
                      onChange={(e) => {
                        setSelectedAccessLevelId(e.target.value);
                        setCohortPicks({});
                      }}
                      className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">{t("selectAProduct")}</option>
                      {accessLevels.map((al) => (
                        <option key={al.id} value={al.id}>
                          {al.name}
                          {al.courseNames.length > 0 &&
                            ` (${t("courseCount", { count: al.courseNames.length })})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                    {t("accessDuration")}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPIRATION_PRESETS.map((months) => (
                      <button
                        key={months}
                        onClick={() => {
                          setExpirationMode("preset");
                          setPresetMonths(months);
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          expirationMode === "preset" &&
                          presetMonths === months
                            ? "bg-[var(--color-primary)] text-white border-blue-600"
                            : "bg-[var(--color-card)] text-[var(--color-foreground)] border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                        }`}
                      >
                        {months === 12
                          ? t("year")
                          : t("months", { count: months })}
                      </button>
                    ))}
                    <button
                      onClick={() => setExpirationMode("lifetime")}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        expirationMode === "lifetime"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-[var(--color-card)] text-[var(--color-foreground)] border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                      }`}
                    >
                      <InfinityIcon className="w-3 h-3" />
                      {t("lifetime")}{" "}
                    </button>
                    <button
                      onClick={() => setExpirationMode("custom")}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        expirationMode === "custom"
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-[var(--color-card)] text-[var(--color-foreground)] border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                      }`}
                    >
                      <CalendarDays className="w-3 h-3" />
                      {t("custom")}{" "}
                    </button>
                  </div>
                  {expirationMode === "custom" && (
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                  {expirationMode === "preset" && (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {t("expiresOn")} {format.date(addMonthsIso(presetMonths))}
                    </p>
                  )}
                  {expirationMode === "lifetime" && (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {t("noExpirationAccessNeverLapses")}
                    </p>
                  )}
                </div>

                {grantedCourses.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                      {t("turmasOptionalPerCourse")}{" "}
                    </label>
                    <div className="space-y-2 rounded-lg border border-dashed border-[var(--color-border)] p-3">
                      {grantedCourses.map((course) => {
                        const courseCohorts = cohortsByCourse[course.id] ?? [];
                        return (
                          <div
                            key={course.id}
                            className="flex items-center gap-3"
                          >
                            <span className="text-xs font-medium text-[var(--color-foreground)] flex-1 truncate">
                              {course.name}
                            </span>
                            {courseCohorts.length === 0 ? (
                              <span className="text-xs text-[var(--color-muted-foreground)] italic">
                                {t("noTurmas")}{" "}
                              </span>
                            ) : (
                              <select
                                value={cohortPicks[course.id] ?? ""}
                                onChange={(e) =>
                                  setCohortPicks((prev) => ({
                                    ...prev,
                                    [course.id]: e.target.value,
                                  }))
                                }
                                className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs max-w-[55%]"
                              >
                                <option value="">{t("noTurma")}</option>
                                {courseCohorts.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleEnroll}
                  disabled={!canEnroll || isPending}
                  className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-colors"
                >
                  {isPending ? t("granting") : t("grantAccess")}
                </button>

                {statusMsg && (
                  <div
                    className={`flex items-start gap-2 text-xs ${
                      statusMsg.type === "ok"
                        ? "text-green-700"
                        : "text-red-600"
                    }`}
                  >
                    {statusMsg.type === "ok" && (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <span>{statusMsg.text}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <EnrollmentGroup
                  label={t("active")}
                  pillClass="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                  items={activeEnrollments}
                  onToggle={handleToggleEnrollment}
                  isPending={isPending}
                />
                <EnrollmentGroup
                  label={t("expired")}
                  pillClass="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                  items={expiredEnrollments}
                  onToggle={handleToggleEnrollment}
                  isPending={isPending}
                />
                <EnrollmentGroup
                  label={t("deactivated")}
                  pillClass="bg-gray-200 text-[var(--color-foreground)]"
                  items={deactivatedEnrollments}
                  onToggle={handleToggleEnrollment}
                  isPending={isPending}
                />
                {enrollments.length === 0 && (
                  <p className="text-sm text-[var(--color-muted-foreground)] text-center py-4">
                    {t("noEnrollmentsForThisUserYet")}{" "}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EnrollmentGroup({
  label,
  pillClass,
  items,
  onToggle,
  isPending,
}: {
  label: string;
  pillClass: string;
  items: UserEnrollment[];
  onToggle: (id: string, isActive: boolean) => void;
  isPending: boolean;
}) {
  const t = useTranslations("adminAccess");
  const format = useAdminPeopleFormat();
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-2">
        {label} ({items.length})
      </p>
      <div className="space-y-2">
        {items.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between border border-[var(--color-border)] rounded-lg p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-[var(--color-foreground)]">
                  {e.accessLevelName}
                </p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${pillClass}`}
                >
                  {label}
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                {adminValueLabel(t, "sources", e.source)} · {t("enrolled")}{" "}
                {format.date(e.enrolledAt)}
                {e.expiresAt ? (
                  <>
                    {" "}
                    &middot;{" "}
                    <span
                      className={e.isExpired ? "text-red-600 font-medium" : ""}
                    >
                      {e.isExpired ? t("expired") : t("expires")}{" "}
                      {format.date(e.expiresAt)}
                    </span>
                  </>
                ) : (
                  <>
                    {" "}
                    &middot;{" "}
                    <span className="text-indigo-700 font-medium">
                      {t("lifetime")}
                    </span>
                  </>
                )}
              </p>
              {e.cohorts.length > 0 && (
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  {t("turmas")}{" "}
                  {e.cohorts.map((c, i) => (
                    <span key={c.courseId}>
                      {i > 0 && ", "}
                      <span className="text-[var(--color-foreground)]">
                        {c.courseName}
                      </span>
                      {" → "}
                      <span className="font-medium text-[var(--color-foreground)]">
                        {c.cohortName}
                      </span>
                    </span>
                  ))}
                </p>
              )}
            </div>
            <button
              onClick={() => onToggle(e.id, e.isActive)}
              disabled={isPending}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                e.isActive
                  ? "bg-[var(--color-card)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                  : "bg-[var(--color-primary)] text-white hover:brightness-110"
              }`}
            >
              {e.isActive ? t("deactivate") : t("reactivate")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
