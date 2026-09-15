Reference for one application and one installation-owned Supabase per organization. Start with [installation](installation.md). The hosted Linux/VPS path, including scheduling and recovery, still needs [installation validation](validation.md). Templates do not automatically install or enable services; local handler tests do not prove the Linux scheduler.

## Health and configuration

Examples assume an identified checkout at `/opt/openmembers`, Docker at `/usr/bin/docker`, Compose v2 or later, private environment at `/etc/openmembers/application.env`, and presentation at `/etc/openmembers/installation.json`. Run as an operator authorized to administer **this host**. The system-level systemd template uses root to communicate with Docker; daemon access is equivalent to administrative power on the host. The application process remains UID 1001 and does not receive the Docker socket.

```sh
cd /opt/openmembers
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml config --quiet
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml ps
curl --fail --max-time 10 http://127.0.0.1:3000/api/health
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml logs --tail 100 app
```

Do not publish `docker inspect`, `compose config` without `--quiet`, environment files, dumps, or raw logs. The job helper limits its own log; application logs may still contain database identifiers/errors. Restrict access to operations and redact evidence before sharing.

Without minimum configuration, the proxy returns 503 before the route. When configured, `/api/health` checks the process and REST reading of `tenant_settings`; 200 does not validate all migrations, Auth, Storage, email, or scheduling. Compose health checks mark failure but **do not automatically restart** a container solely because it is unhealthy. `restart: unless-stopped` handles process exit. The owner must connect external availability and job-failure alerts on the selected host; the repository configures no channel.

Public build arguments and runtime environment must point to the same installation. Changed `NEXT_PUBLIC_*`: build another image. Changed secrets/transports: recreate the container with `up -d --no-build --force-recreate app`; `restart` does not reload the environment. Changed presentation: validate JSON and recreate the container to also reread files replaced atomically on the host. The public file is mounted read-only but must be readable by UID 1001.

## Runner and schedule

[`scripts/run-job.mjs`](../../scripts/run-job.mjs) accepts exactly one of the names below. It uses GET/Bearer from environment `CRON_SECRET`, a 120-second timeout, a 16 KiB response limit, no automatic redirect/retry, and exit 0 only for HTTP 2xx with a recognized JSON summary. Exit 1 contains a fixed error code, without response body, origin, or secret. Aborting the request **does not necessarily cancel work already started on the server**; inspect the database/queue before manual intervention.

| Job | UTC timer | Success counters |
| --- | --- | --- |
| `expire-enrollments` | Every hour, minute 00 | `expired` |
| `expiration-warning-7d` | Every hour, minute 05 | `sent`, plus `skipped/failed/total` when present |
| `drip-check` | Every hour, minute 10 | `processed/notified` |
| `webhook-retry` | Every minute | `processed/abandoned/rescheduled/batchSize` |
| `webhook-cleanup` | Every five minutes | `rateLimitHitsPurged/graceWindowsCleared` |

`abandoned`/`rescheduled` above zero require queue follow-up even with HTTP 200: the job ran, but not every payment completed. Each handler's semantics and windows are in the [email and jobs guide](../integrations/email-jobs.md). Expiration warnings require working email transport; leaving it unconfigured returns 503 rather than silent success.

Compose fixes the runner origin at `http://127.0.0.1:3000` **inside the container**. Manual use outside it may set `OPENMEMBERS_JOB_ORIGIN` to installation-owned HTTPS or loopback HTTP; the origin accepts no path, username/password, query, or fragment. Do not pass secrets on the command line.

Before enabling timers, manually test each job in the pilot with controlled data and recipients. The example below performs a mutation limited to the cleanup described in the email and jobs guide:

```sh
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml exec -T app node scripts/run-job.mjs webhook-cleanup
```

### Install on the selected host

Only on the dedicated pilot host, after validating application, clock, and transport. Check `command -v docker`; if it differs from `/usr/bin/docker`, adjust `ExecStart` in the copied units and record the adaptation. With rootless Docker, explicitly adapt user/context; the template targets the local system daemon.

```sh
cd /opt/openmembers
timedatectl status
systemd-analyze calendar '*-*-* *:00:00 UTC' '*-*-* *:05:00 UTC' '*-*-* *:10:00 UTC' '*-*-* *:*:00 UTC' '*-*-* *:0/5:00 UTC'
sudo install -m 0644 deploy/systemd/openmembers-job@.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/openmembers-*.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/openmembers-job@.service /etc/systemd/system/openmembers-*.timer
sudo systemctl daemon-reload
sudo systemctl enable --now openmembers-expire-enrollments.timer openmembers-expiration-warning-7d.timer openmembers-drip-check.timer openmembers-webhook-retry.timer openmembers-webhook-cleanup.timer
systemctl list-timers --all 'openmembers-*.timer'
```

Each timer activates a fixed instance of `openmembers-job@.service`; systemd does not start another identical instance while it is active. `Persistent=true` triggers one execution after a pause in which a scheduled time was missed. It does not replay every missed time or extend release/warning windows. This follows the [official timer manual](https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.timer.xml) and [calendar syntax](https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.time.xml).

`TimeoutStartSec=150` limits the Compose client, allowing margin over the helper's 120 seconds. Losing the Docker client may leave the remote process until its own timeout. Do not configure a second scheduler for the same routes or start concurrent manual jobs during verification. The next timer occurrence may try again; failures do not trigger a hidden immediate execution.

### Verify triggers and recovery

Wait at least one complete hour with timers active to cover all five schedules; record start/end UTC and **each timer-triggered execution**, not only `systemctl start`. Query, replacing the name with the job under review:

```sh
systemctl show openmembers-job@webhook-retry.service -p Result -p ExecMainStatus -p ExecMainStartTimestamp -p ExecMainExitTimestamp
journalctl -u openmembers-job@webhook-retry.service --since '1 hour ago' --no-pager -o cat
systemctl list-timers --all 'openmembers-*.timer'
```

In the pilot without real users, record all five job states, introduce a controlled failure in the **pilot** service (for example, stopping it before a retry trigger), demonstrate nonzero status, and restore it. The next occurrence should return to success without queue intervention beyond the planned procedure. Stopping the app does not test a partial handler failure. Record unavailability, partial-failure, and recovery tests separately; manual calls do not replace evidence of scheduled triggers.

For a maintenance pause, without stopping the daemon or other projects:

```sh
sudo systemctl stop openmembers-expire-enrollments.timer openmembers-expiration-warning-7d.timer openmembers-drip-check.timer openmembers-webhook-retry.timer openmembers-webhook-cleanup.timer
systemctl list-units --all 'openmembers-job@*.service'
```

Wait for running units to finish before changing schema or stopping the application. After maintenance, repeat `enable --now` above (already-enabled timers will start); `Persistent` may trigger a catch-up execution. To permanently remove scheduling, use `disable --now` with the same five names. Do not delete Docker volumes.

## Backup and restoration

Before the pilot, define an owner, private destination outside the host, retention, tolerable data loss, and recovery time. Record chosen values and measured time; the project provides no RPO/RTO guarantee. The minimum set is listed below.

`scripts/pilot-recovery.mjs` and `scripts/pilot-recovery-app.mjs` belong exclusively to the local trial with fixed ports, projects, and fictitious data. They are not hosted Supabase backup/restoration tools; do not modify their guards or supply remote URLs/credentials. For this guide's installation, use the contracted mechanism exercised on the separate target below.

| Material | Preserve and verify |
| --- | --- |
| Supabase database | Schema, data, Auth, roles/policies/functions, receipts/queue, and migration history; use a mechanism compatible with the project plan |
| Storage | Bytes and paths from all three buckets, plus database metadata/policies; R2 if enabled |
| Configuration | Environment encrypted in a vault, presentation, Auth/URLs/SMTP/hooks, proxy/TLS, timers, and integration inventory |
| Artifact | Source SHA, image/ID/digest, public build values, versions, and applied migration files |

Supabase database backup **does not include Storage bytes**. Verify actual feature availability in the contracted plan and keep an external copy: [Supabase backups](https://supabase.com/docs/guides/platform/backups). For logical export/restoration, follow the [complete official procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), including roles, schema, data, and Auth/Storage handling; a partial `pg_dump` is not the recovery package. Do not include passwords/connection URLs in shared logs.

Trial procedure, always using fictitious pilot data:

1. Pause writes, incoming webhooks, and all five timers; wait for ongoing work. Record time and functional counts of profiles, courses, enrollments, progress, receipts/queue, and two files of different types with hashes.
2. Back up the set above, record mechanism/time/identifier, and check readability and hashes. Do not run `db:reset`/`db:verify` in this hosted project.
3. Restore to **another installation-owned disposable project/environment**, isolated from real recipients and webhooks, according to the selected method. Do not apply all migrations over a backup that already contains schema/history. Restore file bytes and reapply service configuration outside the database backup.
4. Build an image with the restoration target's public URLs/keys and use its runtime credentials. Check login, administrator role, no unauthorized member access, enrollment/progress, authorized files and denial to an unenrolled user, health, and controlled job execution. Compare counts/hashes and record justified differences.
5. Measure duration and gaps. If it fails, correct and repeat before declaring recovery available. Disable the restored copy after retaining evidence; do not point real DNS or webhooks to it.

Restoring receipts/queue to an older point may reprocess events or repeat emails. Real operation requires reconciling events with the provider before reopening webhooks/timers. This external scenario has not yet passed acceptance.

## Updating and returning to the previous version

Prepare each update in staging with an authorized, separate copy. Keep the previous image by immutable ID/tag, compatible backup, and original public configuration. Do not use `git pull` or a mutable tag as a rollback plan.

1. Review the diff/release notes and new migrations; record target SHA/image. Determine whether the new schema still supports the previous application. Do not assume migrations are reversible.
2. Build the new image with public values from the **same** installation, using a new `OPENMEMBERS_IMAGE` tag; test in staging. `config --quiet` checks resolution, not project identity or credentials.
3. On the target host, pause timers and writes as above; take a backup. Apply only pending migrations through the reviewed hosted [installation](installation.md) path, verifying destination and dry run. Do not use local `db:*` scripts as remote update tools.
4. Confirm the new tag in the private environment and recreate only `app`:

   ```sh
   docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml up -d --no-build --force-recreate app
   curl --fail --max-time 10 http://127.0.0.1:3000/api/health
   ```

5. Validate login, course/member, administrator, files, and expected change over HTTPS; resume timers and observe triggers. Record the window. This Compose has one replica and does not promise zero-downtime updates.

If the new image fails and the schema remains compatible, restore `OPENMEMBERS_IMAGE` to the preserved previous image and repeat recreation/verification. If incompatible, keep maintenance active and execute the rehearsed recovery plan; changing the image alone does not undo SQL or payment/email effects. A recreation/return trial between tags demonstrates only the revisions and schema compatibility actually tested.

## Initial diagnosis

| Symptom | Check and action |
| --- | --- |
| Compose rejects a variable or mount | Complete the absolute environment file, verify existing/readable JSON, run `config --quiet`, and confirm the shell does not override installation variables |
| `/setup` or API 503 | Check build URL/public key and runtime service role; verify migrations and correct project |
| Health 200, login/file fails | Check Auth/URLs, email confirmation, enrollment/RLS, and Storage; health does not cover these flows |
| Job 401 | Check `CRON_SECRET` in application process and runner; recreate after environment changes |
| Warning 503 | Check transport, sender, and partial failures; do not resend outside the window without reviewing the audit |
| Timer has no triggers | Check clock, enabled/active state, ExecStart paths, Docker, and journal; a copied template is not proof of activation |
| Timeout/backlog | Inspect duration/volume and abandoned items; do not blindly increase retries/concurrency |
| Disk full | Identify this installation's files/cache/logs and retention; do not use global pruning or restart unrelated services |

Image/Compose configuration follows [variables and precedence](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) and [Compose services](https://docs.docker.com/reference/compose-file/services/). The project pins Node 22.23.2 in `.nvmrc`, `package.json`, and `Dockerfile`; pinning a version does not replace review of updates and vulnerabilities before distribution.
