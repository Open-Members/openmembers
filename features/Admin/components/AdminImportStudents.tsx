"use client";
import {
  adminPeopleError,
  buildImportErrorCsv,
  buildStudentImportTemplate,
  localizedImportReason,
  localizedImportValue,
  useAdminPeopleFormat,
} from "../people-presentation";
import { useTranslations } from "next-intl";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileText,
  Download,
  Check,
  AlertTriangle,
  XCircle,
  Loader2,
  UserPlus,
  Users,
} from "lucide-react";
import { appToast } from "@/shared/lib/toast";
import { parseCsvRecords } from "@/shared/lib/csv";
import {
  previewBulkImport,
  bulkImportStudents,
  type AdminAccessLevel,
  type ImportRow,
  type ImportRowPreview,
  type BulkImportSummary,
} from "../actions";
import { AdminPageHeader } from "./AdminPageHeader";

type Props = {
  accessLevels: AdminAccessLevel[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "parsed"; raw: string; fileName: string; rows: ImportRow[] }
  | { kind: "previewed"; rows: ImportRow[]; preview: ImportRowPreview[] }
  | { kind: "importing" }
  | { kind: "done"; summary: BulkImportSummary };

const REQUIRED_HEADERS = ["email", "name", "access_level_slug"] as const;

export function AdminImportStudents({ accessLevels }: Props) {
  const t = useTranslations("adminPeople");
  const [failure, setFailure] = useState("");
  const fileVersion = useRef(0);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [defaultSendWelcome, setDefaultSendWelcome] = useState(true);
  const [skipErrorsAndImport, setSkipErrorsAndImport] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const templateUrl = useMemo(() => {
    const csv = buildStudentImportTemplate(accessLevels, {
      primaryEmail: t("examples.primaryStudentEmail"),
      primaryName: t("examples.primaryStudentName"),
      secondaryEmail: t("examples.secondaryStudentEmail"),
      secondaryName: t("examples.secondaryStudentName"),
    });
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [accessLevels, t]);

  function resetAll() {
    fileVersion.current += 1;
    setFailure("");
    setPhase({ kind: "idle" });
    setSkipErrorsAndImport(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(file: File) {
    const version = ++fileVersion.current;
    setFailure("");
    const reader = new FileReader();
    reader.onerror = () => {
      if (version === fileVersion.current) setFailure(t("errors.fileFailed"));
    };
    reader.onload = () => {
      if (version !== fileVersion.current) return;
      const raw = String(reader.result ?? "");
      const { headers, rows } = parseCsvRecords(raw);
      const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        appToast.danger(t("missingColumns", { columns: missing.join(", ") }));
        return;
      }
      if (rows.length === 0) {
        appToast.danger(t("noDataRowsDetectedInTheFile"));
        return;
      }
      const mapped: ImportRow[] = rows.map((r) => ({
        email: r.email ?? "",
        name: r.name ?? "",
        access_level_slug: r.access_level_slug ?? "",
        expiration_date: r.expiration_date,
        cohort_slug: r.cohort_slug,
        send_welcome_email: r.send_welcome_email,
      }));
      setPhase({ kind: "parsed", raw, fileName: file.name, rows: mapped });
    };
    reader.readAsText(file);
  }

  function runPreview() {
    if (phase.kind !== "parsed") return;
    setFailure("");
    startTransition(async () => {
      try {
        const preview = await previewBulkImport(phase.rows);
        setPhase({ kind: "previewed", rows: phase.rows, preview });
      } catch (error) {
        setFailure(adminPeopleError(t, error, "importUnavailable"));
      }
    });
  }

  function runImport() {
    if (phase.kind !== "previewed") return;
    setFailure("");
    setPhase({ kind: "importing" });
    startTransition(async () => {
      try {
        const summary = await bulkImportStudents(phase.rows, {
          defaultSendWelcomeEmail: defaultSendWelcome,
        });
        setPhase({ kind: "done", summary });
      } catch {
        setFailure(t("errors.importInterrupted"));
        setPhase({
          kind: "parsed",
          rows: phase.rows,
          raw: "",
          fileName: "students.csv",
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16">
      {failure && (
        <p role="alert" className="text-sm text-red-600">
          {failure}
        </p>
      )}
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
        title={t("importStudents")}
        description={t("uploadACsvOfStudentsToCreateAccountsAnd")}
        actions={
          <a
            href={templateUrl}
            download="students-template.csv"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
          >
            <Download className="w-4 h-4" />
            {t("downloadTemplate")}{" "}
          </a>
        }
      />

      {/* Step 1 — Upload */}
      {phase.kind === "idle" && (
        <section className="rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-8 py-14 text-center">
          <div
            className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-primary) 12%, transparent)",
              color: "var(--color-primary)",
            }}
          >
            <Upload className="w-7 h-7" />
          </div>
          <h2 className="font-display text-xl font-semibold text-[var(--color-foreground)] mb-1">
            {t("dropYourCsvHere")}{" "}
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-5 max-w-md mx-auto">
            {t("requiredColumns")}{" "}
            <code className="font-mono text-xs">email</code>,{" "}
            <code className="font-mono text-xs">name</code>,{" "}
            <code className="font-mono text-xs">access_level_slug</code>
            {t("optional")}{" "}
            <code className="font-mono text-xs"> expiration_date</code>,
            <code className="font-mono text-xs"> cohort_slug</code>,
            <code className="font-mono text-xs"> send_welcome_email</code>.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <FileText className="w-4 h-4" />
            {t("chooseCsvFile")}{" "}
          </button>
        </section>
      )}

      {/* Step 2 — Parsed */}
      {phase.kind === "parsed" && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FileText className="w-6 h-6 text-[var(--color-primary)] shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-[var(--color-foreground)] truncate">
                {phase.fileName}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t("rowsDetected", { count: phase.rows.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={resetAll}
              disabled={pending}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              {t("chooseAnother")}{" "}
            </button>
            <button
              type="button"
              onClick={runPreview}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("previewRows")}{" "}
            </button>
          </div>
        </section>
      )}

      {/* Step 3 — Preview */}
      {phase.kind === "previewed" && (
        <PreviewStep
          preview={phase.preview}
          defaultSendWelcome={defaultSendWelcome}
          setDefaultSendWelcome={setDefaultSendWelcome}
          skipErrorsAndImport={skipErrorsAndImport}
          setSkipErrorsAndImport={setSkipErrorsAndImport}
          pending={pending}
          onCancel={resetAll}
          onConfirm={runImport}
        />
      )}

      {/* Step 4 — Importing */}
      {phase.kind === "importing" && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-8 py-14 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-[var(--color-primary)]" />
          <h2 className="font-display text-xl font-semibold text-[var(--color-foreground)] mb-1">
            {t("importingStudents")}{" "}
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)] max-w-md mx-auto">
            {t("creatingAccountsEnrollingThemInTheProductAndDispatching")}{" "}
          </p>
        </section>
      )}

      {/* Step 5 — Summary */}
      {phase.kind === "done" && (
        <SummaryStep summary={phase.summary} onReset={resetAll} />
      )}
    </div>
  );
}

/* ─── Preview step ──────────────────────────────────────────────────── */

function PreviewStep({
  preview,
  defaultSendWelcome,
  setDefaultSendWelcome,
  skipErrorsAndImport,
  setSkipErrorsAndImport,
  pending,
  onCancel,
  onConfirm,
}: {
  preview: ImportRowPreview[];
  defaultSendWelcome: boolean;
  setDefaultSendWelcome: (v: boolean) => void;
  skipErrorsAndImport: boolean;
  setSkipErrorsAndImport: (v: boolean) => void;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminPeople");
  const format = useAdminPeopleFormat();
  const counts = preview.reduce(
    (acc, p) => {
      acc[p.status] += 1;
      return acc;
    },
    { valid: 0, existing: 0, error: 0 } as Record<
      ImportRowPreview["status"],
      number
    >,
  );

  const hasErrors = counts.error > 0;
  const confirmDisabled =
    pending ||
    (hasErrors && !skipErrorsAndImport) ||
    counts.valid + counts.existing === 0;

  return (
    <section className="flex flex-col gap-4">
      {/* Counters */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox
          icon={<Check className="w-4 h-4" />}
          label={t("willCreate")}
          value={counts.valid}
          tone="green"
        />
        <StatBox
          icon={<Users className="w-4 h-4" />}
          label={t("existingEnrolled")}
          value={counts.existing}
          tone="amber"
        />
        <StatBox
          icon={<XCircle className="w-4 h-4" />}
          label={t("errorsLabel")}
          value={counts.error}
          tone="red"
        />
      </div>

      {/* Options */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 flex flex-col gap-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={defaultSendWelcome}
            onChange={setDefaultSendWelcome}
          />
          <span className="flex-1">
            <span className="text-sm font-semibold text-[var(--color-foreground)]">
              {t("sendWelcomeEmailByDefault")}{" "}
            </span>
            <span className="block text-[11px] text-[var(--color-muted-foreground)] mt-0.5">
              {t("welcomeColumnHelp")}
            </span>
          </span>
        </label>
        {hasErrors && (
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={skipErrorsAndImport}
              onChange={setSkipErrorsAndImport}
            />
            <span className="flex-1">
              <span className="text-sm font-semibold text-[var(--color-foreground)]">
                {t("skipErroredRowsAndImportTheRest")}{" "}
              </span>
              <span className="block text-[11px] text-[var(--color-muted-foreground)] mt-0.5">
                {t("skipRows", { count: counts.error })}
              </span>
            </span>
          </label>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-12">#</th>
                <th className="px-3 py-2 text-left">{t("emailMore")}</th>
                <th className="px-3 py-2 text-left">{t("nameMore")}</th>
                <th className="px-3 py-2 text-left">{t("accessLevel")}</th>
                <th className="px-3 py-2 text-left">{t("cohort")}</th>
                <th className="px-3 py-2 text-left">{t("expires")}</th>
                <th className="px-3 py-2 text-left">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => (
                <tr
                  key={format.number(p.rowIndex)}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                >
                  <td className="px-3 py-2 text-[var(--color-muted-foreground)] tabular-nums">
                    {format.number(p.rowIndex)}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-foreground)]">
                    {p.email || "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-foreground)]">
                    {p.name || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {p.accessLevelName ? (
                      <span className="text-[var(--color-foreground)]">
                        {p.accessLevelName}
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-muted-foreground)]">
                    {p.cohortName || "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-muted-foreground)] tabular-nums">
                    {p.expirationDate
                      ? format.civilDate(p.expirationDate)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      status={p.status}
                      reason={
                        p.status === "error"
                          ? localizedImportReason(t, p)
                          : null
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          {t("cancel")}{" "}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          <UserPlus className="w-4 h-4" />
          {t("importRows", { count: counts.valid + counts.existing })}
        </button>
      </div>
    </section>
  );
}

/* ─── Summary step ──────────────────────────────────────────────────── */

function SummaryStep({
  summary,
  onReset,
}: {
  summary: BulkImportSummary;
  onReset: () => void;
}) {
  const t = useTranslations("adminPeople");
  const errorCsv = useMemo(() => {
    if (summary.errors.length === 0) return null;
    return `data:text/csv;charset=utf-8,${encodeURIComponent(
      buildImportErrorCsv(t, summary.errors),
    )}`;
  }, [summary.errors, t]);

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-8 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-primary) 14%, transparent)",
            color: "var(--color-primary)",
          }}
        >
          <Check className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--color-foreground)]">
            {t("importFinished")}{" "}
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t("processedRows", { count: summary.totalRows })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatBox
          icon={<UserPlus className="w-4 h-4" />}
          label={t("createdInvited")}
          value={summary.created}
          tone="green"
        />
        <StatBox
          icon={<Users className="w-4 h-4" />}
          label={t("enrolledExisting")}
          value={summary.addedToExisting}
          tone="amber"
        />
        <StatBox
          icon={<XCircle className="w-4 h-4" />}
          label={t("errorsLabel")}
          value={summary.skippedErrors}
          tone="red"
        />
      </div>

      {summary.errors.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {t("errorCount", { count: summary.errors.length })}
            </p>
            {errorCsv && (
              <a
                href={errorCsv}
                download="import-errors.csv"
                className="text-xs font-semibold text-red-700 dark:text-red-300 hover:underline flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                {t("downloadErrorReport")}{" "}
              </a>
            )}
          </div>
          <ul className="text-xs text-[var(--color-muted-foreground)] space-y-0.5 max-h-48 overflow-y-auto">
            {summary.errors.map((e) => (
              <li key={e.rowIndex}>
                <span className="tabular-nums">
                  {t("rowNumber", { row: e.rowIndex })}
                </span>{" "}
                · <span className="font-semibold">
                  {localizedImportValue(t, e.email)}
                </span>:{" "}
                {localizedImportReason(t, e)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/admin/users"
          className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          {t("backToStudents")}{" "}
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <Upload className="w-4 h-4" />
          {t("importAnotherFile")}{" "}
        </button>
      </div>
    </section>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function StatBox({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "green" | "amber" | "red";
}) {
  const format = useAdminPeopleFormat();
  const toneStyle = {
    green: {
      bg: "color-mix(in oklab, #10b981 12%, transparent)",
      color: "#10b981",
    },
    amber: {
      bg: "color-mix(in oklab, #f59e0b 14%, transparent)",
      color: "#f59e0b",
    },
    red: {
      bg: "color-mix(in oklab, #ef4444 12%, transparent)",
      color: "#ef4444",
    },
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
        style={{ backgroundColor: toneStyle.bg, color: toneStyle.color }}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold text-[var(--color-foreground)] tabular-nums">
        {format.number(value)}
      </p>
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
    </div>
  );
}

function StatusPill({
  status,
  reason,
}: {
  status: ImportRowPreview["status"];
  reason: string | null;
}) {
  const t = useTranslations("adminPeople");
  if (status === "valid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        <Check className="w-3 h-3" />
        {t("willCreate")}{" "}
      </span>
    );
  }
  if (status === "existing") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        title={t("userAlreadyExistsWillGetTheNewEnrollmentAdded")}
      >
        <Users className="w-3 h-3" />
        {t("existing")}{" "}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      title={reason ?? t("error")}
    >
      <XCircle className="w-3 h-3" />
      {reason
        ? reason.length > 30
          ? reason.slice(0, 30) + "…"
          : reason
        : t("error")}
    </span>
  );
}

function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
        checked ? "border-transparent" : "border-[var(--color-border)]"
      }`}
      style={{
        backgroundColor: checked ? "var(--color-primary)" : "transparent",
      }}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </button>
  );
}
