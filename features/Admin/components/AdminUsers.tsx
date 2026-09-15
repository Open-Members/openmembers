"use client";
import {
  adminPeopleError,
  adminValueLabel,
  useAdminPeopleFormat,
} from "../people-presentation";
import { useTranslations } from "next-intl";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  ShieldOff,
  Trash2,
  RotateCcw,
  UserPlus,
  Loader2,
  X,
  KeyRound,
  Mail,
  Copy,
  Check,
  Upload,
  SlidersHorizontal,
  Wand2,
} from "lucide-react";
import { appToast } from "@/shared/lib/toast";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminAddUserDialog } from "./AdminAddUserDialog";
import { UserEnrollmentsPanel } from "./UserEnrollmentsPanel";
import { AdminCsvDownloadButton } from "./AdminCsvDownloadButton";
import {
  getAdminStudents,
  updateUserRole,
  suspendUser,
  restoreUser,
  deleteUser,
  adminSendPasswordResetEmail,
  adminSetTemporaryPassword,
  adminSendMagicLink,
  adminGenerateMagicLink,
} from "../actions";
import type {
  AdminUser,
  AdminStudentsPage,
  AdminAccessLevel,
  StudentInactivityFilter,
  StudentRoleFilter,
  StudentStatusFilter,
  StudentJoinedFilter,
  StudentSourceFilter,
  AdminStudentFilters,
} from "../actions";
import type { UserRole } from "@/shared/types/interfaces";

// Tiny local copy — same fn lives inside UserEnrollmentsPanel.
// Keeping a duplicate here avoids a circular import for the table-row
// dates that don't otherwise need anything from the panel module.

const ROLE_COLOURS: Record<UserRole, string> = {
  user: "bg-[var(--color-muted)] text-[var(--color-foreground)]",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  super_admin:
    "bg-indigo-800 text-white dark:bg-indigo-500/25 dark:text-indigo-200",
};

function ConfirmDialog({
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  requireTyping,
}: {
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  requireTyping?: string;
}) {
  const t = useTranslations("adminPeople");
  const [typed, setTyped] = useState("");
  const canConfirm = !requireTyping || typed === requireTyping;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-card)] rounded-2xl shadow-xl p-6 max-w-sm w-full">
        <p className="text-sm font-medium text-[var(--color-foreground)] mb-4">
          {message}
        </p>
        {requireTyping && (
          <div className="mb-4">
            <p className="text-xs text-[var(--color-muted-foreground)] mb-1">
              {t("typedConfirmation", { value: requireTyping })}
            </p>
            <input
              className="w-full border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] transition-colors"
          >
            {t("cancel")}{" "}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 ${
              danger
                ? "bg-red-500 hover:bg-red-600"
                : "bg-[var(--color-primary)] hover:brightness-110"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordResetDialog({
  userId,
  userName,
  userEmail,
  onClose,
}: {
  userId: string;
  userName: string;
  userEmail: string;
  onClose: () => void;
}) {
  const t = useTranslations("adminPeople");
  const [isPending, startTransition] = useTransition();
  const [generated, setGenerated] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleEmailRecovery() {
    startTransition(async () => {
      try {
        const res = await adminSendPasswordResetEmail(userId);
        if ("error" in res) {
          appToast.danger(t("couldNotSend"), adminPeopleError(t, res.error));
          return;
        }
        appToast.success(
          t("recoveryEmailSent"),
          t("deliveredTo", { email: userEmail }),
        );
        onClose();
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleMagicLink() {
    startTransition(async () => {
      try {
        const res = await adminSendMagicLink(userId);
        if ("error" in res) {
          appToast.danger(t("couldNotSend"), adminPeopleError(t, res.error));
          return;
        }
        appToast.success(
          t("magicLoginLinkSent"),
          t("deliveredTo", { email: userEmail }),
        );
        onClose();
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleCopyMagicLink() {
    startTransition(async () => {
      try {
        const res = await adminGenerateMagicLink(userId);
        if ("error" in res) {
          appToast.danger(
            t("couldNotGenerateLink"),
            adminPeopleError(t, res.error),
          );
          return;
        }
        setGeneratedLink(res.link);
        // Copy immediately so one click is enough; the dialog still shows
        // the link with a Copy button in case the clipboard write fails.
        try {
          await navigator.clipboard.writeText(res.link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignored — the visible Copy button is the fallback
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function handleTempPassword() {
    startTransition(async () => {
      try {
        const res = await adminSetTemporaryPassword(userId);
        if ("error" in res) {
          appToast.danger(t("couldNotReset"), adminPeopleError(t, res.error));
          return;
        }
        setGenerated(res.password);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  async function handleCopy() {
    const value = generated ?? generatedLink;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      appToast.danger(t("couldNotCopyToClipboard"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-card)] rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="font-bold text-[var(--color-foreground)]">
              {t("resetPassword")}
            </h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {userName} · {userEmail}
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

        <div className="p-6 space-y-4">
          {generated ? (
            <>
              <p className="text-sm text-[var(--color-foreground)]">
                {t("aTemporaryPasswordHasBeenSetTheUserWill")}{" "}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t("thisIsTheOnlyTimeYouLlSeeIt")}{" "}
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-3">
                <code className="flex-1 font-mono text-base tracking-wider text-[var(--color-foreground)] select-all">
                  {generated}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-background)] transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                      {t("copied")}{" "}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {t("copy")}{" "}
                    </>
                  )}
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:brightness-110 transition-colors"
              >
                {t("done")}{" "}
              </button>
            </>
          ) : generatedLink ? (
            <>
              <p className="text-sm text-[var(--color-foreground)]">
                {t("magicLoginLinkGenerated")}
                {copied ? t("andCopied") : ""}
                {t("sendItToTheStudentHoweverYouLikeClicking")}{" "}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t("oneTimeUseExpiresIn1HourGenerateA")}{" "}
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-3">
                <code className="flex-1 font-mono text-xs break-all text-[var(--color-foreground)] select-all">
                  {generatedLink}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-background)] transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                      {t("copied")}{" "}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {t("copy")}{" "}
                    </>
                  )}
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:brightness-110 transition-colors"
              >
                {t("done")}{" "}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t("pickHowYouWantToResetThePasswordFor")}{" "}
              </p>

              <button
                onClick={handleEmailRecovery}
                disabled={isPending}
                className="w-full flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left hover:bg-[var(--color-muted)] transition-colors disabled:opacity-50"
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] flex items-center justify-center">
                  <Mail className="w-4 h-4 text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">
                    {t("sendRecoveryEmail")}{" "}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    {t("userClicksAOneTimeLinkAndPicksTheir")}{" "}
                  </p>
                </div>
              </button>

              <button
                onClick={handleMagicLink}
                disabled={isPending}
                className="w-full flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left hover:bg-[var(--color-muted)] transition-colors disabled:opacity-50"
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">
                    {t("sendMagicLoginLink")}{" "}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    {t("userClicksTheLinkAndIsSignedInInstantly")}{" "}
                  </p>
                </div>
              </button>

              <button
                onClick={handleCopyMagicLink}
                disabled={isPending}
                className="w-full flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left hover:bg-[var(--color-muted)] transition-colors disabled:opacity-50"
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                  <Copy className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">
                    {t("copyMagicLoginLink")}{" "}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    {t("generatesTheSameOneTimeLinkWithoutEmailingIt")}{" "}
                  </p>
                </div>
              </button>

              <button
                onClick={handleTempPassword}
                disabled={isPending}
                className="w-full flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left hover:bg-[var(--color-muted)] transition-colors disabled:opacity-50"
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">
                    {t("generateTemporaryPassword")}{" "}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    {t("youGetAOneTimePasswordToHandOver")}{" "}
                  </p>
                </div>
              </button>

              {isPending && (
                <div className="flex justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type ResolvedFilters = {
  search: string;
  inactive: StudentInactivityFilter;
  role: StudentRoleFilter;
  status: StudentStatusFilter;
  accessLevelId: string | null;
  joinedSince: StudentJoinedFilter;
  source: StudentSourceFilter;
  page: number;
};

export function AdminUsers({
  initialData,
  initialFilters,
  accessLevels,
}: {
  initialData: AdminStudentsPage;
  initialFilters: ResolvedFilters;
  accessLevels: AdminAccessLevel[];
}) {
  const t = useTranslations("adminPeople");
  const format = useAdminPeopleFormat();
  const [users, setUsers] = useState<AdminUser[]>(initialData.users);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const pageSize = initialData.pageSize;
  const [search, setSearch] = useState(initialFilters.search);
  const [inactive, setInactive] = useState<StudentInactivityFilter>(
    initialFilters.inactive,
  );
  const [role, setRole] = useState<StudentRoleFilter>(initialFilters.role);
  const [status, setStatus] = useState<StudentStatusFilter>(
    initialFilters.status,
  );
  const [accessLevelId, setAccessLevelId] = useState<string | null>(
    initialFilters.accessLevelId,
  );
  const [joinedSince, setJoinedSince] = useState<StudentJoinedFilter>(
    initialFilters.joinedSince,
  );
  const [source, setSource] = useState<StudentSourceFilter>(
    initialFilters.source,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<null | {
    type: "suspend" | "restore" | "delete";
    userId: string;
    userName: string;
  }>(null);
  const [enrollPanel, setEnrollPanel] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [resetPanel, setResetPanel] = useState<{
    userId: string;
    userName: string;
    userEmail: string;
  } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  function currentFilters(): AdminStudentFilters {
    return {
      search,
      inactive,
      role,
      status,
      accessLevelId,
      joinedSince,
      source,
      page,
    };
  }

  // Any filter/search change resets to page 1; only explicit pagination
  // passes its own page. Keeps ?page= and ?q= in the URL so reload/share works.
  const requestVersion = useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );
  function load(override?: Partial<AdminStudentFilters>) {
    const version = ++requestVersion.current;
    setLoadFailed(false);
    setLoading(true);
    const payload = { ...currentFilters(), page: 1, ...override };
    getAdminStudents(payload)
      .then((data) => {
        if (version !== requestVersion.current) return;
        setUsers(data.users);
        setTotal(data.total);
        setPage(data.page);
        setLoading(false);
        const url = new URL(window.location.href);
        if (payload.search) url.searchParams.set("q", payload.search);
        else url.searchParams.delete("q");
        if (data.page > 1) url.searchParams.set("page", String(data.page));
        else url.searchParams.delete("page");
        window.history.replaceState(null, "", url.toString());
      })
      .catch(() => {
        if (version !== requestVersion.current) return;
        setLoadFailed(true);
        setLoading(false);
      });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  function goToPage(next: number) {
    load({ page: next });
  }

  function applyFilter<K extends keyof ResolvedFilters>(
    key: K,
    value: ResolvedFilters[K],
  ) {
    const setters: Record<keyof ResolvedFilters, (v: never) => void> = {
      search: setSearch,
      inactive: setInactive,
      role: setRole,
      status: setStatus,
      accessLevelId: setAccessLevelId,
      joinedSince: setJoinedSince,
      source: setSource,
      page: setPage,
    };
    setters[key](value as never);
    load({ [key]: value } as Partial<AdminStudentFilters>);
  }

  function clearAllFilters() {
    setSearch("");
    setInactive(null);
    setRole("all");
    setStatus("all");
    setAccessLevelId(null);
    setJoinedSince("all");
    setSource("all");
    load({
      search: "",
      inactive: null,
      role: "all",
      status: "all",
      accessLevelId: null,
      joinedSince: "all",
      source: "all",
    });
  }

  const activeFilterCount =
    (inactive ? 1 : 0) +
    (role !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (accessLevelId ? 1 : 0) +
    (joinedSince !== "all" ? 1 : 0) +
    (source !== "all" ? 1 : 0);

  function handleRoleChange(userId: string, newRole: UserRole) {
    const previous = users.find((u) => u.id === userId)?.role;
    if (!previous || previous === newRole) return;
    startTransition(async () => {
      try {
        try {
          await updateUserRole(userId, newRole);
          setUsers((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
          );
          appToast.success(t("roleUpdated"));
        } catch (err) {
          const message = adminPeopleError(t, err);
          appToast.danger(t("couldNotUpdateRole"), message);
        }
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  function executeAction() {
    if (!confirm) return;
    startTransition(async () => {
      try {
        if (confirm.type === "suspend") {
          await suspendUser(confirm.userId);
          setUsers((prev) =>
            prev.map((u) =>
              u.id === confirm.userId ? { ...u, status: "suspended" } : u,
            ),
          );
        } else if (confirm.type === "restore") {
          await restoreUser(confirm.userId);
          setUsers((prev) =>
            prev.map((u) =>
              u.id === confirm.userId ? { ...u, status: "active" } : u,
            ),
          );
        } else if (confirm.type === "delete") {
          await deleteUser(confirm.userId);
          setUsers((prev) => prev.filter((u) => u.id !== confirm.userId));
          setTotal((prev) => Math.max(0, prev - 1));
        }
        setConfirm(null);
      } catch (error) {
        appToast.danger(adminPeopleError(t, error));
      }
    });
  }

  return (
    <div className="max-w-6xl mx-auto w-full">
      <AdminPageHeader
        eyebrow={t("people")}
        title={t("students")}
        description={t("usersDescription", { count: total })}
      />

      {/* Search + Export */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <form
          onSubmit={handleSearch}
          className="flex w-full min-w-0 flex-wrap gap-3"
        >
          <div className="relative w-full min-w-0 max-w-md sm:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchByNameOrEmail")}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-hairline bg-[var(--color-muted)] text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {t("search")}{" "}
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
              filtersOpen || activeFilterCount > 0
                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30"
                : "bg-[var(--color-card)] text-[var(--color-foreground)] border-[var(--color-border)] hover:bg-[var(--color-muted)]"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {t("filters")}{" "}
            {activeFilterCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white"
                aria-label={t("filtersActive", { count: activeFilterCount })}
              >
                {format.number(activeFilterCount)}
              </span>
            )}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setAddDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <UserPlus className="w-4 h-4" />
          {t("addStudent")}{" "}
        </button>
        <Link
          href="/admin/users/import"
          title={t("importManyStudentsFromACsv")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
        >
          <Upload className="w-4 h-4" />
          {t("importCsv")}{" "}
        </Link>
        <AdminCsvDownloadButton
          endpoint="/api/admin/users/export"
          fallbackFileName="users.csv"
          label={t("exportCsv")}
          loadingLabel={t("download.loading")}
          title={t("downloadCsvOfEveryUser")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
          copy={{
            title: t("download.title"),
            unauthenticated: t("download.unauthenticated"),
            accessDenied: t("download.accessDenied"),
            rateLimited: t("download.rateLimited"),
            invalidResponse: t("download.invalidResponse"),
            failed: t("download.failed"),
          }}
        />
      </div>

      {/* Filter panel (collapsible) */}
      {filtersOpen && (
        <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <FilterSelect
            label={t("role")}
            value={role}
            onChange={(v) => applyFilter("role", v as StudentRoleFilter)}
            options={[
              ["all", t("allRoles")],
              ["user", t("student")],
              ["admin", t("admin")],
              ["super_admin", t("superAdminMore")],
            ]}
          />
          <FilterSelect
            label={t("status")}
            value={status}
            onChange={(v) => applyFilter("status", v as StudentStatusFilter)}
            options={[
              ["all", t("allStatuses")],
              ["active", t("active")],
              ["suspended", t("suspended")],
            ]}
          />
          <FilterSelect
            label={t("accessLevel")}
            value={accessLevelId ?? ""}
            onChange={(v) => applyFilter("accessLevelId", v || null)}
            options={[
              ["", t("allProducts")],
              ...accessLevels.map((al) => [al.id, al.name] as [string, string]),
            ]}
          />
          <FilterSelect
            label={t("joined")}
            value={joinedSince}
            onChange={(v) =>
              applyFilter("joinedSince", v as StudentJoinedFilter)
            }
            options={[
              ["all", t("anyTime")],
              ["7d", t("last7Days")],
              ["30d", t("last30Days")],
              ["90d", t("last90Days")],
            ]}
          />
          <FilterSelect
            label={t("lastActivity")}
            value={inactive ?? ""}
            onChange={(v) =>
              applyFilter("inactive", (v || null) as StudentInactivityFilter)
            }
            options={[
              ["", t("anyone")],
              ["inactive_7", t("inactive7Days")],
              ["inactive_30", t("inactive30Days")],
              ["never", t("neverAccessed")],
            ]}
          />
          <FilterSelect
            label={t("source")}
            value={source}
            onChange={(v) => applyFilter("source", v as StudentSourceFilter)}
            options={[
              ["all", t("allSources")],
              ["youtube", "YouTube"],
            ]}
          />
        </div>
      )}

      {/* Active filter pills (always shown when filters are active). */}
      {activeFilterCount > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {role !== "all" && (
            <FilterPill
              label={t("filterValue", {
                label: t("role"),
                value: adminValueLabel(t, "roles", role),
              })}
              onRemove={() => applyFilter("role", "all")}
            />
          )}
          {status !== "all" && (
            <FilterPill
              label={t("filterValue", {
                label: t("status"),
                value: adminValueLabel(t, "statuses", status),
              })}
              onRemove={() => applyFilter("status", "all")}
            />
          )}
          {accessLevelId && (
            <FilterPill
              label={t("filterValue", {
                label: t("accessLevel"),
                value:
                  accessLevels.find((a) => a.id === accessLevelId)?.name ??
                  accessLevelId,
              })}
              onRemove={() => applyFilter("accessLevelId", null)}
            />
          )}
          {joinedSince !== "all" && (
            <FilterPill
              label={t("filterValue", {
                label: t("joined"),
                value:
                  joinedSince === "7d"
                    ? t("last7Days")
                    : joinedSince === "30d"
                      ? t("last30Days")
                      : t("last90Days"),
              })}
              onRemove={() => applyFilter("joinedSince", "all")}
            />
          )}
          {source !== "all" && (
            <FilterPill
              label={t("filterValue", {
                label: t("source"),
                value: adminValueLabel(t, "sources", source),
              })}
              onRemove={() => applyFilter("source", "all")}
            />
          )}
          {inactive && (
            <FilterPill
              label={
                inactive === "never"
                  ? t("neverAccessed")
                  : inactive === "inactive_7"
                    ? t("inactive7Days")
                    : t("inactive30Days")
              }
              onRemove={() => applyFilter("inactive", null)}
            />
          )}
          {activeFilterCount > 1 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] underline underline-offset-2"
            >
              {t("clearAll")}{" "}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--color-card)] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-xl bg-[var(--color-muted)] animate-pulse"
              />
            ))}
          </div>
        ) : loadFailed ? (
          <div role="alert" className="p-6">
            {t("errors.loadFailed")}{" "}
            <button onClick={() => load({ page })}>{t("retry")}</button>
          </div>
        ) : users.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
            {t("noUsersFound")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t("user")}</th>
                  <th className="px-4 py-3 text-left">{t("role")}</th>
                  <th className="px-4 py-3 text-left">{t("status")}</th>
                  <th className="px-4 py-3 text-left">{t("source")}</th>
                  <th className="px-4 py-3 text-center">{t("enrollments")}</th>
                  <th className="px-4 py-3 text-right">{t("lastSignIn")}</th>
                  <th className="px-4 py-3 text-right">{t("joined")}</th>
                  <th className="px-4 py-3 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <a href={`/admin/users/${u.id}`} className="group block">
                        <p className="font-medium text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                          {u.displayName}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {u.email}
                        </p>
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={t("role")}
                        value={u.role}
                        onChange={(e) =>
                          handleRoleChange(u.id, e.target.value as UserRole)
                        }
                        disabled={isPending}
                        className={`text-xs font-medium rounded-full px-3 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${ROLE_COLOURS[u.role]}`}
                      >
                        <option value="user">{t("user")}</option>
                        <option value="admin">{t("admin")}</option>
                        <option value="super_admin">{t("superAdmin")}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium rounded-full px-3 py-1 ${
                          u.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                            : "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                        }`}
                      >
                        {u.status === "active" ? t("active") : t("suspended")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.signupSource ? (
                        <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] text-[var(--color-primary)] capitalize">
                          {adminValueLabel(t, "sources", u.signupSource)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-[var(--color-primary)]">
                      {format.number(u.enrollmentCount)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)] text-xs">
                      {u.lastSignIn ? format.date(u.lastSignIn) : t("never")}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-muted-foreground)] text-xs">
                      {format.date(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title={t("manageEnrollments")}
                          onClick={() =>
                            setEnrollPanel({
                              userId: u.id,
                              userName: u.displayName,
                            })
                          }
                          className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] transition-colors"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                        <button
                          title={t("resetPassword")}
                          onClick={() =>
                            setResetPanel({
                              userId: u.id,
                              userName: u.displayName,
                              userEmail: u.email,
                            })
                          }
                          className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {u.status === "active" ? (
                          <button
                            title={t("suspendUser")}
                            onClick={() =>
                              setConfirm({
                                type: "suspend",
                                userId: u.id,
                                userName: u.displayName,
                              })
                            }
                            className="p-2 rounded-lg text-orange-500 hover:bg-orange-50 transition-colors"
                          >
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            title={t("restoreAccess")}
                            onClick={() =>
                              setConfirm({
                                type: "restore",
                                userId: u.id,
                                userName: u.displayName,
                              })
                            }
                            className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          title={t("deleteUser")}
                          onClick={() =>
                            setConfirm({
                              type: "delete",
                              userId: u.id,
                              userName: u.displayName,
                            })
                          }
                          className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t("showingRange", {
              from: format.number((page - 1) * pageSize + 1),
              to: format.number(Math.min(page * pageSize, total)),
              total: format.number(total),
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loading}
              className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("previous")}{" "}
            </button>
            <span className="text-xs font-semibold text-[var(--color-muted-foreground)] px-1">
              {t("pageOf", {
                page: format.number(page),
                total: format.number(Math.max(1, Math.ceil(total / pageSize))),
              })}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= Math.ceil(total / pageSize) || loading}
              className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("next")}{" "}
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={
            confirm.type === "suspend"
              ? t("confirmSuspend", { name: confirm.userName })
              : confirm.type === "restore"
                ? t("confirmRestore", { name: confirm.userName })
                : t("confirmDelete", { name: confirm.userName })
          }
          confirmLabel={
            confirm.type === "suspend"
              ? t("suspend")
              : confirm.type === "restore"
                ? t("restore")
                : t("delete")
          }
          danger={confirm.type === "suspend" || confirm.type === "delete"}
          requireTyping={
            confirm.type === "delete" ? t("deleteConfirmation") : undefined
          }
          onConfirm={executeAction}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Enrollment management panel */}
      {enrollPanel && (
        <UserEnrollmentsPanel
          userId={enrollPanel.userId}
          userName={enrollPanel.userName}
          onClose={() => setEnrollPanel(null)}
        />
      )}

      {/* Password reset dialog */}
      {resetPanel && (
        <PasswordResetDialog
          userId={resetPanel.userId}
          userName={resetPanel.userName}
          userEmail={resetPanel.userEmail}
          onClose={() => setResetPanel(null)}
        />
      )}

      {addDialogOpen && (
        <AdminAddUserDialog
          onClose={() => setAddDialogOpen(false)}
          onAdded={() => {
            setAddDialogOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 focus:border-transparent"
      >
        {options.map(([v, lbl]) => (
          <option key={v || "__all__"} value={v}>
            {lbl}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  const t = useTranslations("adminPeople");
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 14%, transparent)",
        color: "var(--color-primary)",
      }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:opacity-70"
        aria-label={t("removeFilter", { label })}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
