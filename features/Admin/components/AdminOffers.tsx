"use client";
import { adminPeopleError } from "../people-presentation";
import { appToast } from "@/shared/lib/toast";
import { useTranslations } from "next-intl";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2, Search, Plug } from "lucide-react";
import {
  deleteOfferWithCourses,
  getAllOffers,
  toggleWebhookProductMappingActive,
  type AdminOfferWithProvider,
  type AdminWebhookConfig,
  type AdminCourseLite,
} from "../actions";
import {
  WEBHOOK_PROVIDERS,
  findProvider,
  type WebhookProviderSpec,
} from "@/lib/webhooks/providers";
import { ModeBadge, OfferForm } from "./WebhookProductMappings";
import Link from "next/link";

type FormTarget =
  | {
      mode: "create";
      config: AdminWebhookConfig;
      provider: WebhookProviderSpec;
    }
  | { mode: "edit"; offer: AdminOfferWithProvider };

export function AdminOffers({
  initialOffers,
  configs,
  courses,
}: {
  initialOffers: AdminOfferWithProvider[];
  configs: AdminWebhookConfig[];
  courses: AdminCourseLite[];
}) {
  const t = useTranslations("adminAccess");
  const [offers, setOffers] = useState<AdminOfferWithProvider[]>(initialOffers);
  const [isPending, startTransition] = useTransition();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [showProviderPicker, setShowProviderPicker] = useState(false);

  // Build an index: providerId → config. If there's more than one config for
  // the same provider we pick the first — the UI flow assumes one config per
  // provider today. When multi-config lands we'll let the admin choose.
  const configByProvider = useMemo(() => {
    const map = new Map<string, AdminWebhookConfig>();
    for (const c of configs) {
      if (!map.has(c.provider)) map.set(c.provider, c);
    }
    return map;
  }, [configs]);

  function reload() {
    startTransition(async () => {
      try {
        const rows = await getAllOffers();
        setOffers(rows);
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
          setOffers((prev) => prev.filter((o) => o.id !== id));
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
          setOffers((prev) =>
            prev.map((o) =>
              o.id === id ? { ...o, isActive: result.data!.isActive } : o,
            ),
          );
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offers.filter((o) => {
      if (providerFilter !== "all" && o.providerId !== providerFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (o.title ?? "").toLowerCase().includes(q) ||
        o.externalProductId.toLowerCase().includes(q) ||
        o.courses.some((c) => c.title.toLowerCase().includes(q)) ||
        o.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [offers, search, providerFilter]);

  // Provider filter chips — only show providers that actually have offers.
  const visibleProviders = useMemo(() => {
    const seen = new Set<string>();
    for (const o of offers) seen.add(o.providerId);
    return WEBHOOK_PROVIDERS.filter((p) => seen.has(p.id));
  }, [offers]);

  const hasAnyConfig = configs.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            {t("offers")}{" "}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            {t("everyOfferAcrossEveryConnectedProviderEachOneMaps")}{" "}
          </p>
        </div>
        {hasAnyConfig ? (
          <button
            onClick={() => setShowProviderPicker(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <Plus className="w-4 h-4" />
            {t("addOffer")}{" "}
          </button>
        ) : (
          <Link
            href="/admin/integrations"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <Plug className="w-4 h-4" />
            {t("connectAProviderFirst")}{" "}
          </Link>
        )}
      </div>

      {/* Filters */}
      {offers.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchTitleProductIdCourseOrTag")}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
            />
          </div>
          {visibleProviders.length > 1 && (
            <div className="flex items-center gap-1 bg-[var(--color-muted)] rounded-lg p-1">
              <button
                onClick={() => setProviderFilter("all")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  providerFilter === "all"
                    ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)]"
                }`}
              >
                {t("all")}{" "}
              </button>
              {visibleProviders.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProviderFilter(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                    providerFilter === p.id
                      ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                      : "text-[var(--color-muted-foreground)]"
                  }`}
                >
                  <Image
                    src={p.logoPath}
                    alt=""
                    width={14}
                    height={14}
                    className="object-contain"
                  />
                  {p.id === "generic" ? t("genericProvider") : p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {offers.length === 0
              ? hasAnyConfig
                ? t("noOffersYetAddOneSoRealSalesDonMore")
                : t("connectAPaymentProviderUnderIntegrationsToStartAdding")
              : t("noOffersMatchThoseFilters")}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((o) => {
            const provider = findProvider(o.providerId);
            return (
              <li
                key={o.id}
                className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 ${
                  o.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  {provider && (
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-muted)] flex items-center justify-center">
                      <Image
                        src={provider.logoPath}
                        alt={
                          provider.id === "generic"
                            ? t("genericProvider")
                            : provider.name
                        }
                        width={24}
                        height={24}
                        className="object-contain"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-[var(--color-foreground)] truncate">
                          {o.title || (
                            <span className="text-[var(--color-muted-foreground)] italic font-normal">
                              {t("untitledOffer")}{" "}
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mt-0.5">
                          {provider?.id === "generic"
                            ? t("genericProvider")
                            : (provider?.name ?? o.providerId)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ModeBadge mode={o.salesMode} />
                        {!o.isActive && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            {t("paused")}{" "}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="font-mono text-xs text-[var(--color-muted-foreground)] break-all mb-2">
                      {o.externalProductId}
                    </p>

                    {o.courses.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {o.courses.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 text-[11px] font-semibold"
                          >
                            {c.title}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                        {t("noCoursesLinked")}{" "}
                      </p>
                    )}

                    <p className="text-[11px] text-[var(--color-muted-foreground)]">
                      {o.salesMode === "subscription"
                        ? t("accessFollowsTheSubscription")
                        : o.expirationDays
                          ? t("expiresAfterDays", { count: o.expirationDays })
                          : t("lifetimeAccess")}
                    </p>

                    {o.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {o.tags.map((t) => (
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
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => handleToggle(o.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
                  >
                    {o.isActive ? (
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
                    onClick={() => setTarget({ mode: "edit", offer: o })}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t("edit")}{" "}
                  </button>
                  <div className="flex-1" />
                  {confirmDeleteId === o.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-muted-foreground)] mr-1">
                        {t("deleteThisOffer")}{" "}
                      </span>
                      <button
                        onClick={() => handleDelete(o.id)}
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
                      onClick={() => setConfirmDeleteId(o.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t("delete")}{" "}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Provider picker for "Add offer" — admin chooses which connected
          gateway the new offer belongs to. */}
      {showProviderPicker && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowProviderPicker(false)}
        >
          <div
            className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-1">{t("whichProvider")}</h3>
            <p className="text-xs text-[var(--color-muted-foreground)] mb-3">
              {t("pickTheGatewayWhereThePurchaseWillComeIn")}{" "}
            </p>
            <div className="space-y-2">
              {configs.map((c) => {
                const provider = findProvider(c.provider);
                if (!provider) return null;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setTarget({ mode: "create", config: c, provider });
                      setShowProviderPicker(false);
                    }}
                    className="w-full flex items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left hover:bg-[var(--color-muted)] transition-colors"
                  >
                    <Image
                      src={provider.logoPath}
                      alt=""
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">
                        {provider.id === "generic"
                          ? t("genericProvider")
                          : provider.name}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted-foreground)]">
                        {c.name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowProviderPicker(false)}
              className="mt-3 text-xs font-semibold text-[var(--color-muted-foreground)] hover:underline"
            >
              {t("cancel")}{" "}
            </button>
          </div>
        </div>
      )}

      {/* Inline form — slides in below the list for create + edit. */}
      {target && (
        <div className="rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] p-4">
          <h3 className="text-sm font-bold mb-3">
            {target.mode === "create" ? t("newOffer") : t("editOffer")}
          </h3>
          <OfferForm
            provider={
              target.mode === "create"
                ? target.provider.id
                : target.offer.providerId
            }
            providerSpec={
              target.mode === "create"
                ? target.provider
                : findProvider(target.offer.providerId)
            }
            webhookConfigId={
              target.mode === "create"
                ? target.config.id
                : (configByProvider.get(target.offer.providerId)?.id ??
                  target.offer.webhookConfigId)
            }
            courses={courses}
            initial={target.mode === "edit" ? target.offer : undefined}
            onCancel={() => setTarget(null)}
            onSaved={() => {
              setTarget(null);
              reload();
            }}
          />
        </div>
      )}
    </div>
  );
}
