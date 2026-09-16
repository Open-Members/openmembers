# Changelog

## Unreleased

Open Members is experimental software. No stable release or release date is announced. The package version `0.1.0` is development metadata. The current scope is one independent application installation and one dedicated Supabase project per organization.

### Included

- Member learning experience with course catalog, modules, video lessons, attachments, PDF reading, progress, discussions, notifications, and support.
- Administration for content, accounts, enrollments, access, collections, instructors, reporting, and CSV workflows.
- Configurable identity, logos, colors, navigation, dashboard presentation, metadata, and transactional email identity, with administrative branding taking precedence over file defaults.
- English, Brazilian Portuguese, and Spanish interface text, default notifications, emails, and generated documents, selected by profile preference.
- Versioned Supabase migrations, row-level access policies, private Storage, guarded local development tools, and repeatable fictitious demo data.
- Optional payment and enrollment adapters, signed webhook handling, durable retry work, and five operational jobs for expiry, warnings, content release, retries, and cleanup.
- Docker Compose reference deployment, Linux operations guides, a job executor, and systemd timer templates.
- Monochrome light/dark brand assets, a visual product overview, and an independent bilingual website with a searchable Help Center. Managed hosting and implementation service remain planned offerings.
- Unit, tooling, database, and browser suites, plus offline committed-source and build-artifact checks.

### Behavior and safeguards

- Administrative exports, report aggregates, and course/access counters read complete pages in stable order and fail rather than return partial results. Reads are bounded at 100,000 rows per source and do not form a transaction snapshot.
- Student totals count student profiles. Account lookup and displayed email addresses are independent of the first Auth page.
- Rate-limit cleanup respects each key's expiration. Limits remain process-local.
- Payment, Resend, and Auth email webhooks enforce a 1 MiB streaming body limit and preserve signature bytes.
- Privileged Supabase access is marked server-only. Local preparation rejects remote Docker targets and separates public build values from private runtime credentials.
- Enrollment and payment handling include contracts for atomic assignment and concurrent updates.
- Browser navigation, mobile administration, branding contrast, notification localization, PDF resource cleanup, and signed downloads include corrective changes; remaining runtime checks are listed below.

### Known limitations

- Authenticated branding checks are intermittent around the installation name after upload/polling and navigation to login. Cause and correction remain open; passing retries alone do not resolve the item.
- Expanded pilot browser, localization, signed-download, and recovery-interface checks remain incomplete. Check results apply only to the tested revision and environment.
- An independent installation by a new operator on Linux, real timer execution, and hosted backup/recovery acceptance remain pending.
- Optional provider flows require explicit opt-in and their own operational tests. AI course chat is disabled by default and has no ingestion pipeline; OAuth has no delivered sign-in interface; Hotmart is a candidate adapter; push delivery and offline operation are not implemented.
- Vite is pinned to `8.0.16`; an optional peer-dependency resolution conflict remains to be reviewed.
- No supported security release line or response-time commitment is established. Use GitHub Private Vulnerability Reporting as described in [SECURITY.md](SECURITY.md).
- Distribution of binaries and container images requires review of their actual components and applicable notices. No published application container or hosted application demo is provided.

See the [known limitations](docs/known-limitations.md) for current validation and operational boundaries and the [documentation index](docs/README.md) for configuration and operating guides. Source is [MIT-licensed](LICENSE); dependencies and assets retain the attributions and terms in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
