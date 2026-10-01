"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { FONT_CATALOG } from "@/core/theme/branding";
import {
  BUTTON_RADII,
  type EntryBackground,
  type EntryScreen,
  type FontFamily,
} from "@/core/theme/appearance";
import {
  EntryBackgroundLayer,
  entrySurfaceStyle,
  entryBrandSurface,
} from "@/shared/components/ui/EntryBackground";
import { AuthGradientBackdrop } from "@/features/Auth/components/shared/AuthGradientBackdrop";
import { getReadableForeground } from "@/core/theme/contrast";

export type AppearancePreviewIdentity = {
  siteName: string;
  fontFamily: FontFamily;
  headingFontFamily: FontFamily | "inherit" | null;
  buttonShape: keyof typeof BUTTON_RADII | null;
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
};
export function EntryAppearancePreview({
  screen,
  background,
  identity,
  title,
  description,
}: {
  screen: EntryScreen;
  background: EntryBackground;
  identity: AppearancePreviewIdentity;
  title: string;
  description: string;
}) {
  const t = useTranslations("adminOperations.branding.appearance");
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(true);
  const heading =
    identity.headingFontFamily === "inherit"
      ? identity.fontFamily
      : identity.headingFontFamily;
  const logoOnDark =
    (entryBrandSurface(background) ?? (dark ? "dark" : "light")) === "dark";
  const logo = logoOnDark
    ? (identity.logoDarkUrl ?? identity.logoLightUrl)
    : (identity.logoLightUrl ?? identity.logoDarkUrl);
  const style = {
    "--color-background": dark ? "#0a0b0e" : "#ffffff",
    "--color-card": dark ? "#111217" : "#ffffff",
    "--color-foreground": dark ? "#f2f1ee" : "#040d1f",
    "--color-muted-foreground": dark ? "#8e8d93" : "#5a6a8a",
    "--color-border": dark ? "#24252a" : "#dde2ef",
    "--color-primary": identity.primaryColor,
    "--font-display": heading ? FONT_CATALOG[heading].css : "Georgia, serif",
    fontFamily: FONT_CATALOG[identity.fontFamily].css,
    ...entrySurfaceStyle(background),
  } as CSSProperties;
  const radius = identity.buttonShape
    ? BUTTON_RADII[identity.buttonShape]
    : screen === "home"
      ? "12px"
      : "9999px";
  const actionStyle = {
    backgroundColor: identity.primaryColor,
    color: getReadableForeground(identity.primaryColor),
    borderRadius: radius,
  };
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t("preview")}</span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={mobile}
            aria-label={`${t("screens." + screen)}: ${t("mobile")}`}
            onClick={() => setMobile((v) => !v)}
            className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-xs"
          >
            {t(mobile ? "mobile" : "desktop")}
          </button>
          <button
            type="button"
            aria-pressed={dark}
            aria-label={`${t("screens." + screen)}: ${t("dark")}`}
            onClick={() => setDark((v) => !v)}
            className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-xs"
          >
            {t(dark ? "dark" : "light")}
          </button>
        </div>
      </div>
      <div
        data-testid={`appearance-preview-${screen}`}
        data-preview-theme={dark ? "dark" : "light"}
        data-preview-viewport={mobile ? "mobile" : "desktop"}
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-[var(--color-border)]"
        style={{
          ...style,
          maxWidth: mobile ? 340 : undefined,
          minHeight: mobile ? 470 : 360,
          backgroundColor: "var(--color-background)",
          color: "var(--color-foreground)",
        }}
      >
        {background ? (
          <EntryBackgroundLayer background={background} />
        ) : (
          screen !== "home" && <AuthGradientBackdrop />
        )}
        <div
          inert
          className="relative flex min-h-[360px] flex-col justify-center px-6 py-10"
          style={{ minHeight: mobile ? 470 : 360 }}
        >
          <div
            className={
              screen === "home"
                ? ""
                : "mx-auto w-full max-w-[280px] text-center"
            }
          >
            {logo ? (
              <Image
                unoptimized
                width={240}
                height={64}
                src={logo}
                alt=""
                className="mb-6 h-8 max-w-full object-contain"
              />
            ) : (
              <p className="mb-6 text-sm font-semibold">{identity.siteName}</p>
            )}
            <h3 className="font-display break-words text-2xl font-semibold">
              {screen === "home"
                ? title
                : t(screen === "login" ? "loginTitle" : "registerTitle")}
            </h3>
            {screen === "home" ? (
              <>
                <p className="mt-4 break-words text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                  {description}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <span
                    className="px-4 py-3 text-sm font-semibold"
                    style={actionStyle}
                  >
                    {t("loginAction")}
                  </span>
                  <span
                    className="border border-[var(--color-border)] px-4 py-3 text-sm"
                    style={{ borderRadius: radius }}
                  >
                    {t("registerAction")}
                  </span>
                </div>
              </>
            ) : (
              <div
                className="mt-6 space-y-3 rounded-3xl border border-[var(--color-border)] p-5 text-left"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--color-card) 85%, transparent)",
                }}
              >
                {(screen === "register"
                  ? ["name", "email", "password"]
                  : ["email", "password"]
                ).map((field) => (
                  <div key={field}>
                    <p className="mb-1 text-xs">{t(field)}</p>
                    <div className="h-9 rounded-xl border border-[var(--color-border)]" />
                  </div>
                ))}
                <div
                  className="mt-4 px-4 py-3 text-center text-sm font-semibold"
                  style={actionStyle}
                >
                  {t(screen === "login" ? "loginAction" : "registerAction")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {t("previewHelp")}
      </p>
    </div>
  );
}
