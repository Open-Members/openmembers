"use client";

import { useLocale, useNow } from "next-intl";
import { useBrowserTimezone } from "@/shared/hooks/useBrowserTimezone";
import { csvRow } from "./csv";
import {
  importReasonRequirements,
  isImportReasonCode,
  type ImportReasonDescriptor,
} from "./import-contract";

type Translator = ((
  key: string,
  values?: Record<string, string | number>,
) => string) & { has(key: string): boolean };

/** Only known, machine-readable failures may select a product message. */
export function adminPeopleError(
  t: Translator,
  error: unknown,
  fallback = "operationFailed",
) {
  const code =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(code) && t.has(`errors.${code}`)
    ? t(`errors.${code}`)
    : t(`errors.${fallback}`);
}

export function adminValueLabel(
  t: Translator,
  kind: "roles" | "statuses" | "sources",
  value: string,
) {
  return /^[a-z_]+$/.test(value) && t.has(`${kind}.${value}`)
    ? t(`${kind}.${value}`)
    : value;
}

export function formatAdminDate(
  iso: string,
  locale: string,
  timeZone: string,
  civil = false,
) {
  const date = new Date(civil ? `${iso.slice(0, 10)}T12:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: civil ? "UTC" : timeZone,
  }).format(date);
}

export function useAdminPeopleFormat() {
  const locale = useLocale();
  const timeZone = useBrowserTimezone() ?? "UTC";
  const now = useNow({ updateInterval: 60_000 });
  return {
    locale,
    timeZone,
    now,
    date: (iso: string) => formatAdminDate(iso, locale, timeZone),
    civilDate: (iso: string) => formatAdminDate(iso, locale, timeZone, true),
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
    relative: (iso: string) => {
      const days = (new Date(iso).getTime() - now.getTime()) / 86_400_000;
      if (!Number.isFinite(days)) return "—";
      const unit =
        Math.abs(days) >= 30
          ? "month"
          : Math.abs(days) >= 1
            ? "day"
            : Math.abs(days * 24) >= 1
              ? "hour"
              : "minute";
      const value =
        unit === "month"
          ? days / 30
          : unit === "day"
            ? days
            : unit === "hour"
              ? days * 24
              : days * 1440;
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
        Math.trunc(value),
        unit,
      );
    },
  };
}

export function localizedImportReason(
  t: Translator,
  row: {
    reasonCode?: string | null;
    reasonValues?: Record<string, string | number>;
  },
) {
  const code = row.reasonCode ?? "";
  if (!isImportReasonCode(code) || !t.has(`errors.${code}`)) {
    return t("errors.operationFailed");
  }

  const values: Record<string, string | number> = {};
  for (const name of importReasonRequirements[code]) {
    const value = row.reasonValues?.[name];
    if (
      typeof value !== "string" &&
      !(typeof value === "number" && Number.isFinite(value))
    ) {
      return t("errors.operationFailed");
    }
    values[name] = value;
  }

  try {
    return t(`errors.${code}`, values);
  } catch {
    return t("errors.operationFailed");
  }
}

export function localizedImportValue(t: Translator, value: string) {
  return value || t("importBlankValue");
}

export function buildImportErrorCsv(
  t: Translator,
  errors: ReadonlyArray<
    ImportReasonDescriptor & { rowIndex: number; email: string }
  >,
) {
  return [
    csvRow(["row_index", "email", "reason"]),
    ...errors.map((error) =>
      csvRow([
        error.rowIndex,
        localizedImportValue(t, error.email),
        localizedImportReason(t, error),
      ]),
    ),
  ].join("\n");
}

export type StudentImportExamples = {
  primaryEmail: string;
  primaryName: string;
  secondaryEmail: string;
  secondaryName: string;
};

export function buildStudentImportTemplate(
  accessLevels: ReadonlyArray<{ slug: string }>,
  examples: StudentImportExamples,
) {
  const headers = [
    "email",
    "name",
    "access_level_slug",
    "expiration_date",
    "cohort_slug",
    "send_welcome_email",
  ];
  const exampleSlug = accessLevels[0]?.slug ?? "premium";
  return [
    csvRow(headers),
    csvRow([
      examples.primaryEmail,
      examples.primaryName,
      exampleSlug,
      "2027-04-01",
      "",
      "true",
    ]),
    csvRow([
      examples.secondaryEmail,
      examples.secondaryName,
      exampleSlug,
      "",
      "",
      "true",
    ]),
    "",
  ].join("\n");
}
