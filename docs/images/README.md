# Documentation images

These files illustrate the [README](../../README.md) and [website](../../website/README.md). The original six application screenshots were captured on September 16, 2026 (UTC) using fictional local accounts and authored test content, with no customer branding, real member data, or credentials.

## Artwork

[openmembers-cover.svg](openmembers-cover.svg) uses the project's open-doorway symbol and outlined Montserrat Bold wordmark. The [brand guide](../brand/README.md) records the vector masters, font source and preserved [SIL Open Font License](../brand/Montserrat-OFL.txt). The project artwork uses the [MIT license](../../LICENSE); that license does not replace the font's OFL.

## Application captures

The captures show the current wordmark and mobile icon from source revision `be09846`. Playwright rendered a production build against an ephemeral local Supabase stack on GitHub Actions. Desktop captures use a 1280 px viewport; the mobile capture uses Pixel 7 emulation. These are unretouched application captures, not mockups or evidence of a production deployment. The lesson images show the completion celebration and its success notification.

| Asset | What it shows | Pixels | Fixture/test source |
|---|---|---|---|
| [Dashboard](dashboard.png) | Member home, course cards and a live-session card | 1280 × 1465 | `e2e/tools-localization.spec.ts` |
| [Course catalog](course-catalog.png) | Available courses and library browsing | 1280 × 1691 | `e2e/learning-localization.spec.ts` |
| [Lesson workspace](lesson-workspace.png) | A completed text lesson, materials and discussion | 1280 × 1384 | `e2e/learning-localization.spec.ts` |
| [Admin reports](admin-reports.png) | Administrator navigation and student reports | 1280 × 1516 | `e2e/admin-i3-localization.spec.ts` |
| [Language settings](language-settings.png) | Account preferences and EN / PT-BR / ES choices | 1280 × 2100 | `e2e/localization.spec.ts` |
| [Mobile lesson](mobile-lesson.png) | The lesson experience on a narrow viewport | 1082 × 4407 | `e2e/learning-localization.spec.ts` |

The names, course content and `example.test` accounts visible in the captures are fictional fixtures. No purchased stock photography is included. Notices for UI dependencies remain applicable; screenshots do not relicense those dependencies.

## Appearance captures

The appearance images were captured on October 1, 2026 (UTC) from the feature branch for [PR #2](https://github.com/Open-Members/openmembers/pull/2), using a local production build and authored sample copy. They show Inter body text, Lora headings, pill action buttons and a solid `#edf2f7` home background. The browser uses the dark theme; the artwork variant follows the configured light surface. Desktop uses a 1280 × 900 viewport; mobile uses Pixel 7 emulation. These are unretouched captures with the default Open Members artwork and no member accounts, customer assets, external browser requests or production deployment.

| Asset | What it shows | Pixels | Fixture source |
|---|---|---|---|
| [Desktop appearance](appearance-home-desktop.png) | Public home with independent fonts, a solid background and pill actions | 1280 × 900 | Local installation configuration |
| [Mobile appearance](appearance-home-mobile.png) | Public home with independent fonts, a solid background and pill actions | 1082 × 2205 | Local installation configuration |

To reproduce, build without external services, run the production server on an unused local port and select a separate installation JSON with the settings above and the sample title “Your community, your way”. Capture the public home after fonts and entrance transitions finish, using Playwright's bundled Chromium. No authenticated database or reset is needed. Application dependencies retain their original licenses.

## Banner video captures

The banner images were generated locally on October 1, 2026 with the real `HeroBanner` component, translations, navigation and application CSS. The remote iframe contains controlled 16:9 gradient media; the heading and action use fictitious copy. These unretouched captures exercise a deliberately enlarged 700 px banner, rather than change the application's default height. They show coverage and action placement, not real YouTube playback or a production deployment.

| Asset | What it shows | Pixels | Fixture source |
|---|---|---|---|
| [Desktop banner](member-banner-video-desktop.png) | Proportional media covers a wide banner; the action remains inside | 1440 × 900 | `e2e/hero-banner.spec.ts` |
| [Mobile banner](member-banner-video-mobile.png) | Media covers a tall narrow banner; the action remains below | 1024 × 2216 | `e2e/hero-banner.spec.ts` |

Run `npx playwright test --config playwright.banner.config.ts`. The coverage cases write `banner-dark.png` under their desktop/mobile directories in `test-results/`. Desktop uses a 1440 × 900 viewport; mobile uses Pixel 7 emulation at 390 × 844 CSS pixels, with its device scale factor. The preceding matrix also checks widths through 2560 px and viewport changes. No external media is included in these assets; application dependencies retain their original licenses.

## Banner startup captures

The startup images were captured locally on October 1, 2026 (America/Sao_Paulo) from the feature branch for the banner startup fix. Playwright rendered the real `HeroBanner`, translations, navigation and application CSS. The backing artwork is an authored solid-color SVG; the controlled remote iframe contains deliberately visible startup buttons that remain hidden behind that image. The heading and action use fictitious copy. These are unretouched component captures, without accounts, external media or a production deployment.

| Asset | What it shows | Pixels | Fixture source |
|---|---|---|---|
| [Desktop startup](member-banner-startup-desktop.png) | Backing image and action while the decorative player initializes | 1440 × 900 | `e2e/hero-banner.spec.ts` |
| [Mobile startup](member-banner-startup-mobile.png) | Backing image and the separate action below the narrow banner | 1024 × 2216 | `e2e/hero-banner.spec.ts` |

Run `npx playwright test --config playwright.banner.config.ts --grep 'startup controls stay'`. The test writes `startup-first.png` and `startup-reload.png` in the desktop/mobile result directories. Desktop uses a 1440 × 900 viewport; mobile uses Pixel 7 emulation at 390 × 844 CSS pixels and its device scale factor. The same cases check initial load, reload, buffering, normal fade and reduced motion. These captures illustrate startup concealment; the separate opt-in real-provider tests verify actual playback and native controls. No new third-party material is distributed; application dependencies retain their original licenses.

## Website preview

[website-preview.jpg](website-preview.jpg) is an unchanged 956 × 720 capture of the website from September 14, 2026. It shows the header, wordmark and planned services. It illustrates the website, not a hosted application demo.

- [Website asset provenance](../../website/ASSETS.md).

## Reproducing captures

`npm run test:e2e:docs` runs five existing authenticated tests against the production build: four desktop cases at a 1280 × 900 viewport and one learning case with Pixel 7 emulation. It uses Playwright’s bundled Chromium, one worker and zero retries, preserving the tests’ assertions and timeouts.

Use a disposable development stack with fictitious data. **`db:verify` deletes and recreates that development database twice.** Check the [local database guide](../development/local-database.md) before running it.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run db:start
OPENMEMBERS_DATABASE_TEST_TARGET=development npm run db:verify
npm run build:local
OPENMEMBERS_BROWSER_TEST_TARGET=development npm run test:e2e:docs
npm run db:stop
```

Captures are written under `test-results/documentation/`. On supported Linux hosts, use `npx playwright install --with-deps chromium` to install browser system dependencies. Stop the local stack with `npm run db:stop` after inspection, including when a check fails.

The [Documentation screenshots workflow](../../.github/workflows/documentation.yml) provides the same isolated setup. Changes to its workflow or Playwright configuration trigger a run; **Run workflow** is also available once the workflow is present on the default branch. After successful checks, the `documentation-screenshots` artifact retains only the six selected English PNGs for seven days: desktop dashboard, catalog, lesson, reports and settings, plus the mobile lesson. Traces, videos, environment files and logs are excluded from the artifact. Review the images and record the source revision before replacing the documentation assets.
