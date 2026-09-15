"use client";
import { adminPeopleError } from "../people-presentation";
import { useTranslations } from "next-intl";

import { useEffect, useMemo, useState, useTransition } from "react";
import { X, Loader2, UserPlus, Info, Check } from "lucide-react";
import { appToast } from "@/shared/lib/toast";
import {
  inviteStudentManually,
  getAdminAccessLevels,
  type AdminAccessLevel,
} from "../actions";
import {
  getCohortsForCourses,
  type AdminCohort,
} from "@/features/Cohorts/actions";

type Props = {
  onClose: () => void;
  onAdded: () => void;
};

type FlatCohort = AdminCohort & { courseTitle: string };

export function AdminAddUserDialog({ onClose, onAdded }: Props) {
  const t = useTranslations("adminPeople");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [accessLevelId, setAccessLevelId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const [levels, setLevels] = useState<AdminAccessLevel[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [cohorts, setCohorts] = useState<FlatCohort[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(false);

  // Load access levels once.
  useEffect(() => {
    let cancelled = false;
    getAdminAccessLevels()
      .then((data) => {
        if (cancelled) return;
        setLevels(data);
        if (data.length > 0 && !accessLevelId) {
          setAccessLevelId(data[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("errors.loadFailed"));
      })
      .finally(() => !cancelled && setLevelsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload cohorts whenever the access level changes.
  const currentLevel = levels.find((l) => l.id === accessLevelId);
  const currentCourseIds = currentLevel?.courseIds ?? [];
  const currentCourseTitles = useMemo(() => {
    const map = new Map<string, string>();
    (currentLevel?.courseIds ?? []).forEach((id, i) => {
      map.set(id, currentLevel?.courseNames[i] ?? "");
    });
    return map;
  }, [currentLevel]);

  useEffect(() => {
    if (currentCourseIds.length === 0) {
      setCohorts([]);
      setCohortId("");
      return;
    }
    setCohortsLoading(true);
    let cancelled = false;
    getCohortsForCourses(currentCourseIds)
      .then((grouped) => {
        if (cancelled) return;
        const flat: FlatCohort[] = [];
        for (const [courseId, list] of Object.entries(grouped)) {
          for (const c of list) {
            flat.push({
              ...c,
              courseTitle: currentCourseTitles.get(courseId) ?? t("course"),
            });
          }
        }
        setCohorts(flat);
        // Reset picked cohort if no longer valid.
        if (cohortId && !flat.find((c) => c.id === cohortId)) {
          setCohortId("");
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("errors.loadFailed"));
      })
      .finally(() => !cancelled && setCohortsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLevelId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !name.trim()) {
      setError(t("fillEmailAndName"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("errors.invalidEmail"));
      return;
    }
    if (!accessLevelId) {
      setError(t("pickAnAccessLevel"));
      return;
    }

    startTransition(async () => {
      try {
        const result = await inviteStudentManually({
          email: email.trim(),
          name: name.trim(),
          accessLevelId,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          cohortId: cohortId || null,
          sendWelcomeEmail,
        });
        if ("error" in result) {
          setError(adminPeopleError(t, result.error));
          return;
        }

        const message = result.invited
          ? t("studentInvitedWelcomeEmailSent")
          : result.userExisted
            ? t("enrollmentAddedToExistingStudent")
            : t("studentCreated");
        appToast.success(message);
        onAdded();
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <form
        noValidate
        onSubmit={submit}
        className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="font-bold text-[var(--color-foreground)]">
              {t("addStudent")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-muted)]"
            aria-label={t("close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label={t("name")}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder={t("examples.primaryStudentName")}
              className="input"
              required
            />
          </Field>

          <Field label={t("email")}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("examples.primaryStudentEmail")}
              className="input"
              required
            />
          </Field>

          <Field label={t("accessLevelProduct")}>
            {levelsLoading ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t("loading")}
              </p>
            ) : levels.length === 0 ? (
              <p className="text-xs text-red-500">
                {t("noAccessLevelsExistCreateOneUnderProductsFirst")}{" "}
              </p>
            ) : (
              <select
                value={accessLevelId}
                onChange={(e) => setAccessLevelId(e.target.value)}
                className="input"
                required
              >
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} (
                    {t("courseCount", { count: l.courseNames.length })})
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("expirationDateOptional")}>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input"
              />
              <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">
                {t("emptyLifetimeAccess")}{" "}
              </p>
            </Field>

            <Field label={t("cohortOptional")}>
              {cohortsLoading ? (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {t("loading")}
                </p>
              ) : cohorts.length === 0 ? (
                <p className="text-[11px] text-[var(--color-muted-foreground)] mt-2">
                  {t("noCohortsAvailableForThisProduct")}{" "}
                </p>
              ) : (
                <select
                  value={cohortId}
                  onChange={(e) => setCohortId(e.target.value)}
                  className="input"
                >
                  <option value="">{t("noCohort")}</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.courseTitle}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          {/* Send welcome email */}
          <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-3 cursor-pointer">
            <span
              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                sendWelcomeEmail
                  ? "border-transparent"
                  : "border-[var(--color-border)]"
              }`}
              style={{
                backgroundColor: sendWelcomeEmail
                  ? "var(--color-primary)"
                  : "transparent",
              }}
              aria-hidden
            >
              {sendWelcomeEmail && <Check className="w-3 h-3 text-white" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-[var(--color-foreground)]">
                {t("sendWelcomeEmail")}{" "}
              </span>
              <span className="block text-[11px] text-[var(--color-muted-foreground)] leading-relaxed mt-0.5">
                {t("newStudentsReceiveATemporaryPasswordByEmailAnd")}{" "}
              </span>
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={sendWelcomeEmail}
              onChange={(e) => setSendWelcomeEmail(e.target.checked)}
            />
          </label>

          <div className="flex items-start gap-2 text-[11px] text-[var(--color-muted-foreground)]">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>{t("ifTheEmailAlreadyExistsTheStudentWillReceive")} </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            disabled={pending || levelsLoading || cohortsLoading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            {t("cancel")}{" "}
          </button>
          <button
            type="submit"
            disabled={pending || levels.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("addStudent")}{" "}
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
