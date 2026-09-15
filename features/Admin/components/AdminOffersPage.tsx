"use client";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { AdminOffers } from "./AdminOffers";
import { AdminEnrollments } from "./AdminEnrollments";
import type {
  AdminEnrollment,
  AdminOfferWithProvider,
  AdminWebhookConfig,
  AdminCourseLite,
} from "../actions";

export function AdminOffersPage({
  offers,
  configs,
  courses,
  enrollments,
}: {
  offers: AdminOfferWithProvider[];
  configs: AdminWebhookConfig[];
  courses: AdminCourseLite[];
  enrollments: AdminEnrollment[];
}) {
  const t = useTranslations("adminAccess");
  const [tab, setTab] = useState<"offers" | "enrollments">("offers");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-[var(--color-muted)] rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("offers")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === "offers"
              ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          }`}
        >
          {t("offers")}{" "}
        </button>
        <button
          onClick={() => setTab("enrollments")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === "enrollments"
              ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          }`}
        >
          {t("enrollments")}{" "}
        </button>
      </div>

      {tab === "offers" && (
        <AdminOffers
          initialOffers={offers}
          configs={configs}
          courses={courses}
        />
      )}
      {tab === "enrollments" && (
        <AdminEnrollments initialEnrollments={enrollments} offers={offers} />
      )}
    </div>
  );
}
