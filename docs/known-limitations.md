# Known limitations

Open Members is experimental software. No stable release, supported production version, or release date has been announced. The package version `0.1.0` is development metadata.

The installation model is **one independent application installation and one dedicated Supabase project per organization**. Shared-database organization hosting is outside this scope.

## Application and deployment

| Area | Current limitation |
| --- | --- |
| Branding tests | Authenticated browser checks intermittently fail around the saved installation name after image upload/polling and interrupted navigation to login. The cause is not established. A passing retry does not demonstrate a fix. |
| Integrated browser coverage | Expanded browser scenarios, integrated localization, signed attachment download retesting, and the restored application's interface checks remain incomplete. |
| Independent installation | The Docker/Linux reference deployment has not completed end-to-end validation by an independent operator on a dedicated hosted environment. |
| Scheduled jobs and recovery | A job executor and systemd templates are included. Local checks and manual job invocations do not establish actual timer execution, backup, restore, or recovered application behavior on a hosted Linux installation. |
| CI | Workflow results apply to the commit and environment tested. A passing run for another revision does not validate a changed checkout. |
| Private security reports | GitHub Private Vulnerability Reporting is not currently available as a verified reporting channel. See [SECURITY.md](../SECURITY.md) for how to check availability and request a private alternative. |
| Compiled distribution | Source notices do not establish complete coverage for compiled bundles, native components, or container layers. No application container image is published. |

The [source package guide](deployment/source-package.md), [installation guide](deployment/installation.md), [operations guide](deployment/operations.md), and [deployment validation checklist](deployment/validation.md) describe the reference setup and its checks.

## Optional providers

External services require installation-owned configuration and testing with controlled accounts. Local adapters, mocked responses, and configured credentials do not establish end-to-end provider operation.

| Integration | Current boundary |
| --- | --- |
| Stripe, Guru, and generic payment webhooks | Optional payment/enrollment adapters and retry handling exist. Each provider requires its own signature, enrollment, duplicate-event, and failure tests. |
| Hotmart | A candidate route exists; it is not an operationally supported integration. |
| Resend and Auth email | Application delivery is optional. Supabase Auth email has separate configuration; provider acceptance and Mailpit capture do not prove inbox delivery. |
| R2 | An optional storage adapter is included. Bucket access, upload, retrieval, CORS, and cleanup require validation against the intended account. |
| YouTube and Vimeo | Administrator-supplied embeds depend on provider access and embed policies. YouTube tests that contact the provider require explicit opt-in. A test of one provider does not validate another. |
| Course AI chat | Experimental and disabled by default; requires credentials and an authorized corpus. No ingestion pipeline is included. |
| Google and Apple OAuth | Server-side opt-in exists; the sign-in interface and complete flow are not delivered. |
| GA4, Meta Pixel, and Sentry | Optional installation-owned telemetry, disabled without configuration. Data collection depends on the configuration chosen by each operator. |
| Push and offline use | New push subscriptions are disabled. A manifest exists, but no delivery/offline worker is included. |

Use the [integration matrix](integrations/README.md), [payments](integrations/payments.md), [email and jobs](integrations/email-jobs.md), [storage](integrations/storage.md), and [player](features/player.md) guides for configuration details.

## Operational boundaries

- **Scale:** administrative complete reads are bounded at 100,000 rows per source and do not form transaction snapshots. Rate limiting is process-local. Deployments with multiple application processes need their own assessment of these limits.
- **Localization:** English, Brazilian Portuguese, and Spanish interface coverage is present; final integrated localization acceptance remains incomplete. Authored course content, custom branding copy, and saved email-template overrides are not automatically translated.
- **Toolchain:** Vite is pinned to `8.0.16`; an optional peer-dependency resolution conflict is unresolved. Use the committed lockfile and documented toolchain when reproducing checks.
- **Deployment:** no hosted application demo is provided. Public build values require rebuilding when changed. Local database scripts are restricted to the development stack.
- **Support and policies:** no security-supported version line or response-time commitment is established. Each installation supplies its own support contacts, terms, and privacy policy.
- **Services:** managed hosting and implementation assistance are not available for purchase. Pricing, scope, support, and terms have not been announced.

For available guides, see the [documentation index](README.md). To report a reproducible problem or contribute a correction, follow [CONTRIBUTING.md](../CONTRIBUTING.md) and include the affected revision, environment, and relevant results.
