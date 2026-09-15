# Open Members website

The product website and bilingual Help Center for [openmembers.club](https://openmembers.club/). This standalone site does not run the members application, connect to Supabase, or require Docker. It presents the experimental MIT-licensed source and two services: monthly managed hosting and one-time implementation. Both services are **coming soon**.

## Run locally

Use Node 22.x and npm 10.9.2 in this directory. The application's pinned Node 22.23.2 toolchain also supports this website. Git and committed documentation/assets are required; application dependencies are unnecessary.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run check
npm run preview
```

Open [automatic regional entry](http://127.0.0.1:4321/), [Português](http://127.0.0.1:4321/pt/), or [English](http://127.0.0.1:4321/en/). The server binds to loopback and serves only `dist/`. Stop it with Ctrl+C. Use `PORT=4322 npm run preview` if the default port is occupied. Rebuild after edits and reload; there is no hot reload.

The build writes to `.dist-building/`, then replaces `dist/` only after all output succeeds. A failed write preserves the last successful preview. Output includes 24 localized pages, 12 unprefixed entry points, search indexes, assets, and `build-info.json`. Generated directories are ignored.

## Languages and navigation

- `/pt/` and `/en/` include the landing page, Help Center, ten guides, search, navigation, dialogs, accessibility labels, and missing-page responses.
- In local preview, a saved language choice wins. Brazilian time zones select Portuguese, other known time zones select English, and browser language is the fallback for an absent/UTC time zone.
- The Cloudflare Worker uses `request.cf.country`: Brazil selects Portuguese, other countries select English, and weighted `Accept-Language` is the fallback. It makes no additional IP lookup or geolocation request and stores no visitor IP.
- Explicit locale URLs never redirect. Language links preserve the page, query, and section anchor. Manual choice uses `localStorage` and a host-only cookie lasting one year, with SameSite=Lax and Secure on HTTPS. Explicit routes work when storage is blocked. Worker routing also works without JavaScript; local unprefixed pages remain readable in Portuguese.
- Product screenshots and literal code examples retain their original text. The [asset inventory](ASSETS.md) describes their source and scope.

The `#open-source` section links the product narrative to installation, contribution, security, the MIT license, and [the project repository](https://github.com/Open-Members/openmembers). Self-hosting is an independent installation path; the two coming-soon commercial offers remain optional services.

## Source files and translations

- `src/home.mjs` / `src/content.mjs`: bilingual product narrative and service offers.
- `src/layout.mjs`, `src/style.css`, `src/site.js`: shared visual identity and progressive interactions.
- `src/locale.mjs`: regional selection and route helpers.
- `src/catalog.mjs`: the ten-article source allowlist and section selections. `src/catalog-locales.mjs` supplies translated titles, descriptions, and categories.
- `content/pt/` / `content/en/`: the translated counterpart of each guide. The source-language version comes directly from committed Markdown. `content/translations.json` binds each counterpart to the raw-source and selected-Markdown hashes.
- `scripts/docs.mjs`: reads committed Markdown, rejects missing sections or stale translations, strips raw HTML, remaps included links, and builds search text. Translated headings retain source IDs to preserve destinations across languages.
- `scripts/build.mjs`: copies allowlisted committed images/licenses and records source revisions, assets, and translations in the build manifest.

When a source changes, review both languages together, preserving configuration limits and code examples, before updating the hashes in `content/translations.json`. Missing headings and heading-count mismatches fail the build. Tests compare executable fenced examples in both versions. Refreshing hashes without reviewing the translation can conceal stale instructions.

The catalog includes product and contributor guides only. References outside the catalog render as identified text. The build does not expose files through a directory scan.

To build the Help Center from a different Git checkout:

```sh
node scripts/build.mjs --source-root /absolute/path/to/source-checkout
```

Different source bytes require translation review. The option reads the selected checkout without modifying it.

## Accessibility and assets

The product tour rotates every 6.5 seconds while visible, unpaused, not hovered, and in a visible browser tab. Navigation, focus, or touch pauses it; an explicit button resumes it. Left/right/Home/End keys support keyboard navigation. Reduced motion disables automatic rotation and entrance animations. Without JavaScript, all panels and native FAQ disclosures remain usable. Images open as ordinary links, enhanced with a dialog that supports original-size inspection and focus return.

See [ASSETS.md](ASSETS.md) for brand artwork, licenses, system typography, and six fictitious product captures. There are no remote fonts, trackers, live checkout, or data-collection forms. Search runs in the browser. Local previews use `noindex,nofollow` and robots exclusion.

## Deploy with Cloudflare

This repository includes the official website source. `scripts/prepare-release.mjs` generates canonical URLs and the sitemap for **https://openmembers.club**. For a different website, update that origin and the corresponding expectations in `tests/deploy/release.test.mjs` before creating a release.

The distributed Worker configuration is an example without an account ID, zone ID, or active route. Copy it to the ignored local configuration:

```sh
cp wrangler.example.jsonc wrangler.local.jsonc
```

In `wrangler.local.jsonc`, set your Worker name and `account_id`, and add a route containing your domain pattern and `zone_id`. Use an account that controls that domain. Inspect existing DNS and services before deployment: matching requests will be served by the Worker and Static Assets, without fetching an existing origin. The configuration has no application, database, email, or storage bindings. Public `workers.dev` and preview URLs are disabled.

Use Wrangler **4.128.0** with a separately authenticated profile. Set `WRANGLER_BIN` to the CLI's `bin/wrangler.js` path. The commands below run from this website directory and use a profile named `website`; substitute your own profile name if needed.

```sh
node "$WRANGLER_BIN" auth create website --scopes account:read user:read workers:write workers_routes:write workers_scripts:write zone:read
```

Complete authentication in the browser with the intended account. Wrangler 4.128.0 adds `offline_access` automatically; do not pass it as an explicit scope.

```sh
# Commit source changes first; the release script requires a clean tracked tree.
npm run release
npm run check
npm run check:release
WRANGLER_SEND_METRICS=false node "$WRANGLER_BIN" deploy --dry-run --config wrangler.local.jsonc --outdir /tmp/openmembers-worker-dry
WRANGLER_SEND_METRICS=false node "$WRANGLER_BIN" dev --local --ip 127.0.0.1 --host 127.0.0.1 --port 8787 --config wrangler.local.jsonc
# Deploy after verifying the account, domain configuration, and local package.
WRANGLER_SEND_METRICS=false node "$WRANGLER_BIN" deploy --profile website --config wrangler.local.jsonc
```

`npm run release` builds `release/` from an explicit allowlist: localized and entry pages, localized 404 pages, search indexes, assets/licenses, client CSS/JS, robots, sitemap, and security headers. Production pages have absolute canonical/hreflang URLs and are indexable. Cloudflare consumes `_headers`; the Worker also sets security headers on its responses. Regional redirects are private and never cached.

Git, environment files, source directories, application artifacts, and `build-info.json` are excluded from the upload. The ignored `.release-evidence/manifest.json` records output hashes, byte counts, and source/build revisions outside `release/`. Keep it with the deployment version and verification results. After deployment, verify HTTPS, regional redirects, explicit languages, guides, 404 responses, assets, and the sitemap.
