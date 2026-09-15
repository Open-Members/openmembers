"use client";
import { adminPeopleError } from "../people-presentation";
import { useTranslations } from "next-intl";

import { useState, useTransition } from "react";
import { X, Loader2, UserCog } from "lucide-react";
import { appToast } from "@/shared/lib/toast";
import { updateUserProfile } from "../actions";
import type { StudentProfile } from "../user-detail-queries";

type Props = {
  profile: StudentProfile;
  onClose: () => void;
  onSaved: () => void;
};

export function EditProfileDialog({ profile, onClose, onSaved }: Props) {
  const t = useTranslations("adminPeople");
  const [name, setName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email);
  const [country, setCountry] = useState(profile.country ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const emailChanged =
    email.trim().toLowerCase() !== profile.email.trim().toLowerCase();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError(t("nameIsRequired"));
      return;
    }
    if (!email.trim()) {
      setError(t("emailIsRequired"));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("errors.invalidEmail"));
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateUserProfile({
          userId: profile.id,
          displayName: name.trim(),
          email: email.trim(),
          country: country.trim() || null,
          phone: phone.trim() || null,
        });
        if ("error" in result) {
          setError(adminPeopleError(t, result.error));
          return;
        }
        appToast.success(t("profileUpdated"));
        onSaved();
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
            <UserCog className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="font-bold text-[var(--color-foreground)]">
              {t("editProfile")}{" "}
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
            {emailChanged && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                {t("theNewEmailTakesEffectImmediatelyTheStudentWill")}{" "}
              </p>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("countryOptional")}>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                maxLength={80}
                placeholder={t("brazil")}
                className="input"
              />
            </Field>

            <Field label={t("phoneOptional")}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                placeholder={t("examples.phone")}
                className="input"
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            {t("cancel")}{" "}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("saveChanges")}{" "}
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
