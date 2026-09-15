This guide prepares **one application and one dedicated Supabase project per organization**. The reference path uses Docker on Linux, with a database, content, and credentials belonging to that installation.

The core has undergone local Supabase checks, including migrations, Auth, administrator, enrollment, files, and browser. The hosted Linux/VPS path below has not yet been validated end to end. Test the host, domain, email, schedule, and hosted Supabase on the chosen installation before accepting real data. See [source package guide](source-package.md) and the [known limitations](../known-limitations.md).

## 1. Choose the path

| Objective | Path |
| --- | --- |
| Develop or explore the demo | [Local guide](../development/local-database.md): `db:start`, `db:seed`, and `dev:local` |
| Install for an organization | New hosted Supabase, Docker application, and installation-owned configuration, as described here |
| Validate independent installation | Separate machine/VM/daemon, source package, and a reviewer following [source package guide](source-package.md) |

The `db:*`, `dev:local`, `build:local`, and `admin:create` scripts check for local `openmembers` Supabase, fixed ports, and no remote link. Preserve these guards. A second checkout on the same Docker uses the same local stack and does not establish installation isolation.

## 2. Requirements and preparation

- Linux host with systemd (`systemctl`, `timedatectl`, `journalctl`, `systemd-analyze`), Docker Engine, Docker Compose plugin, and HTTPS proxy. Another service manager requires adapting and validating the schedule. The reference application uses a single process/container.
- An identified Open Members revision, as a Git checkout or verified source package. Record the commit actually received; version `0.1.0` in `package.json` alone does not identify the installed revision.
- To manage migrations outside the container: Node.js 22.23.2, npm 10.9.2, and lockfile dependencies. Supabase CLI 2.117.0 is included in the project; no global CLI is required.
- A new Supabase project, organization domain, installation owner, and administrative access to installation-owned services.
- Space for checkout, dependencies, image, and logs. Check disk capacity before building; sizing and load still require the pilot.

Examples assume the checkout is at `/opt/openmembers`, secrets at `/etc/openmembers/application.env`, and public presentation at `/etc/openmembers/installation.json`. The Docker operator must be able to read the environment file; restricting file access does not replace restricting Docker daemon access. Prepare directories/permissions using the host administrator account according to host policy.

In the installation copy, after selecting the selected revision:

```sh
cd /opt/openmembers
npm ci --ignore-scripts --no-audit --no-fund
```

In a Git checkout, record `git rev-parse HEAD` and confirm a clean tree. In a `git archive` package without `.git`, verify the received archive hash and record the maintainer-provided SHA, following [package identification](source-package.md#preparar-ou-conferir-um-pacote); do not run Git commands in that package. If not yet extracted, follow [verified extraction on Linux](source-package.md#extrair-um-pacote-conferido-no-linux). Subsequent steps assume the revision already occupies `/opt/openmembers`.

Do not use `git pull` to automatically update an active installation. The [operations guide](operations.md) describes revision selection, backup, and returning to the previous image.

## 3. Prepare Supabase and apply migrations

Create a project in the organization's account. It must contain no application tables, Auth users, or data from another installation. Migrations depend on Supabase services, schemas, and roles; an empty generic PostgreSQL database does not provide them. The sequence also creates `pgcrypto` in `extensions` and `vector` in `public`.

Use a deployment copy separate from the local demo. Authenticate the CLI through its prompt and confirm in the panel that the identifier belongs to the **new** project. The official flow is to link, preview pending migrations, and apply them; the CLI records history and skips already-applied versions. [Supabase migration reference](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI `db push`](https://supabase.com/docs/reference/cli/supabase-db-push).

```sh
cd /opt/openmembers
npx supabase login
npx supabase link --project-ref IDENTIFICADOR_DO_PROJETO_NOVO
npx supabase migration list
npx supabase db push --dry-run
```

Replace the example project identifier with the new project's identifier. The first dry run must list these ten migrations in order:

1. `20260911000100_schema.sql`
2. `20260911000200_access.sql`
3. `20260911000300_storage.sql`
4. `20260911000400_integrity.sql`
5. `20260911000500_payment_delivery.sql`
6. `20260911000600_email_jobs.sql`
7. `20260911000700_manual_enrollment.sql`
8. `20260911000800_profile_locale.sql`
9. `20260912000900_notification_descriptors.sql`
10. `20260912001000_quiz_attempt_transaction.sql`

If history is unexpected, tables already exist, or an extension occupies an incompatible schema, stop installation in that project and investigate. Do not repair history, remove tables, or modify migrations to force installation over unknown data.

After the operator verifies the project and list:

```sh
npx supabase db push
npx supabase migration list
```

Confirm ten versions in remote history and three buckets: public `avatars` and `platform-assets`, and private `lesson-materials`. Do not use `--include-seed`, `db reset --linked`, `db:reset`, or `db:verify` on this path. Fixtures and the demo password belong exclusively to the local environment.

`supabase/config.toml` configures the **local** stack. Applying migrations does not automatically transfer its Auth, SMTP, redirect, or limit options to a hosted project. Configure them in the hosted service. Create the first account only after migrations, because the profile-creation trigger does not backfill existing users.

## 4. Configure Auth and email

Enable email/password and email confirmation in Supabase. Use the real HTTPS origin as **Site URL**, for example `https://members.example.org`. Register this application's callback in Redirect URLs: `https://members.example.org/api/auth/callback`. Keep callback and Site URL on the same origin. Do not indiscriminately allow third-party domains or previews. [Supabase redirect reference](https://supabase.com/docs/guides/auth/redirect-urls).

Signup and recovery add `next` to the callback query, for example `?next=%2Fdashboard` and `?next=/reset-password`. The current Supabase Auth implementation permits destinations on the Site URL's origin; confirm this behavior in the pilot, including signup initiated through a course link. The Open Members callback restricts `next` to internal destinations. Reading the [Supabase implementation](https://github.com/supabase/auth/blob/master/internal/utilities/request.go) does not replace confirmation/recovery testing through the hosted service.

Configure installation-owned SMTP in Supabase for native confirmation and recovery. Default hosted SMTP has recipient restrictions and is not the recommended transport for production users. The Auth HTTP hook is a separate alternative, without external acceptance in this version. [Supabase SMTP reference](https://supabase.com/docs/guides/auth/auth-smtp).

There are two independent email configurations:

- **Supabase Auth:** SMTP or hook, configured in the project itself, for confirmation and recovery.
- **Application:** `EMAIL_TRANSPORT=resend`, installation-owned credentials/sender, and delivery testing for invitations, support, and notifications. Configuring Supabase SMTP does not enable these messages.

Read [email and jobs](../integrations/email-jobs.md) before enabling a hook or signed events. Do not point a hosted container to `MAILPIT_URL=http://127.0.0.1:55434`: inside the container, this address refers to the container itself. Development Mailpit is not an external delivery service.

OAuth, payments, AI, R2, and telemetry may remain disabled. Each enabled integration needs its own account and trial; see [the matrix](../integrations/README.md).

## 5. Prepare environment and presentation

Create both files outside Git, owned by the Compose operator. The environment stays private at `0600`; presentation is public and readable by container UID 1001:

```sh
cd /opt/openmembers
if sudo test -e /etc/openmembers || sudo test -L /etc/openmembers; then echo 'Recuse: /etc/openmembers já existe; inspecione-o sem sobrescrever.' >&2; exit 1; fi
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" /etc/openmembers
install -m 0600 deploy/application.env.example /etc/openmembers/application.env
install -m 0644 openmembers.config.example.json /etc/openmembers/installation.json
```

Edit copies in `/etc/openmembers`; do not change checkout examples. Fill in organization values in the environment file. Root `.env.example` documents additional integrations. Do not print the file in logs or tickets.

Check these deployment options:

```dotenv
OPENMEMBERS_ENV_FILE=/etc/openmembers/application.env
OPENMEMBERS_CONFIG_PATH=/etc/openmembers/installation.json
OPENMEMBERS_IMAGE=openmembers:COMMIT_CANDIDATO
OPENMEMBERS_PORT=3000
```

Replace `COMMIT_CANDIDATO` with the recorded identifier. It is a local image tag, not an image published by the project. The port will bind only to host `127.0.0.1`. `OPENMEMBERS_CONFIG_PATH` is the **host** path; Compose mounts the file at `/app/config/installation.json` and sets `OPENMEMBERS_CONFIG_FILE` inside the container.

| Setting | When and how it is used |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Real HTTPS origin, without a path; provided at build time and kept consistent at runtime |
| `NEXT_PUBLIC_SUPABASE_URL` | Public HTTPS URL for this organization's project; provided at build time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | This project's public `anon` key, used by the browser; provided at build time |
| `SUPABASE_SERVICE_ROLE_KEY` | Matching administrative `service_role` key, server runtime only |
| `SUPABASE_INTERNAL_URL` | Optional server-only origin to reach the same Supabase from the container; public URL remains in `NEXT_PUBLIC_SUPABASE_URL` |
| `OPENMEMBERS_INTERNAL_URL` | Optional server-only origin for the application to read its own assets inside the container; public origin remains in `NEXT_PUBLIC_SITE_URL` |
| `AUTH_ALLOWED_ORIGINS` | Additional HTTPS origins actually used, comma-separated; may remain empty |
| `CERTIFICATE_IMAGE_ALLOWED_ORIGINS` | Additional authorized HTTPS origins for certificate logos/signatures, without paths and comma-separated; may remain empty when assets are on the application or configured Supabase |
| `CRON_SECRET` | Installation-owned random secret, runtime only; also used by the job runner |
| `EMAIL_TRANSPORT`, `RESEND_API_KEY`, sender | Optional application configuration, independent of Auth SMTP |
| `DATABASE_URL` / `DATABASE_POOL_URL` | Optional direct connection used by AI; not required by the members core |

Local checks used Supabase `anon`/`service_role` keys. Do not silently substitute another key type in the pilot: record and test compatibility. Administrative keys bypass RLS and must never enter `NEXT_PUBLIC_*` names, public JSON, or public build arguments. [Supabase key types](https://supabase.com/docs/guides/getting-started/api-keys).

Next embeds `NEXT_PUBLIC_*` values in JavaScript during the build. Changing URL, public key, origin, or public telemetry IDs requires **rebuilding the image**. Restarting with new runtime values does not turn an image compiled for local Supabase into another organization's image. Server secrets and providers are supplied through `env_file`; there is no reason to pass them as build arguments.

The operator's shell takes precedence over the Compose file: remove inherited variables from another installation before build/up to keep public values consistent with runtime. Compose interprets the environment file; do not execute it with `source`. Special characters must follow Compose syntax. `docker compose config` without `--quiet` may expose resolved configuration and secrets; use the silent validation below.

In the `/etc/openmembers/installation.json` created above, adjust identity, text, support, and policies following the [customization guide](../customization.md). JSON contains public presentation only and must be readable by image UID 1001. A public `0644` file in a traversable directory allows this; the secret environment remains restricted. Compose mounts JSON read-only. Referenced local assets must exist in `public` at build time. Certificate logos/signatures may use the application's HTTPS origin, configured Supabase, or an additional origin declared in `CERTIFICATE_IMAGE_ALLOWED_ORIGINS`; internal paths, redirects, and undeclared origins are rejected.

## 6. Build and start the application

The operator runs these commands on the **new host**, after completing the environment file and verifying the Supabase project:

```sh
cd /opt/openmembers
unset DOCKER_CONTEXT DOCKER_HOST BUILDKIT_HOST BUILDX_BUILDER
unset COMPOSE_FILE COMPOSE_PROJECT_NAME
unset OPENMEMBERS_ENV_FILE OPENMEMBERS_CONFIG_PATH OPENMEMBERS_IMAGE OPENMEMBERS_PORT
unset NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
unset NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY NEXT_PUBLIC_SENTRY_DSN
unset NEXT_PUBLIC_GA4_MEASUREMENT_ID NEXT_PUBLIC_META_PIXEL_ID
openmembers_docker_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$openmembers_docker_endpoint" in unix://*) ;; *) echo 'Recuse: o contexto Docker não usa um socket Unix local.' >&2; exit 1;; esac
docker buildx inspect default
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml config --quiet
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml build --builder default app
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml up -d app
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

The reference path requires the active context to resolve to a local Unix socket and uses builder `default` with driver `docker`. The `case` stops before building if the endpoint is not local; also confirm that `docker buildx inspect default` identifies driver `docker`. Do not proceed with TCP/SSH endpoints, Docker Build Cloud, remote builders, or a destination outside the new host. `BUILDKIT_HOST` and `BUILDX_BUILDER` can select another builder even when the expected daemon is local. Rootless Docker requires explicitly adapting and recording the socket, context, and systemd units; do not remove this check to make it work.

The `unset` commands also prevent the shell from overriding paths, image, or public values in `--env-file`. Declare enabled optional public integrations in `/etc/openmembers/application.env`, not the inherited shell. First confirm that `docker compose build --help` offers `--builder`; otherwise, update the host's Compose plugin.

If you chose another `OPENMEMBERS_PORT`, adjust the last URL. Healthy response is HTTP 200 with `status=ok` and `db=ok`. This route confirms a REST query to `tenant_settings`; it does not certify Auth, complete permissions, Storage, email, or jobs. Without minimum variables, the proxy returns configuration 503 before querying the database. HTTP 503 requires checking build, runtime, migrations, and connectivity before continuing.

The [Dockerfile](../../Dockerfile) produces `.next/standalone`, copies `public` and `.next/static`, and starts `node server.js` as a nonprivileged user. Using the artifact outside Docker also requires distributing all three parts; `.next/standalone` alone excludes CSS, static JavaScript, and public assets. Do not reuse a native macOS build as a Linux artifact. `npm start` is the conventional Next server and does not replace proof of standalone packaging.

Installation JSON is not embedded in the build. The application reads the file supplied to its process; after changing deployment configuration, restart/recreate the service and verify name, manifest, and links. Changing container variables requires recreation through Compose, as described in [operations](operations.md).

## 7. Publish the HTTPS origin on the host

Configure the proxy for the selected origin, forwarding to `127.0.0.1:3000` or the configured port. DNS, TLS certificate, and renewal belong to the organization's host. This delivery does not automatically install or configure the proxy.

The proxy must:

- Preserve the public host and correctly set `X-Forwarded-Host` and `X-Forwarded-Proto=https`.
- Overwrite `X-Forwarded-For`/`X-Real-IP` with trusted network identity. The application uses the first XFF address in its login limiter; do not accept an arbitrary client-supplied chain.
- Keep the Node process directly inaccessible from the external network. Compose's loopback binding assumes a proxy on the same host.
- Allow streaming and required upload bodies; the Server Actions and materials limit is 25 MB. Also test the proxy limit.
- Respect cache headers: do not cache sessions, authenticated responses, callbacks, or APIs as shared public content.

Validate the HTTPS URL in the browser, static assets, and `/api/health` through the proxy. Do not add `AUTH_ALLOWED_ORIGINS` domains to conceal a forwarding error. The Auth limiter is in memory per process; multiple replicas and rolling updates require additional planning and validation.

## 8. Create the first hosted superadministrator

`npm run admin:create` remains exclusive to local Supabase. The hosted path uses normal application signup and explicit administrative promotion, without changing metadata or inserting directly into `auth.users`.

1. After migrations and HTTPS, the owner creates an account at `/register` with an address they control and a unique password. Use an authorized test recipient.
2. Confirm the received email and sign in. The trigger should create a profile with role `user` and status `active`.
3. In the **new project's** panel, check the Auth user and copy its UUID. Verify the corresponding address, confirmation, and profile; a display name does not reliably identify the owner.
4. As an administrative operator in that project's SQL Editor, replace the UUID and email below. The block requires a confirmed active profile and refuses promotion if a superadministrator already exists. The transaction changes neither schema nor migration history.

```sql
DO $bootstrap$
DECLARE
  target_user uuid := '00000000-0000-0000-0000-000000000000';
  expected_email text := 'responsavel@example.test';
  affected integer;
BEGIN
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'Superadministrator already exists; use the authenticated administration workflow';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = target_user
      AND lower(u.email) = lower(expected_email)
      AND lower(p.email) = lower(expected_email)
      AND u.email_confirmed_at IS NOT NULL
      AND p.role = 'user'
      AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Confirmed active account and profile do not match the selected identity';
  END IF;

  UPDATE public.profiles SET role = 'super_admin' WHERE id = target_user;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Administrator promotion did not affect exactly one profile';
  END IF;
END;
$bootstrap$;
```

5. Reopen the application and confirm `/admin` access, including superadministrator options. Check in the database panel that only the selected UUID changed roles. Create subsequent administrators through the authenticated workflow.

If the account exists without a profile or promotion fails, do not delete accounts or automatically repeat signup. Check migration application, trigger, and identity; preserve the account for explicit recovery. Auth signup and promotion are not a single transaction. This bootstrap matches the application schema; its hosted execution still needs pilot validation, separately from the local bootstrap.

## 9. Accept the installation and move to operations

Before receiving real members or purchases, run a [pilot with fictitious data](source-package.md) and record results, including:

- Revision and image used; ten applied migrations; no fixtures with public passwords.
- Administrator login, signup/confirmation/recovery on HTTPS, and denied unauthorized access.
- Branding and manifest, installation-owned test course/lesson, enrollment, progress, and private upload/download.
- Auth and application email handled separately; enabled optional providers exercised in installation-owned accounts.
- Actual triggers of all five jobs through the host schedule, status/counters, and behavior after restart.
- Backup and restoration to a separate target, monitoring, and update procedure.

The [operations guide](operations.md) contains jobs, diagnosis, and recovery. Installing schedule templates or manually receiving HTTP 200 does not prove host-triggered execution. Ask someone to follow only the package and these guides and record the results and interventions needed.

For standalone, public-variable, and proxy details, consult documentation shipped with the installed Next version in `node_modules/next/dist/docs/`: `01-app/03-api-reference/05-config/01-next-config-js/output.md`, `01-app/02-guides/environment-variables.md`, and `01-app/02-guides/self-hosting.md`. Confirm hosted-service settings and behavior in the pilot.
