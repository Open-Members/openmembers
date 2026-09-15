import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/core/i18n/locales/en/adminPeople.json";
import pt from "@/core/i18n/locales/pt/adminPeople.json";
import es from "@/core/i18n/locales/es/adminPeople.json";
import {
  adminPeopleError,
  adminValueLabel,
  buildImportErrorCsv,
  buildStudentImportTemplate,
  formatAdminDate,
  localizedImportReason,
  localizedImportValue,
} from "./people-presentation";

type Translator = ((
  key: string,
  values?: Record<string, string | number>,
) => string) & { has(key: string): boolean };

function translator(messages: Record<string, string>): Translator {
  const t = ((key: string, values?: Record<string, string | number>) => {
    let message = messages[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replace(`{${name}}`, String(value));
    }
    return message;
  }) as Translator;
  t.has = (key: string) => key in messages;
  return t;
}

const catalogs = { en, pt, es };

function catalogTranslator(locale: keyof typeof catalogs): Translator {
  return createTranslator({
    locale,
    messages: { adminPeople: catalogs[locale] },
    namespace: "adminPeople",
  }) as Translator;
}

describe("admin people presentation", () => {
  const t = translator({
    "errors.operationFailed": "safe fallback",
    "errors.roleFailed": "localized role failure",
    "errors.unknownCohort": "Unknown cohort: {slug}",
    "roles.admin": "Administrator",
  });

  it("maps stable return and thrown codes without exposing diagnostics", () => {
    expect(adminPeopleError(t, "roleFailed")).toBe("localized role failure");
    expect(adminPeopleError(t, new Error("roleFailed"))).toBe(
      "localized role failure",
    );
    expect(adminPeopleError(t, new Error("database connection failed"))).toBe(
      "safe fallback",
    );
  });

  it("keeps unknown technical values while localizing known ones", () => {
    expect(adminValueLabel(t, "roles", "admin")).toBe("Administrator");
    expect(adminValueLabel(t, "sources", "external_partner")).toBe(
      "external_partner",
    );
  });

  it("formats instants and civil dates with explicit locale/timezone rules", () => {
    expect(
      formatAdminDate("2026-09-12T01:30:00Z", "en-US", "America/Sao_Paulo"),
    ).toContain("Sep");
    expect(
      formatAdminDate("2026-09-12", "pt-BR", "Pacific/Auckland", true),
    ).toContain("set");
  });

  it("localizes import reasons only from known codes and parameters", () => {
    expect(
      localizedImportReason(t, {
        reasonCode: "unknownCohort",
        reasonValues: { slug: "cohort-a" },
      }),
    ).toBe("Unknown cohort: cohort-a");
    expect(localizedImportReason(t, {})).toBe("safe fallback");
    expect(
      localizedImportReason(t, {
        reasonCode: "unknownCohort",
        reasonValues: {},
      }),
    ).toBe("safe fallback");
    expect(
      localizedImportReason(t, {
        reasonCode: "private database diagnostic",
      }),
    ).toBe("safe fallback");
  });
});

describe.each([
  ["en", "Unknown cohort: launch-2027.", "(blank)"],
  ["pt", "Turma desconhecida: launch-2027.", "(em branco)"],
  ["es", "Grupo desconocido: launch-2027.", "(vacío)"],
] as const)("localized import presentation in %s", (locale, reason, blank) => {
  const t = catalogTranslator(locale);

  it("uses the same safe reason and empty marker on screen and in CSV", () => {
    const error = {
      rowIndex: 2,
      email: "",
      reasonCode: "unknownCohort" as const,
      reasonValues: { slug: "launch-2027", private: "do not render" },
    };

    expect(localizedImportValue(t, error.email)).toBe(blank);
    expect(localizedImportReason(t, error)).toBe(reason);
    expect(buildImportErrorCsv(t, [error])).toBe(
      `row_index,email,reason\n2,${blank},${reason}`,
    );
  });
});

it.each([
  ["en", "jane@example.com,Jane Doe", "john@example.com,John Roe"],
  ["pt", "joana@example.com,Joana Silva", "joao@example.com,João Santos"],
  ["es", "juana@example.com,Juana Pérez", "juan@example.com,Juan García"],
] as const)(
  "builds the %s template with localized examples and technical fields",
  (locale, primary, secondary) => {
    const copy = catalogs[locale].examples;
    const csv = buildStudentImportTemplate(
      [{ slug: "premium" }],
      {
        primaryEmail: copy.primaryStudentEmail,
        primaryName: copy.primaryStudentName,
        secondaryEmail: copy.secondaryStudentEmail,
        secondaryName: copy.secondaryStudentName,
      },
    );

    expect(csv).toContain(
      "email,name,access_level_slug,expiration_date,cohort_slug,send_welcome_email",
    );
    expect(csv).toContain(`${primary},premium,2027-04-01,,true`);
    expect(csv).toContain(`${secondary},premium,,,true`);
  },
);

it("neutralizes spreadsheet formulas in import error values", () => {
  const t = catalogTranslator("en");
  expect(
    buildImportErrorCsv(t, [
      { rowIndex: 2, email: "  =cmd", reasonCode: "emailRequired" },
    ]),
  ).toContain("2,'  =cmd,Email is required.");
});
