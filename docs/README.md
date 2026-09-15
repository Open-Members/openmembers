# Open Members documentation

Build an independent home for your courses and learning community. These guides cover the experimental application, its local demo, and the reference deployment. Start with the [product overview](../README.md) or choose a path below.

## Choose your next step

| I want to… | Start here | Source language |
| --- | --- | --- |
| Try the application with fictitious data | [Local development](development.md) | English |
| Understand the detailed local setup | [Supabase, fixtures, and first administrator](development/local-database.md) | Portuguese |
| Change the name, logos, colors, and presentation | [Customization](customization.md) | Portuguese |
| Prepare an independent deployment | [Installation](deployment/installation.md) · [Source package guide](deployment/source-package.md) | Portuguese |
| Operate, back up, or update an installation | [Operations](deployment/operations.md) | Portuguese |
| Understand what still needs validation | [Known limitations](known-limitations.md) | English |
| Contribute a change | [Contributing](../CONTRIBUTING.md) · [Source verification](source-verification.md) | English |
| Report a security concern | [Security policy](../SECURITY.md) | English |

The [Help Center](https://openmembers.club/en/help/) offers curated English and Portuguese editions of selected guides. Interface language is a separate setting: members can choose English, Brazilian Portuguese, or Spanish in their profile. Course content and administrator-written text retain their authored language.

## Installation model

The first-release scope is **one application installation and one dedicated Supabase project per organization**. Each organization controls its deployment, database, storage, credentials, branding, policies, and provider accounts. The current design does not provide separate organizations within a shared application database.

The application uses Next.js and React. Supabase supplies Auth, PostgreSQL, and Storage. Server-side authorization and database row-level security enforce access to the configured installation's data. The browser receives public Supabase configuration; privileged credentials belong only on the server. Administrative actions require authorization even when they use a privileged database client.

Public identity can be supplied in a local presentation file and overridden by valid saved administrative branding. Credentials belong in the private environment, as described in [`.env.example`](../.env.example). The [installation guide](deployment/installation.md) explains which public values are embedded at build time and when rebuilding is necessary.

Local development uses fixed service names and ports. Two checkouts on the same Docker daemon share that development stack; they are not two isolated installations. Use fictitious data and services dedicated to development. The local database tools are not hosted deployment tools.

## Features and integrations

| Area | Guide |
| --- | --- |
| Quizzes, certificates, release schedules, cohorts, live classes, and AI prerequisites | [Features and configuration](features/overview.md) |
| Required services, optional providers, and disabled behavior | [Integration matrix](integrations/README.md) |
| Payment events, enrollment assignment, and retries | [Payments](integrations/payments.md) |
| Application email, Auth email, and scheduled work | [Email and jobs](integrations/email-jobs.md) |
| Branding files, private attachments, and optional R2 | [Storage](integrations/storage.md) |
| Enrollment rules and access | [Enrollment](features/enrollment.md) |
| Video behavior and provider checks | [Player](features/player.md) |
| Search behavior and access boundaries | [Search](features/search.md) |

These source guides are in Portuguese. Configuration support does not establish provider acceptance. The local demo needs no payment, external email, AI, or telemetry account. Enable an optional service only after reviewing its requirements and testing with controlled accounts.

## Verification and release status

The application is experimental, with no stable release or supported production version. The [known limitations](known-limitations.md) describe known failures and validation gaps, including intermittent branding tests and an independent Linux pilot.

For a contribution, use the checks relevant to its behavior and report the exact source revision and environment. Static review, a prepared environment, local runtime checks, hosted CI, and production verification are distinct results. A screenshot or passing check from an earlier revision does not establish the state of the current source.

The [source verification guide](source-verification.md) explains what the offline Git snapshot check covers and what it leaves out. Build-artifact checks do not replace review of the final package, runtime image, or third-party licenses.

## License and assets

Project source uses the [MIT License](../LICENSE). Dependencies, fonts, and other assets keep their own terms in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and the [version-specific notice supplements](../third-party/README.md).

See the [brand guide](brand/README.md) for identity assets and font attribution, and the [image notes](images/README.md) for screenshot provenance. Product screenshots use fictitious local accounts and content. Review the notices applicable to the exact materials included when distributing a compiled bundle or container image.
