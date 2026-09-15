"use client";
import { adminPeopleError } from "../people-presentation";
import { appToast } from "@/shared/lib/toast";
import { useTranslations } from "next-intl";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Repeat,
  Receipt,
  Info,
  Pencil,
  Search,
  X,
} from "lucide-react";
import {
  getAdminWebhookProductMappings,
  createOfferWithCourses,
  updateOfferWithCourses,
  deleteOfferWithCourses,
  toggleWebhookProductMappingActive,
  type AdminWebhookProductMapping,
  type AdminWebhookConfig,
  type AdminCourseLite,
  type OfferCohortAssignment,
  type OfferSalesMode,
} from "../actions";
import {
  getCohortsForCourses,
  type AdminCohort,
} from "@/features/Cohorts/actions";
import type { WebhookProviderSpec } from "@/lib/webhooks/providers";

export function WebhookProductMappings({
  config,
  courses,
  providerSpec,
  alwaysOpen = false,
}: {
  config: AdminWebhookConfig;
  courses: AdminCourseLite[];
  /** Optional — when present drives labels + placeholders from the registry. */
  providerSpec?: WebhookProviderSpec;
  /** When true, the Offers panel is always expanded (no chevron toggle). */
  alwaysOpen?: boolean;
}) {
  const t = useTranslations("adminAccess");
  const [isOpen, setIsOpen] = useState(alwaysOpen);
  const [mappings, setMappings] = useState<AdminWebhookProductMapping[] | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && mappings === null) {
      startTransition(async () => {
        try {
          const rows = await getAdminWebhookProductMappings(config.id);
          setMappings(rows);
        } catch (error) {
          appToast.danger(adminPeopleError(t, error));
        }
      });
    }
  }, [isOpen, mappings, config.id, t]);

  function reload() {
    startTransition(async () => {
      try {
        const rows = await getAdminWebhookProductMappings(config.id);
        setMappings(rows);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteOfferWithCourses(id);
        if (result.error) {
          appToast.danger(adminPeopleError(t, result.error));
          return;
        }
        if (!result.error) {
          setMappings((prev) => prev?.filter((m) => m.id !== id) ?? null);
        }
        setConfirmDeleteId(null);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      try {
        const result = await toggleWebhookProductMappingActive(id);
        if (!result.success) {
          appToast.danger(adminPeopleError(t, result.error));
          return;
        }
        if (result.success) {
          setMappings(
            (prev) =>
              prev?.map((m) =>
                m.id === id ? { ...m, isActive: result.data!.isActive } : m,
              ) ?? null,
          );
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  const count = mappings?.length ?? null;
  const activeCount = mappings?.filter((m) => m.isActive).length ?? null;

  return (
    <div
      className={
        alwaysOpen ? "" : "mt-4 pt-4 border-t border-[var(--color-border)]"
      }
    >
      {!alwaysOpen && (
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)] hover:text-[var(--color-primary)] transition-colors"
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          {t("offers")}{" "}
          {count !== null && (
            <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
              ({t("mappingCount", { active: activeCount ?? 0, total: count })})
            </span>
          )}
        </button>
      )}

      {alwaysOpen && count !== null && count > 0 && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
          {t("mappingCount", { active: activeCount ?? 0, total: count })}
        </p>
      )}

      {isOpen && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t("eachOfferMapsAGatewayProductToTheCourses")}{" "}
          </p>

          {mappings === null ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("loading")}{" "}
            </div>
          ) : mappings.length === 0 && !showAdd ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] py-4 px-3 text-center">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t("noOffersYetAddOneSoRealSalesDon")}{" "}
              </p>
            </div>
          ) : mappings.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {mappings.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 ${
                    m.isActive ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-base font-bold text-[var(--color-foreground)] truncate">
                        {m.title || (
                          <span className="text-[var(--color-muted-foreground)] italic font-normal">
                            {t("untitledOffer")}{" "}
                          </span>
                        )}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ModeBadge mode={m.salesMode} />
                      {!m.isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          {t("paused")}{" "}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="font-mono text-xs text-[var(--color-muted-foreground)] break-all">
                      {m.externalProductId}
                    </p>

                    {m.courses.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {m.courses.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 text-[11px] font-semibold"
                          >
                            {c.title}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t("noCoursesLinkedBuyersWonTUnlockAnything")}{" "}
                      </p>
                    )}

                    <p className="text-[11px] text-[var(--color-muted-foreground)]">
                      {m.salesMode === "subscription"
                        ? t("accessFollowsTheSubscription")
                        : m.expirationDays
                          ? t("expiresAfterDays", { count: m.expirationDays })
                          : t("lifetimeAccess")}
                    </p>

                    {m.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded bg-[var(--color-muted)] text-[var(--color-muted-foreground)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-[var(--color-border)] flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => handleToggle(m.id)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                    >
                      {m.isActive ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          {t("pause")}{" "}
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          {t("resume")}{" "}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(m.id);
                        setShowAdd(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {t("edit")}{" "}
                    </button>
                    <div className="flex-1" />
                    {confirmDeleteId === m.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-[var(--color-muted-foreground)] mr-1">
                          {t("deleteThisOffer")}{" "}
                        </span>
                        <button
                          onClick={() => handleDelete(m.id)}
                          disabled={isPending}
                          className="rounded-lg bg-red-500 text-white px-2 py-1 text-xs font-bold hover:bg-red-600"
                        >
                          {t("yesDelete")}{" "}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                        >
                          {t("cancel")}{" "}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t("delete")}{" "}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {editingId ? (
            (() => {
              const editing = mappings?.find((m) => m.id === editingId) ?? null;
              if (!editing) return null;
              return (
                <OfferForm
                  provider={config.provider}
                  providerSpec={providerSpec}
                  webhookConfigId={config.id}
                  courses={courses}
                  initial={editing}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    reload();
                  }}
                />
              );
            })()
          ) : showAdd ? (
            <OfferForm
              provider={config.provider}
              providerSpec={providerSpec}
              webhookConfigId={config.id}
              courses={courses}
              onCancel={() => setShowAdd(false)}
              onSaved={() => {
                setShowAdd(false);
                reload();
              }}
            />
          ) : (
            <button
              onClick={() => {
                setShowAdd(true);
                setEditingId(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold hover:bg-[var(--color-muted)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("addOffer")}{" "}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function OfferForm({
  provider,
  providerSpec,
  webhookConfigId,
  courses,
  initial,
  onCancel,
  onSaved,
}: {
  provider: string;
  providerSpec?: WebhookProviderSpec;
  webhookConfigId: string;
  courses: AdminCourseLite[];
  initial?: AdminWebhookProductMapping;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminAccess");
  const [salesMode, setSalesMode] = useState<OfferSalesMode>(
    initial?.salesMode ?? "one_time",
  );
  const [externalProductId, setExternalProductId] = useState(
    initial?.externalProductId ?? "",
  );
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(
    () => initial?.courses.map((c) => c.id) ?? [],
  );
  const [courseSearch, setCourseSearch] = useState("");
  const [cohortByCourse, setCohortByCourse] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const a of initial?.cohortAssignments ?? []) {
        init[a.courseId] = a.cohortId;
      }
      return init;
    },
  );
  const [cohortsByCourse, setCohortsByCourse] = useState<
    Record<string, AdminCohort[]>
  >({});
  const [expirationDays, setExpirationDays] = useState(
    initial?.expirationDays ? String(initial.expirationDays) : "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [tagsInput, setTagsInput] = useState<string>(() =>
    (initial?.tags ?? []).join(", "),
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isEdit = !!initial;

  // Load cohorts whenever the set of selected courses changes. The server
  // helper takes a list of course ids and returns them keyed by course.
  // Always call it — it returns {} for empty input, which naturally clears
  // the map without a synchronous setState inside the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getCohortsForCourses(selectedCourseIds);
      if (!cancelled) setCohortsByCourse(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCourseIds]);

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, courseSearch]);

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((prev) => {
      if (prev.includes(courseId)) {
        // Drop any cohort assignment for a course that was just removed.
        setCohortByCourse((c) => {
          const next = { ...c };
          delete next[courseId];
          return next;
        });
        return prev.filter((id) => id !== courseId);
      }
      return [...prev, courseId];
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!externalProductId.trim()) {
      setError(t("gatewayProductIdIsRequired"));
      return;
    }
    if (selectedCourseIds.length === 0) {
      setError(t("pickAtLeastOneCourseThisOfferGrantsAccess"));
      return;
    }

    const cohortAssignments: OfferCohortAssignment[] = Object.entries(
      cohortByCourse,
    )
      .filter(
        ([courseId, cohortId]) =>
          selectedCourseIds.includes(courseId) && cohortId,
      )
      .map(([courseId, cohortId]) => ({ courseId, cohortId }));

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    startTransition(async () => {
      try {
        const shared = {
          externalProductId,
          title: title.trim() || null,
          salesMode,
          expirationDays:
            salesMode === "subscription"
              ? null
              : expirationDays
                ? parseInt(expirationDays, 10)
                : null,
          courseIds: selectedCourseIds,
          cohortAssignments,
          tags,
        };

        const result = initial
          ? await updateOfferWithCourses(initial.id, shared)
          : await createOfferWithCourses({ webhookConfigId, ...shared });

        if ("error" in result && result.error) {
          setError(adminPeopleError(t, result.error));
        } else {
          if (result.warning) {
            appToast.warning(adminPeopleError(t, result.warning));
          }
          onSaved();
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  const productLabel = t("gatewayProductId");
  const providerId = providerSpec?.id ?? provider;
  const productPlaceholder =
    providerId === "stripe"
      ? "price_1Abc..."
      : providerId === "guru"
        ? "1234567"
        : "sku-premium-annual";
  const productHint = t("productHint");

  const isGeneric = provider === "generic";

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-3 space-y-3"
    >
      {/* Sales mode */}
      <div>
        <label className="block text-xs font-semibold text-[var(--color-foreground)] mb-1.5">
          {t("salesMode")}{" "}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <SalesModeOption
            mode="one_time"
            active={salesMode === "one_time"}
            onPick={() => setSalesMode("one_time")}
          />
          <SalesModeOption
            mode="subscription"
            active={salesMode === "subscription"}
            onPick={() => setSalesMode("subscription")}
          />
        </div>
        {salesMode === "subscription" && (
          <div className="mt-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {t(
                "accessFollowsTheSubscriptionAutomaticallyExtendedOnEachRenewal",
              )}{" "}
              {isGeneric && (
                <>
                  {" "}
                  <strong>{t("note")}</strong>{" "}
                  {t(
                    "theGenericWebhookDoesnTReceiveRenewalCancellationEvents",
                  )}{" "}
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Gateway product ID */}
      <div>
        <label className="block text-xs font-semibold text-[var(--color-foreground)] mb-1">
          {productLabel}
        </label>
        <input
          type="text"
          value={externalProductId}
          onChange={(e) => setExternalProductId(e.target.value)}
          placeholder={productPlaceholder}
          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-mono"
          autoFocus
        />
        <p className="text-xs text-[var(--color-muted-foreground)] mt-1 leading-relaxed">
          {productHint}
        </p>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-[var(--color-foreground)] mb-1">
          {t("offerTitle")}{" "}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("eGPremiumAnnualUkStudents")}
          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
        />
      </div>

      {/* Courses picker */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold text-[var(--color-foreground)]">
            {t("coursesThisOfferUnlocks")}{" "}
          </label>
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            {t("selectedCount", { count: selectedCourseIds.length })}
          </span>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            value={courseSearch}
            onChange={(e) => setCourseSearch(e.target.value)}
            placeholder={t("searchCourses")}
            className="w-full pl-8 pr-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          />
        </div>
        <div className="max-h-56 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
          {filteredCourses.length === 0 ? (
            <p className="p-3 text-xs text-[var(--color-muted-foreground)]">
              {t("noCoursesMatch")}{" "}
            </p>
          ) : (
            filteredCourses.map((c) => {
              const checked = selectedCourseIds.includes(c.id);
              const cohorts = cohortsByCourse[c.id] ?? [];
              return (
                <div key={c.id} className="px-2 py-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCourse(c.id)}
                      className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                    />
                    <span className="flex-1">{c.title}</span>
                  </label>
                  {checked && cohorts.length > 0 && (
                    <div className="mt-1 ml-6 flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)] font-semibold">
                        {t("cohort")}{" "}
                      </span>
                      <select
                        value={cohortByCourse[c.id] ?? ""}
                        onChange={(e) =>
                          setCohortByCourse((prev) => {
                            const next = { ...prev };
                            if (e.target.value) {
                              next[c.id] = e.target.value;
                            } else {
                              delete next[c.id];
                            }
                            return next;
                          })
                        }
                        className="flex-1 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-background)] text-xs"
                      >
                        <option value="">{t("noSpecificCohort")}</option>
                        {cohorts.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {selectedCourseIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {selectedCourseIds.map((id) => {
              const c = courses.find((x) => x.id === id);
              if (!c) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] pl-2 pr-1 py-0.5 text-[11px] font-semibold"
                >
                  {c.title}
                  <button
                    type="button"
                    onClick={() => toggleCourse(id)}
                    className="rounded-full hover:bg-[var(--color-primary)]/20 p-0.5"
                    aria-label={t("removeCourse", { title: c.title })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Expiration — only for one-time */}
      {salesMode === "one_time" && (
        <div>
          <label className="block text-xs font-semibold text-[var(--color-foreground)] mb-1">
            {t("expirationDays")}{" "}
          </label>
          <input
            type="number"
            value={expirationDays}
            onChange={(e) => setExpirationDays(e.target.value)}
            placeholder={t("blankLifetime")}
            min="1"
            className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          />
          <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">
            {t("leaveBlankForLifetimeAccessOtherwiseAccessEndsX")}{" "}
          </p>
        </div>
      )}

      {/* Tags */}
      <div>
        <label className="block text-xs font-semibold text-[var(--color-foreground)] mb-1">
          {t("tags")}{" "}
          <span className="text-[var(--color-muted-foreground)] font-normal">
            {t("adminOnly")}
          </span>
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="launch-2026-q2, uk-students"
          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
        />
        <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">
          {t("commaSeparatedUsedToFilterOffersInTheAdmin")}{" "}
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {isEdit ? t("editingOffer") : t("newOffer")}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-card)] transition-colors"
          >
            {t("cancel")}{" "}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {isPending
              ? t("savingMore")
              : isEdit
                ? t("saveChanges")
                : t("createOffer")}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ModeBadge({ mode }: { mode: OfferSalesMode }) {
  const t = useTranslations("adminAccess");
  if (mode === "subscription") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        <Repeat className="w-2.5 h-2.5" />
        {t("subscription")}{" "}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
      <Receipt className="w-2.5 h-2.5" />
      {t("oneTime")}{" "}
    </span>
  );
}

function SalesModeOption({
  mode,
  active,
  onPick,
}: {
  mode: OfferSalesMode;
  active: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("adminAccess");
  const { Icon, title, subtitle } =
    mode === "subscription"
      ? {
          Icon: Repeat,
          title: t("subscription"),
          subtitle: t("recurringAutoRenews"),
        }
      : {
          Icon: Receipt,
          title: t("oneTime"),
          subtitle: t("singlePaymentLifetimeOrXDays"),
        };
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8"
          : "border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]"
      }`}
    >
      <Icon
        className={`w-4 h-4 mt-0.5 shrink-0 ${
          active
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-muted-foreground)]"
        }`}
      />
      <div className="min-w-0">
        <p
          className={`text-xs font-bold ${
            active
              ? "text-[var(--color-primary)]"
              : "text-[var(--color-foreground)]"
          }`}
        >
          {title}
        </p>
        <p className="text-[10px] text-[var(--color-muted-foreground)] leading-tight">
          {subtitle}
        </p>
      </div>
    </button>
  );
}
