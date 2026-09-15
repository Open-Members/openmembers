# Third-party notices

Open Members source uses the [MIT License](LICENSE). Third-party packages, fonts, and assets retain their own licenses and copyright notices. This document identifies dependency metadata and the license materials included with the source; it is not a complete notice bundle for a compiled application or container image.

## Source and dependency scope

The source includes application code, documentation, demonstration media, manifests, a lockfile, and build recipes. Installed dependencies, generated application bundles, executable toolchains, and container images are not included. Referencing a package in a lockfile does not place its files in the source distribution. Third-party materials incorporated into the source remain subject to their own terms.

The tables below describe the versions associated with `package-lock.json` SHA-256 `2ebb8fe8cecb7a44e6e98de0b6002d13d6a92d006fedaaeafe8d8efa6c639eaf`. Package groups follow `package.json`; they do not establish inclusion in a runtime artifact. Declared licenses and package-root notices may not cover every bundled component. The [version-specific supplements](third-party/README.md) identify additional original license texts and their scope.

## Direct package metadata

### dependencies

| Package | Version | Declared license | Root evidence / supplement |
| --- | --- | --- | --- |
| `@aws-sdk/client-s3` | 3.1032.0 | Apache-2.0 | LICENSE |
| `@aws-sdk/lib-storage` | 3.1032.0 | Apache-2.0 | LICENSE |
| `@aws-sdk/s3-request-presigner` | 3.1032.0 | Apache-2.0 | LICENSE |
| `@dnd-kit/core` | 6.3.1 | MIT | LICENSE |
| `@dnd-kit/modifiers` | 9.0.0 | MIT | LICENSE |
| `@dnd-kit/sortable` | 10.0.0 | MIT | LICENSE |
| `@dnd-kit/utilities` | 3.2.2 | MIT | LICENSE |
| `@heroui/react` | 3.0.1 | MIT | LICENSE |
| `@iconify/react` | 6.0.2 | MIT | license.txt |
| `@react-email/components` | 1.0.12 | MIT | license.md |
| `@react-email/render` | 2.0.7 | MIT | license.md |
| `@sentry/nextjs` | 10.74.0 | MIT | LICENSE |
| `@supabase/ssr` | 0.9.0 | MIT | LICENSE |
| `@supabase/supabase-js` | 2.100.0 | MIT | Versioned supplement |
| `canvas-confetti` | 1.9.4 | ISC | LICENSE |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | LICENSE |
| `clsx` | 2.1.1 | MIT | license |
| `isomorphic-dompurify` | 3.10.0 | MIT | LICENSE |
| `lucide-react` | 1.6.0 | ISC | LICENSE |
| `motion` | 12.38.0 | MIT | LICENSE.md |
| `next` | 16.3.5 | MIT | license.md |
| `next-intl` | 4.11.0 | MIT | LICENSE |
| `pdf-lib` | 1.17.1 | MIT | LICENSE.md |
| `pdfjs-dist` | 6.3.289 | Apache-2.0 | LICENSE |
| `pg` | 8.20.0 | MIT | LICENSE |
| `react` | 19.2.4 | MIT | LICENSE |
| `react-dom` | 19.2.4 | MIT | LICENSE |
| `stripe` | 22.0.1 | MIT | LICENSE |
| `tailwind-merge` | 3.5.0 | MIT | LICENSE.md |
| `zod` | 4.3.6 | MIT | LICENSE |
| `zustand` | 5.0.12 | MIT | LICENSE |

### devDependencies

| Package | Version | Declared license | Root evidence / supplement |
| --- | --- | --- | --- |
| `@playwright/test` | 1.59.1 | Apache-2.0 | LICENSE, NOTICE |
| `@tailwindcss/postcss` | 4.2.2 | MIT | LICENSE |
| `@testing-library/jest-dom` | 6.9.1 | MIT | LICENSE |
| `@testing-library/react` | 16.3.2 | MIT | LICENSE |
| `@types/canvas-confetti` | 1.9.0 | MIT | LICENSE |
| `@types/node` | 20.19.37 | MIT | LICENSE |
| `@types/pg` | 8.23.1 | MIT | LICENSE |
| `@types/react` | 19.2.14 | MIT | LICENSE |
| `@types/react-dom` | 19.2.3 | MIT | LICENSE |
| `eslint` | 9.39.4 | MIT | LICENSE |
| `eslint-config-next` | 16.3.5 | MIT | Versioned supplement |
| `jsdom` | 29.0.2 | MIT | LICENSE.txt |
| `supabase` | 2.117.0 | MIT | Root notice gap |
| `tailwindcss` | 4.2.2 | MIT | LICENSE |
| `typescript` | 5.9.3 | Apache-2.0 | LICENSE.txt |
| `vitest` | 4.1.11 | MIT | LICENSE.md |

## Bundled and platform components

Some transitive dependencies have additional distribution requirements. Their package declarations include:

| Package or family | Version and declared license | Scope |
| --- | --- | --- |
| `@sentry/cli` | `2.58.6` — FSL-1.1-MIT | Build tool reached through the Sentry integration. The future-license name does not mean this version is currently MIT. |
| `sharp` and `@img/sharp-libvips-*` | Sharp `0.35.4` — Apache-2.0; libvips package `1.3.3` — LGPL-3.0-or-later, with platform-specific component terms | Native image processing dependencies. Package composition includes libvips `8.18.6`; README and version maps are not complete license texts for all embedded libraries. |
| `dompurify` | `3.4.15` — MPL-2.0 OR Apache-2.0 | HTML sanitization dependency. Preserve the selected applicable terms and copyright notices. |
| `caniuse-lite` | `1.0.30001810` — CC-BY-4.0 | Browser-support data used by build tooling. Attribution depends on the data actually distributed. |
| `axe-core` | `4.11.1` — MPL-2.0 | Lint/development dependency with its own third-party notices. |
| `lightningcss` | `1.32.0` — MPL-2.0 | Build/test dependency with platform-specific binaries. |

A development flag, disabled integration, or absent package directory does not establish that associated code is absent from a bundle. Container images also distribute Node, base-system packages, and native libraries with their own terms.

## Collecting notices

[`scripts/collect-third-party-notices.mjs`](scripts/collect-third-party-notices.mjs) preserves original notices recursively, including bundled Next.js and PDF.js components. The manifest records package versions, source paths, hashes, absent packages, and unresolved coverage gaps. Docker generates a collection from the installed Linux build dependencies and places it at `/app/third-party`. Generated host collections are excluded from Git and the Docker context.

The collector includes build/development dependencies and is not an inventory of runtime code alone. A missing package-root notice remains a coverage gap; README or composition metadata does not automatically resolve it. In particular, the Supabase CLI npm shim's complete notices are not established by the separately retained Go-component license. Node, Alpine, libvips, and other native materials need review against the exact artifact being distributed.

## Project assets

The application uses the MIT-licensed `@heroui/react@3.0.1` package. No HeroUI Pro catalog or purchased template is included.

Project SVG artwork and application screenshots are documented in the [media inventory](docs/images/README.md). The screenshots contain fictitious accounts and authored demonstration content. The wordmark uses outlined Montserrat Bold from the official Google Fonts repository at revision `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`. Its [SIL Open Font License 1.1](docs/brand/Montserrat-OFL.txt), copyright 2024 The Montserrat.Git Project Authors, is preserved verbatim. The [brand guide](docs/brand/README.md) identifies the source and integrity of these materials. The MIT license does not relicense the font; the distributed wordmarks contain outlines, not an embedded font binary.

## Presentation website

`website/` uses Marked `15.0.12` (MIT) at build time, pinned in its own package lock. Its build preserves Marked's full license and the Montserrat OFL alongside project artwork. Body text uses system fonts without redistributing font files. [Website asset provenance](website/ASSETS.md) describes the CSS illustrations and unchanged fictitious application captures. No purchased template or UI kit is included.

## Compiled distribution

Before distributing bundles, executables, or container images, identify their exact components and include the applicable notices and other required distribution materials. Copying this document and the project LICENSE into an image does not complete that review. A source-only distribution and a compiled distribution have different contents; their applicable materials must be assessed separately.
