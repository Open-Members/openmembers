import { test, expect, type Page } from "./fixtures/database-test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { browserTestTarget } from "./fixtures/test-target.mjs";
const target = browserTestTarget();
// The guarded fixture allows only the documented development and local pilot targets.
function adminClient() {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL !== target.apiOrigin ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error("Guarded runner required.");
  return createClient(target.apiOrigin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@example.test");
  await page.locator('input[name="password"]').fill("OpenMembers-local-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin/branding");
  await expect(page.getByLabel("Body font", { exact: true })).toBeEnabled();
}
async function save(page: Page) {
  const uploadNotice = page.getByRole("alertdialog", {
    name: "Image uploaded.",
    exact: true,
  });
  if (await uploadNotice.count())
    await uploadNotice
      .getByRole("button", { name: "Close", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Save changes", exact: true }).click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Discard", exact: true }),
  ).toHaveCount(0);
}

test("independent screen backgrounds, local fonts, copy, discard and retained uploads work together", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(10_000);
  const admin = adminClient();
  const original = await admin
    .from("tenant_settings")
    .select("*")
    .maybeSingle();
  expect(original.error).toBeNull();
  const ownedPaths = new Set<string>();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const group = (name: string) =>
    page.getByRole("group", { name, exact: true });
  async function color(name: string, hex: string) {
    await group(name)
      .getByRole("combobox", { name: "Background type", exact: true })
      .selectOption("color");
    const input = group(name).getByLabel("Hex color for Background color", {
      exact: true,
    });
    await input.fill(hex);
    await input.press("Tab");
  }
  const homeTitle = `Community ${randomUUID().slice(0, 8)}`;
  try {
    await login(page);
    await page.getByLabel("Body font", { exact: true }).selectOption("inter");
    await page.getByLabel("Heading font", { exact: true }).selectOption("lora");
    await page
      .getByLabel("Button shape", { exact: true })
      .selectOption("square");
    await page.getByLabel("Public home title", { exact: true }).fill(homeTitle);
    await color("Public home", "#123456");
    await color("Login", "#345678");
    await group("Registration")
      .getByRole("combobox", { name: "Copy background from", exact: true })
      .selectOption("login");
    await group("Registration")
      .getByRole("button", { name: "Copy configuration", exact: true })
      .click();
    await color("Login", "#987654");
    const publishedBefore = await admin
      .from("tenant_settings")
      .select("public_home_title")
      .maybeSingle();
    expect(publishedBefore.error).toBeNull();
    expect(publishedBefore.data?.public_home_title ?? null).toBe(
      original.data?.public_home_title ?? null,
    );
    await page
      .getByRole("button", { name: "Public home: Mobile", exact: true })
      .click();
    await expect(page.getByTestId("appearance-preview-home")).toHaveAttribute(
      "data-preview-viewport",
      "mobile",
    );
    await page
      .getByRole("button", { name: "Public home: Dark", exact: true })
      .click();
    await expect(page.getByTestId("appearance-preview-home")).toHaveAttribute(
      "data-preview-theme",
      "light",
    );
    await page.getByTestId("appearance-preview-home").screenshot({
      path: test.info().outputPath("home-draft-mobile-light.png"),
    });
    await group("Public home").screenshot({
      path: test.info().outputPath("editor-public-home.png"),
      animations: "disabled",
    });
    await save(page);
    await expect(
      page.getByRole("button", { name: /^Solid One color/ }),
    ).toHaveCSS("border-radius", "12px");
    const saved = await admin
      .from("tenant_settings")
      .select(
        "public_home_background,login_background,register_background,heading_font_family,button_shape",
      )
      .single();
    expect(saved.data).toEqual({
      public_home_background: { mode: "color", color: "#123456" },
      login_background: { mode: "color", color: "#987654" },
      register_background: { mode: "color", color: "#345678" },
      heading_font_family: "lora",
      button_shape: "square",
    });
    await context.clearCookies();
    for (const [path, colorValue] of [
      ["/", "rgb(18, 52, 86)"],
      ["/login", "rgb(152, 118, 84)"],
      ["/register", "rgb(52, 86, 120)"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByTestId("entry-background")).toHaveCSS(
        "background-color",
        colorValue,
      );
      expect(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toContain("Open Members Inter");
      expect(
        await page
          .locator("h1")
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toContain("Open Members Lora");
      await expect(page.locator("[data-brand-button]").first()).toHaveCSS(
        "border-radius",
        "0px",
      );
      await page.evaluate(() =>
        Promise.all([
          document.fonts.load('16px "Open Members Inter"'),
          document.fonts.load('24px "Open Members Lora"'),
          document.fonts.load('16px "Open Members Montserrat"'),
        ]),
      );
      expect(
        await page.evaluate(
          () =>
            document.fonts.check('16px "Open Members Inter"') &&
            document.fonts.check('24px "Open Members Lora"') &&
            document.fonts.check('16px "Open Members Montserrat"'),
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (path === "/")
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          homeTitle,
        );
      else {
        const readable =
          path === "/login" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
        await expect(
          page.getByRole("link", {
            name: path === "/login" ? "Create one" : "Sign in",
            exact: true,
          }),
        ).toHaveCSS("color", readable);
      }
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (value) => localStorage.setItem("openmembers:theme", value),
          theme,
        );
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await expect
          .poll(() =>
            page.locator("[data-entry-screen]").evaluate((element) => {
              let opacity = 1;
              for (
                let node: HTMLElement | null = element as HTMLElement;
                node;
                node = node.parentElement
              )
                opacity *= Number(getComputedStyle(node).opacity);
              return opacity;
            }),
          )
          .toBe(1);
        const surface = page.locator("[data-entry-screen]");
        const expectedLogoSurface = await surface.getAttribute(
          "data-entry-brand-surface",
        );
        if (expectedLogoSurface) {
          const artwork = surface.locator("[data-brand-logo-surface]");
          for (const image of await artwork.all()) {
            const variant = await image.getAttribute("data-brand-logo-surface");
            await expect(image).toHaveCSS(
              "display",
              variant === expectedLogoSurface ? "block" : "none",
            );
          }
        }
        await page.screenshot({
          path: test
            .info()
            .outputPath(
              `published-${path.replaceAll("/", "") || "home"}-${theme}.png`,
            ),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    for (const path of ["/forgot-password", "/reset-password"]) {
      await page.goto(path);
      await expect(page.getByTestId("entry-background")).toHaveCount(0);
    }
    await login(page);
    await group("Login")
      .getByRole("combobox", { name: "Background type", exact: true })
      .selectOption("current");
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(
      group("Login").getByRole("combobox", {
        name: "Background type",
        exact: true,
      }),
    ).toHaveValue("color");
    await group("Login")
      .getByRole("combobox", { name: "Background type", exact: true })
      .selectOption("image");
    // Valid one-pixel PNG; server verifies metadata, size and PNG signature.
    const file = {
      name: `appearance-${randomUUID()}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6XsQAAAAASUVORK5CYII=",
        "base64",
      ),
    };
    await group("Login")
      .getByLabel("Choose file for Background image", { exact: true })
      .setInputFiles(file);
    const image = group("Login").getByRole("img", {
      name: "Background image",
      exact: true,
    });
    await expect(image).toHaveAttribute("src", new RegExp(file.name + "$"));
    const url = (await image.getAttribute("src"))!;
    const path = decodeURIComponent(
      new URL(url).pathname.split("/platform-assets/")[1],
    );
    ownedPaths.add(path);
    await group("Login")
      .getByRole("combobox", { name: "Image position", exact: true })
      .selectOption("bottom");
    await save(page);
    expect(
      (await admin.from("tenant_settings").select("login_background").single())
        .data?.login_background,
    ).toEqual({
      mode: "image",
      imageUrl: url,
      position: "bottom",
      overlayOpacity: 70,
    });
    await group("Login")
      .getByRole("button", { name: "Remove Background image", exact: true })
      .click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(
      group("Login").getByRole("img", {
        name: "Background image",
        exact: true,
      }),
    ).toHaveAttribute("src", url);
    expect((await page.request.get(url)).status()).toBe(200);
    await group("Registration")
      .getByRole("combobox", { name: "Background type", exact: true })
      .selectOption("current");
    await save(page);
    await context.clearCookies();
    await page.goto("/register");
    await expect(page.getByTestId("entry-background")).toHaveCount(0);
    await page.goto("/login");
    await expect(page.getByTestId("entry-background")).toHaveCSS(
      "background-position",
      "50% 100%",
    );
    await expect(page.getByTestId("entry-background")).toHaveCSS(
      "background-image",
      `url("${url}")`,
    );
    expect(errors).toEqual([]);
  } finally {
    if (original.data)
      expect(
        (await admin.from("tenant_settings").upsert(original.data)).error,
      ).toBeNull();
    else
      expect(
        (
          await admin
            .from("tenant_settings")
            .delete()
            .eq("public_home_title", homeTitle)
        ).error,
      ).toBeNull();
    if (ownedPaths.size)
      expect(
        (await admin.storage.from("platform-assets").remove([...ownedPaths]))
          .error,
      ).toBeNull();
  }
});
