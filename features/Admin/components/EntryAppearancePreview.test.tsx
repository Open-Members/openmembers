import { afterEach, it, expect } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/core/i18n/locales/en/adminOperations.json";
import {
  EntryAppearancePreview,
  type AppearancePreviewIdentity,
} from "./EntryAppearancePreview";
afterEach(cleanup);
it("uses the available opposite-theme logo just like the published auth screen", () => {
  const identity: AppearancePreviewIdentity = {
    siteName: "Academy",
    fontFamily: "inter",
    headingFontFamily: "lora",
    buttonShape: "pill",
    primaryColor: "#123456",
    logoLightUrl: "/logo-light.png",
    logoDarkUrl: null,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ adminOperations: en }}>
      <EntryAppearancePreview
        screen="login"
        background={null}
        identity={identity}
        title="Home"
        description="Description"
      />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByTestId("appearance-preview-login").querySelector("img"),
  ).toHaveAttribute("src", "/logo-light.png");
});

it("uses the solid background logo variant independently of the preview theme", () => {
  const identity: AppearancePreviewIdentity = {
    siteName: "Academy",
    fontFamily: "inter",
    headingFontFamily: "lora",
    buttonShape: "pill",
    primaryColor: "#123456",
    logoLightUrl: "/logo-on-light.png",
    logoDarkUrl: "/logo-on-dark.png",
  };
  const view = (color: string) => (
    <NextIntlClientProvider locale="en" messages={{ adminOperations: en }}>
      <EntryAppearancePreview
        screen="login"
        background={{ mode: "color", color }}
        identity={identity}
        title="Home"
        description="Description"
      />
    </NextIntlClientProvider>
  );
  const { rerender } = render(view("#edf2f7"));
  const logo = () =>
    screen.getByTestId("appearance-preview-login").querySelector("img");
  expect(logo()).toHaveAttribute("src", "/logo-on-light.png");
  fireEvent.click(screen.getByRole("button", { name: "Login: Dark" }));
  rerender(view("#123456"));
  expect(logo()).toHaveAttribute("src", "/logo-on-dark.png");
});
