# Local development

Start here to run the fictitious demo and prepare a contribution. The first release uses one application installation and one Supabase project per organization. This guide uses the guarded local development stack; the [Linux installation guide](deployment/installation.md) covers a separately configured installation.

The [detailed Portuguese guide](development/local-database.md) contains first-administrator provisioning and Storage rules. Installation by a new contributor has not yet been demonstrated. See the [known limitations](known-limitations.md) for current validation limits.

## Requirements

- A reviewed source checkout or extracted source package. Run the commands below from its root directory.
- Node.js **22.23.2**, selected by [`.nvmrc`](../.nvmrc), and npm **10.9.2**, declared in [`package.json`](../package.json). The supported engine ranges are also declared there. The examples assume `nvm` is already installed; another version manager can select the same versions.
- Docker Desktop on macOS, or a local Docker Engine on Linux, running and accessible to your user. The local scripts require a Unix socket and reject TCP/SSH daemons and linked hosted Supabase projects. Native Windows setup has not been verified.
- Available disk space for dependencies, images and the local database, and the ports below free. The first start downloads the Supabase images.

The Supabase CLI is locked in the project dependencies. A global CLI, hosted account, access token and `supabase link` are unnecessary for this demo.

The scripts use the fixed project name `openmembers` and fixed ports. **A second checkout on the same Docker daemon uses the same development stack.** Confirm that its data and services are dedicated to your test before operating it. Restarting Docker or changing another project's containers is outside routine setup.

| Service | Local address or port |
| --- | --- |
| Development app | [localhost:3000](http://localhost:3000) |
| Supabase API, Auth and Storage | `127.0.0.1:55431` |
| PostgreSQL | `127.0.0.1:55432` |
| Migration shadow database | `55430` |
| Mailpit | [127.0.0.1:55434](http://127.0.0.1:55434) |
| Browser tests | Unconfigured `3100`, authenticated `3101`, branding `3102` |

## Install and open the demo

Select the toolchain and confirm its versions before installing the locked dependencies:

```sh
nvm install
nvm use
node --version
npm --version
npm ci --ignore-scripts --no-audit --no-fund
```

With the dedicated Docker stack available:

```sh
npm run db:start
npm run db:seed
npm run dev:local
```

Open [localhost:3000](http://localhost:3000), using `localhost` for Auth callbacks. `db:start` applies migrations when creating a new stack. `db:seed` provisions the known demo fixtures; repeating it restores their declared attributes, so keep your own content outside their reserved identifiers.

`dev:local` obtains the guarded stack's credentials and injects them into Next.js. It needs no `.env.local` file, selects Mailpit and disables optional provider credentials. Keep local administrative credentials and environment files out of Git. For presentation changes, follow the [customization guide](customization.md).

All demo accounts use the public password **`OpenMembers-local-2026!`**:

| Account | Scenario |
| --- | --- |
| `admin@example.test` | Superadministrator |
| `staff@example.test` | Administrator |
| `student@example.test` | Active student with valid enrollment |
| `visitor@example.test` | Student without enrollment |
| `expired@example.test` | Student with expired enrollment |
| `suspended@example.test` | Suspended student |

These credentials and the sample courses are fictitious local fixtures. Signup requires email confirmation; confirmation and recovery messages appear in [Mailpit](http://127.0.0.1:55434). Seeded accounts are already confirmed. The [separate first-administrator procedure](development/local-database.md#criar-o-primeiro-superadministrador-separadamente) must run before the demo seed if you want to exercise that bootstrap path.

## Stop, update or reset

Stop Next.js with `Ctrl+C`, then stop this project's database services while preserving their data:

```sh
npm run db:stop
```

For an existing stack, review new migration files before applying them with `npm run db:migrate`. That command applies pending local migrations without a reset or seed.

**`npm run db:reset` deletes this project's local database and reapplies migrations. `npm run db:verify` does this twice.** Use them only when the stack is disposable and no other work depends on it. Read the [reset and verification procedure](development/local-database.md#reset-e-reprodução-limpa) before running either command. A reset is not a recovery step for an unavailable Docker daemon.

`db:verify` accepts only the development target named `e5` on `5543x`. An inherited `OPENMEMBERS_DATABASE_TEST_TARGET` other than `e5` is rejected before service access or data changes. The separate `db:test` target selector does not change what `db:verify` resets.

## Verify a change

Plan the change first, following [CONTRIBUTING](../CONTRIBUTING.md). The following checks require the installed dependencies but no running database or external provider:

```sh
npm run check
npm run lint
npm test
npm run test:tooling
```

`check` generates Next.js route types and checks TypeScript. Tooling tests use fictitious services, including local loopback listeners. Documentation-only changes normally need link, command and version review instead of application tests.

For a clean tracked checkout after committing, run `npm run verify:source`. This checks the exact Git snapshot for documented local-material paths and credential signatures; it refuses staged/unstaged tracked changes and does not inspect untracked files or history. See [source verification](source-verification.md) for its limits and the separate final-package review.

Database contracts require the dedicated stack and demo fixtures. They create temporary records and clean up their own fixtures; they are not read-only tests. For the development stack, select the development target `e5` before running them:

```sh
OPENMEMBERS_DATABASE_TEST_TARGET=e5 npm run db:test
```

For authenticated browser checks, create a build for that same local stack and leave port `3101` free:

```sh
npm run build:local
npx playwright install chromium
npm run test:e2e:db
```

Chromium installation may download browser files. On a supported Debian/Ubuntu Linux host without the browser's system libraries, use `npx playwright install --with-deps chromium` instead; this also installs OS dependencies and may request `sudo`. A build prepared for this authenticated suite is different from an unconfigured build. See the [README verification section](../README.md#verification) for the unconfigured and branding suites, artifact checks and CI scope. The YouTube integration test is a separate explicit opt-in because it contacts an external provider.

## Troubleshooting and further reading

| Symptom | Next check |
| --- | --- |
| Node/npm version differs | Select the versions declared above before `npm ci`; keep the lockfile unchanged. |
| Docker or local Supabase is unavailable | Check Docker availability and whether the documented stack is already in use. Preserve its data; do not use a reset to repair the daemon. |
| App reaches `/setup` | Confirm the local stack started and use `dev:local` to inject its configuration. `npm run dev` without Supabase variables intentionally shows setup. |
| Confirmation message is missing | Check the local Mailpit inbox and use the `localhost` application origin. Seeded accounts already have confirmed email. |
| Port is occupied | Identify the existing process or stack before proceeding; tests and another checkout may already own that port. |

Use the [integration matrix](integrations/README.md) for provider requirements and validation limits. These development commands operate only the fixed local stack. The [installation guide](deployment/installation.md) covers a separate Linux host and Supabase project; the [operations guide](deployment/operations.md) covers deployment jobs, backups and recovery. Find other guides in the [documentation index](README.md) and remaining validation work in the [known limitations](known-limitations.md).
