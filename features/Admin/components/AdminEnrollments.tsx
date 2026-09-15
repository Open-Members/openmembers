"use client";
import {
  adminPeopleError,
  adminValueLabel,
  useAdminPeopleFormat,
} from "../people-presentation";
import { appToast } from "@/shared/lib/toast";
import { useTranslations } from "next-intl";

import { useMemo, useState, useTransition, useRef } from "react";
import { Search, UserPlus, Loader2, CheckCircle } from "lucide-react";
import { getAdminEnrollments, searchUserByEmail } from "../actions";
import {
  enrollUser,
  deactivateEnrollment,
  reactivateEnrollment,
} from "@/features/Enrollment/actions";
import type { AdminEnrollment, AdminOfferWithProvider } from "../actions";
import { findProvider } from "@/lib/webhooks/providers";

export function AdminEnrollments({
  initialEnrollments,
  offers,
}: {
  initialEnrollments: AdminEnrollment[];
  offers: AdminOfferWithProvider[];
}) {
  const t = useTranslations("adminAccess");
  const format = useAdminPeopleFormat();
  const [enrollments, setEnrollments] =
    useState<AdminEnrollment[]>(initialEnrollments);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [isPending, startTransition] = useTransition();

  const [enrollEmail, setEnrollEmail] = useState("");
  const searchVersion = useRef(0);
  const [foundUser, setFoundUser] = useState<{
    id: string;
    email: string;
    displayName: string;
  } | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [offerId, setOfferId] = useState("");
  const [enrollExpires, setEnrollExpires] = useState("");
  const [enrollError, setEnrollError] = useState("");
  const [enrollSuccess, setEnrollSuccess] = useState(false);

  const activeOffers = useMemo(
    () => offers.filter((o) => o.isActive),
    [offers],
  );

  function reload() {
    startTransition(async () => {
      try {
        const data = await getAdminEnrollments(filter);
        setEnrollments(data);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleFilterChange(newFilter: "all" | "active" | "inactive") {
    setFilter(newFilter);
    startTransition(async () => {
      try {
        const data = await getAdminEnrollments(newFilter);
        setEnrollments(data);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  async function handleSearchUser() {
    if (!enrollEmail.trim()) return;
    setSearchingUser(true);
    setFoundUser(null);
    setEnrollError("");
    const version = ++searchVersion.current;
    try {
      const user = await searchUserByEmail(enrollEmail.trim());
      if (version !== searchVersion.current) return;
      if (user) setFoundUser(user);
      else setEnrollError(t("noUserFoundWithThatEmail"));
    } catch {
      if (version === searchVersion.current)
        setEnrollError(t("errors.loadFailed"));
    } finally {
      if (version === searchVersion.current) setSearchingUser(false);
    }
  }

  function handleEnroll() {
    if (!foundUser || !offerId) return;
    const offer = activeOffers.find((o) => o.id === offerId);
    if (!offer) return;
    setEnrollError("");
    setEnrollSuccess(false);
    startTransition(async () => {
      try {
        const result = await enrollUser({
          userId: foundUser.id,
          accessLevelId: offer.accessLevelId,
          source: "manual",
          expiresAt: enrollExpires || undefined,
          cohortAssignments: offer.cohortAssignments.map((a) => ({
            courseId: a.courseId,
            cohortId: a.cohortId,
          })),
        });
        if (result && "error" in result && result.error) {
          setEnrollError(adminPeopleError(t, result.error));
        } else {
          setEnrollSuccess(true);
          setFoundUser(null);
          setEnrollEmail("");
          setOfferId("");
          setEnrollExpires("");
          reload();
          setTimeout(() => setEnrollSuccess(false), 3000);
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleToggle(enrollmentId: string, isActive: boolean) {
    startTransition(async () => {
      try {
        const result = isActive
          ? await deactivateEnrollment(enrollmentId)
          : await reactivateEnrollment(enrollmentId);
        if (!result.success) {
          setEnrollError(adminPeopleError(t, result.error));
          return;
        }
        reload();
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
          {t("enrollments")}{" "}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          {t("grantAStudentAccessManuallyByPickingAnExisting")}{" "}
        </p>
      </div>

      {/* Manual enrollment form */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
        <h2 className="font-bold text-[var(--color-foreground)] flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[var(--color-primary)]" />
          {t("manualEnrollment")}{" "}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1 block">
              {t("userEmail")}{" "}
            </label>
            <div className="flex gap-2">
              <input
                value={enrollEmail}
                onChange={(e) => {
                  searchVersion.current += 1;
                  setSearchingUser(false);
                  setEnrollEmail(e.target.value);
                  setFoundUser(null);
                  setEnrollError("");
                }}
                placeholder="user@example.com"
                className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <button
                aria-label={t("search")}
                onClick={handleSearchUser}
                disabled={!enrollEmail.trim() || searchingUser}
                className="px-3 py-2 rounded-lg bg-[var(--color-muted)] text-[var(--color-foreground)] text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {searchingUser ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </div>
            {foundUser && (
              <p className="text-xs text-green-600 mt-1 font-medium">
                {t("foundUser", {
                  name: foundUser.displayName,
                  email: foundUser.email,
                })}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1 block">
              {t("offer")}{" "}
            </label>
            <select
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t("selectAnOffer")}</option>
              {activeOffers.map((o) => {
                const provider = findProvider(o.providerId);
                return (
                  <option key={o.id} value={o.id}>
                    {provider?.id === "generic"
                      ? t("genericProvider")
                      : (provider?.name ?? o.providerId)}{" "}
                    ·{" "}
                    {o.title || o.externalProductId}
                  </option>
                );
              })}
            </select>
            {activeOffers.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                {t("noActiveOffersCreateOneUnderOffersFirst")}{" "}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1 block">
              {t("expirationDateOptional")}{" "}
            </label>
            <input
              type="date"
              value={enrollExpires}
              onChange={(e) => setEnrollExpires(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">
              {t("overridesTheOfferSOwnExpirationLeaveBlankTo")}{" "}
            </p>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleEnroll}
              disabled={!foundUser || !offerId || isPending}
              className="w-full px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {isPending ? t("enrolling") : t("enrollUser")}
            </button>
          </div>
        </div>

        {enrollError && (
          <p className="text-sm text-red-500 font-medium">{enrollError}</p>
        )}
        {enrollSuccess && (
          <p className="text-sm text-green-600 font-medium flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            {t("enrollmentCreatedSuccessfully")}{" "}
          </p>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[var(--color-muted)] rounded-lg p-1 w-fit">
        {(["all", "active", "inactive"] as const).map((f) => (
          <button
            key={f}
            onClick={() => handleFilterChange(f)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all capitalize ${
              filter === f
                ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Enrollments table */}
      <div className="bg-[var(--color-card)] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
        {enrollments.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            {t("noEnrollmentsFound")}{" "}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t("student")}</th>
                  <th className="px-4 py-3 text-left">{t("offer")}</th>
                  <th className="px-4 py-3 text-left">{t("source")}</th>
                  <th className="px-4 py-3 text-left">{t("enrolled")}</th>
                  <th className="px-4 py-3 text-left">{t("expires")}</th>
                  <th className="px-4 py-3 text-center">{t("status")}</th>
                  <th className="px-4 py-3 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-[var(--color-foreground)]">
                          {e.userDisplayName}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {e.userEmail}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-foreground)]">
                      {e.accessLevelName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-[var(--color-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-foreground)]">
                        {adminValueLabel(t, "sources", e.source)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)] text-xs">
                      {format.date(e.enrolledAt)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)] text-xs">
                      {e.expiresAt ? format.date(e.expiresAt) : t("never")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          e.isActive
                            ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                            : "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                        }`}
                      >
                        {e.isActive ? t("active") : t("inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggle(e.id, e.isActive)}
                        disabled={isPending}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          e.isActive
                            ? "text-red-600 hover:bg-red-50"
                            : "text-green-600 hover:bg-green-50"
                        }`}
                      >
                        {e.isActive ? t("deactivate") : t("reactivate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
