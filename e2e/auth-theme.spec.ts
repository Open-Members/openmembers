import { test, expect, type Page } from './fixtures/database-test';
import type { Locator } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { assertBrowserTestEnvironment } from './fixtures/test-target.mjs';

async function brandAccent(page: Page, color: string) {
  // Exercise tenant colors without changing any published database setting.
  await page.addStyleTag({ content: `:root,.dark{--color-accent:${color};}` });
}

async function inputSurfaceSample(page: Page, screenshot: Buffer) {
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    // Sample empty space at the right edge, excluding glyphs and caret.
    canvas.width = 12;
    canvas.height = image.naturalHeight - 8;
    canvas.getContext('2d')!.drawImage(image, -(image.naturalWidth - 16), -4);
    return canvas.toDataURL();
  }, screenshot.toString('base64'));
}

async function contrast(element: Locator, surface: Locator) {
  const background = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
  return element.evaluate((el, backgroundColor) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const luminance = (...colors: string[]) => {
      context.clearRect(0, 0, 1, 1);
      for (const color of colors) {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
      }
      const rgb = context.getImageData(0, 0, 1, 1).data;
      const channels = Array.from(rgb)
        .slice(0, 3)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(getComputedStyle(el).color);
    const background = luminance(backgroundColor, getComputedStyle(el).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  }, background);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} authentication theme`, () => {
    test.beforeEach(async ({ context }) => {
      await context.addInitScript(
        (value) => localStorage.setItem('openmembers:theme', value),
        theme,
      );
    });

    test('shared authentication inputs preserve their wrapper surface', async ({ page }) => {
      for (const path of [
        '/pt/login',
        '/pt/register',
        '/pt/forgot-password',
        '/pt/reset-password',
      ]) {
        await page.goto(path);
        const inputs = page.locator('form input:not([type="hidden"])');
        await expect(inputs.first()).toBeVisible();
        for (const input of await inputs.all()) {
          await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await input.focus();
          await expect(input).toBeFocused();
          await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        }
      }
      await page.goto('/pt/login');
      const password = page.locator('input[name="password"]');
      await password.fill('visibility-check');
      await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'text');
      await expect(password).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'password');
      await page.screenshot({ path: test.info().outputPath(`login-${theme}.png`), fullPage: true });
    });

    test('browser autofill preserves the surface and text of authentication fields', async ({
      page,
      context,
    }) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      try {
        for (const path of [
          '/pt/login',
          '/pt/register',
          '/pt/forgot-password',
          '/pt/reset-password',
        ]) {
          await page.goto(path);
          await page.evaluate(() => document.fonts.ready);
          const { root } = await cdp.send('DOM.getDocument');
          const inputs = page.locator('form input:not([type="hidden"])');
          await expect(inputs.first()).toBeVisible();
          for (const input of await inputs.all()) {
            const name = await input.getAttribute('name');
            const value = (await input.getAttribute('type')) === 'email' ? 'a@b.test' : 'Fill123';
            await input.fill(value);
            const textColor = await input.evaluate((el) => getComputedStyle(el).color);
            const manual = await inputSurfaceSample(page, await input.screenshot());
            const { nodeId } = await cdp.send('DOM.querySelector', {
              nodeId: root.nodeId,
              selector: `input[name="${name}"]`,
            });
            // DevTools activates the real browser autofill pseudo-state and UA styles.
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] });
            expect(await input.evaluate((el) => el.matches(':autofill'))).toBe(true);
            for (const focused of [true, false]) {
              if (focused) await input.focus();
              else await input.press('Tab');
              const screenshot = await input.screenshot();
              if (path === '/pt/login') {
                await test.info().attach(`${name}-autofill-${focused ? 'focused' : 'blurred'}`, {
                  body: screenshot,
                  contentType: 'image/png',
                });
              }
              expect(
                await inputSurfaceSample(page, screenshot),
                `${path}: ${name} autofill surface`,
              ).toBe(manual);
              await expect(input).toHaveCSS('-webkit-text-fill-color', textColor);
              await expect(input).toHaveValue(value);
            }
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
            await input.fill(value + '1');
            expect(await input.evaluate((el) => el.matches(':autofill'))).toBe(false);
            await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          }
        }
        await page.emulateMedia({ forcedColors: 'active' });
        await page.goto('/pt/login');
        const email = page.locator('input[name="email"]');
        await email.fill('a@b.test');
        const systemText = await email.evaluate((el) => getComputedStyle(el).color);
        const { root } = await cdp.send('DOM.getDocument');
        const { nodeId } = await cdp.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: 'input[name="email"]',
        });
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] });
        await expect(email).toHaveCSS('-webkit-text-fill-color', systemText);
        await expect(email).toHaveCSS('caret-color', systemText);
      } finally {
        await cdp.detach();
      }
    });

    test('invalid credentials remain readable with dark or white brand accents', async ({
      page,
    }) => {
      await page.goto('/pt/login');
      await page.locator('input[name="email"]').fill('theme-check@example.test');
      await page.locator('input[name="password"]').fill('invalid-password');
      await page.locator('form button[type="submit"]').click();
      const alert = page.locator('form [role="alert"]');
      await expect(alert).toContainText('E-mail ou senha incorretos.');
      for (const accent of ['#111111', '#ffffff']) {
        await brandAccent(page, accent);
        expect(
          await contrast(alert.locator('span'), alert),
          `Error text with ${accent}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          await contrast(alert.locator('svg'), alert),
          `Error icon with ${accent}`,
        ).toBeGreaterThanOrEqual(3);
      }
      await page.screenshot({
        path: test.info().outputPath(`login-error-${theme}.png`),
        fullPage: true,
      });
    });

    test('account logout stays readable and works by keyboard', async ({
      page,
      baseURL,
      isMobile,
    }) => {
      const target = assertBrowserTestEnvironment(process.env, baseURL);
      const service = createClient(target.apiOrigin, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const email = `auth-theme-${randomUUID()}@example.test`;
      const password = `Theme-${randomUUID()}-aA9!`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      const userId = created.data.user!.id;
      try {
        await page.goto('/pt/login');
        await page.locator('input[name="email"]').fill(email);
        await page.locator('input[name="password"]').fill(password);
        await page.locator('form button[type="submit"]').click();
        await expect(page).toHaveURL(/\/dashboard$/);
        const account = page.getByRole('button', {
          name: /^(Menu da conta|Account menu)$/,
          exact: true,
        });
        await account.focus();
        await account.press('Enter');
        const menu = page.getByRole('menu', { exact: true });
        const logout = page.getByRole('menuitem', { name: /^(Sair|Sign out)$/, exact: true });
        await expect(logout).toBeVisible();
        for (const accent of ['#111111', '#ffffff']) {
          await brandAccent(page, accent);
          expect(await contrast(logout, menu), `Logout text with ${accent}`).toBeGreaterThanOrEqual(
            4.5,
          );
          expect(
            await contrast(logout.locator('svg'), menu),
            `Logout icon with ${accent}`,
          ).toBeGreaterThanOrEqual(3);
        }
        if (!isMobile) {
          await logout.hover();
          await expect(logout).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          expect(await contrast(logout, menu)).toBeGreaterThanOrEqual(4.5);
        }
        await logout.focus();
        await expect(logout).toBeFocused();
        await expect(logout).toHaveCSS('outline-style', 'solid');
        await page.screenshot({
          path: test.info().outputPath(`account-menu-${theme}.png`),
          fullPage: true,
        });
        await logout.press('Enter');
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.locator('form input[name="email"]')).toBeVisible();
      } finally {
        expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
      }
    });
  });
}
