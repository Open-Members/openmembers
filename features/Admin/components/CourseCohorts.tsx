"use client";
import { adminPeopleError, useAdminPeopleFormat } from "../people-presentation";
import { appToast } from "@/shared/lib/toast";
import { useTranslations } from "next-intl";

import { useEffect, useState, useTransition } from "react";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  GraduationCap,
  Users,
  Calendar,
  Loader2,
} from "lucide-react";
import {
  getAdminCohorts,
  createCohort,
  updateCohort,
  deleteCohort,
  type AdminCohort,
} from "@/features/Cohorts/actions";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function CohortDialog({
  courseId,
  initial,
  onClose,
  onSaved,
}: {
  courseId: string;
  initial?: AdminCohort;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminAccess");
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setName(value);
    if (!initial) setSlug(slugify(value));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("nameIsRequired"));
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setError(t("errors.invalidDateRange"));
      return;
    }
    startTransition(async () => {
      try {
        const payload = {
          name: name.trim(),
          slug: slug || slugify(name),
          description: description.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        };
        const result = initial
          ? await updateCohort({ id: initial.id, ...payload })
          : await createCohort({ courseId, ...payload });

        if (result && "error" in result && result.error) {
          setError(adminPeopleError(t, result.error));
        } else {
          onSaved();
          onClose();
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-foreground)]">
            {initial ? t("editCohort") : t("createCohort")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="p-2 rounded-xl hover:bg-[var(--color-muted)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          <div>
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
              {t("name")}{" "}
            </label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t("eGTurmaAMarO2026")}
              className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
              {t("slug")}{" "}
            </label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
              {t("description")}{" "}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("optionalNotesScheduleCohortFocusEtc")}
              className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
                {t("startDate")}{" "}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5 block">
                {t("endDate")}{" "}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] transition-colors"
            >
              {t("cancel")}{" "}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-4 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-colors"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {isPending
                ? t("saving")
                : initial
                  ? t("saveChanges")
                  : t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Per-course cohort manager, rendered as a section inside the course
 * editor. Loads cohorts client-side on mount to avoid plumbing them
 * through getCourseContent — the editor is already a client component
 * and this section is below-the-fold.
 */
export function CourseCohorts({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const t = useTranslations("adminAccess");
  const format = useAdminPeopleFormat();
  const [loadFailed, setLoadFailed] = useState(false);
  const [cohorts, setCohorts] = useState<AdminCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<AdminCohort | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminCohorts(courseId)
      .then((data) => {
        if (!cancelled) {
          setCohorts(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  function reload() {
    startTransition(async () => {
      try {
        const data = await getAdminCohorts(courseId);
        setCohorts(data);
        setLoadFailed(false);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleEdit(c: AdminCohort) {
    setEditing(c);
    setShowDialog(true);
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteCohort(id);
        if (!result.success) {
          appToast.danger(adminPeopleError(t, result.error));
          return;
        }
        setCohorts((prev) => prev.filter((c) => c.id !== id));
        setDeletingId(null);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-muted)]/30 gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-[var(--color-foreground)]">
            <GraduationCap className="w-4 h-4 text-[var(--color-primary)]" />
            {t("turmasMore")}{" "}
          </h2>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
            {t("cohortsDescription", { course: courseTitle })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(undefined);
            setShowDialog(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <Plus className="w-3.5 h-3.5" />
          {t("addTurma")}{" "}
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : loadFailed ? (
          <p role="alert">
            {t("errors.loadFailed")}{" "}
            <button onClick={reload}>{t("retry")}</button>
          </p>
        ) : cohorts.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)] text-center py-6">
            {t("noTurmasYetForThisCourse")}{" "}
          </p>
        ) : (
          <div className="space-y-2">
            {cohorts.map((c) => {
              const start = c.startDate ? format.civilDate(c.startDate) : null;
              const end = c.endDate ? format.civilDate(c.endDate) : null;
              return (
                <div
                  key={c.id}
                  className="flex items-start justify-between border border-[var(--color-border)] rounded-lg p-3 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[var(--color-foreground)]">
                        {c.name}
                      </p>
                      <span className="text-xs font-mono text-[var(--color-muted-foreground)]">
                        /{c.slug}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                        {c.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)] mt-1 flex-wrap">
                      {(start || end) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {start && end
                            ? `${start} → ${end}`
                            : start
                              ? t("fromDate", { date: start! })
                              : t("untilDate", { date: end! })}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {t("enrolledCount", { count: c.enrollmentCount })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(c)}
                      title={t("edit")}
                      className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {deletingId === c.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          disabled={isPending}
                          className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                        >
                          {t("confirm")}{" "}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="px-2 py-1 rounded-lg text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                        >
                          {t("cancel")}{" "}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(c.id)}
                        title={t("delete")}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showDialog && (
        <CohortDialog
          courseId={courseId}
          initial={editing}
          onClose={() => {
            setShowDialog(false);
            setEditing(undefined);
          }}
          onSaved={reload}
        />
      )}
    </section>
  );
}
