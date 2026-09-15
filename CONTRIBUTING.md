# Contributing to Open Members

Help make an independent home for courses and learning communities easier to use, customize, and operate. Open Members is experimental software, with **one application installation and one dedicated Supabase project per organization**. Read the [project overview](README.md), [documentation index](docs/README.md), and [known limitations](docs/known-limitations.md) before choosing a change.

## Choose a change

Useful contributions include reproducible bug reports, clearer installation instructions, translations, accessibility improvements, and tests for open acceptance items. Keep a first contribution focused on one behavior or guide.

Describe the problem and proposed behavior in an issue or pull request. Discuss changes to the installation model, data access, or optional integrations with the maintainer before implementing a broad change. Update the relevant guides when changing public behavior or architecture. Use documentation matching the installed Next.js version.

For a bug report, include the source revision, environment, steps using fictitious data, expected behavior, observed behavior, and sanitized output. Report suspected vulnerabilities through [SECURITY.md](SECURITY.md).

## Set up a development environment

Use Node.js **22.23.2**, selected by [`.nvmrc`](.nvmrc), npm **10.9.2**, and the locked dependencies. These commands assume `nvm` is already installed:

```sh
nvm install
nvm use
npm ci --ignore-scripts --no-audit --no-fund
```

Follow the [local development guide](docs/development.md) to start the isolated Supabase stack, seed fictitious accounts, and open the application. The [detailed Portuguese guide](docs/development/local-database.md) also covers first-administrator provisioning and Storage rules. Use fictitious content and Mailpit for test email.

Local scripts use fixed project names and ports. A second checkout on the same Docker daemon uses the same development stack. Confirm that its services and data are dedicated to your test before starting or resetting it. An independent installation by a new operator remains an open validation item.

For deployment-related work, use the [Linux installation guide](docs/deployment/installation.md), [operations guide](docs/deployment/operations.md), and [source package guide](docs/deployment/source-package.md). The guarded local scripts do not bootstrap a hosted Supabase project.

## Protect data and provenance

- Contribute only code, content, and assets you are authorized to share. Record the source and license of reused material and preserve its notices.
- Keep installation credentials, environment files, database exports, private configuration, authentication traces, and real personal data out of contributions. Use sanitized examples and fictitious screenshots.
- Keep private repositories, deployments, and operational data separate from this project. A contribution must not import another organization's Git history or run its operational scripts.
- Keep server credentials out of `NEXT_PUBLIC_*` variables, build arguments, examples, and logs. Provider tests require explicit opt-in and controlled accounts; avoid incidental delivery to real recipients.
- Follow [SECURITY.md](SECURITY.md) for suspected vulnerabilities or credential exposure. Public issues and pull requests are not private reporting channels.

Project source uses the [MIT License](LICENSE). Third-party code, packages, fonts, and assets retain their own terms; consult [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Distribution of compiled artifacts needs review of the materials actually included.

## Verify the affected behavior

Choose checks that exercise the change, and report their exact commands, results, and environment. Documentation-only edits normally need content, link, command, and rendering review rather than application tests.

For application changes, start with:

```sh
npm run check
npm run lint
npm test
npm run build
npm run verify:artifact
```

Run `npm run test:tooling` when changing scripts or their safeguards. UI changes should exercise the affected desktop/mobile and theme states; the [README](README.md#verification) describes public, branding, and authenticated browser suites. Keep provider tests opt-in and record which provider was exercised. The [known limitations](docs/known-limitations.md) describe intermittent branding failures; a retry alone does not demonstrate a fix.

Database or authorization changes need the relevant contracts and authenticated checks on the isolated stack. **`npm run db:verify` deletes and recreates the local development database twice.** Use it only when the data is disposable and no other work depends on that stack. Preserve test guards and existing evidence before repeating commands that overwrite it.

After committing, run `npm run verify:source` from a checkout with no staged or unstaged tracked changes. This offline check reads the exact committed snapshot for documented local-material paths and credential signatures. It does not scan untracked files or previous commits; see the [source verification guide](docs/source-verification.md). If a real credential is exposed, removing it from a later commit does not invalidate it or remove it from history.

Distinguish static review, environment preparation, successful runtime checks, and production verification. Report failures and unresolved limits alongside successful checks. A local build or manual job invocation does not demonstrate installation or scheduled execution on a Linux host.

## Prepare the pull request

Lead with the concrete problem and resulting behavior. Include:

- The related issue, intended behavior, and any significant design decisions.
- Verification commands, environment, results, and checks not run.
- Relevant UI screenshots using fictitious data.
- Installation, configuration, migration, or operational changes reviewers need to assess.
- Source, license, and notice updates for newly included third-party material.

Update affected guides and the [unreleased changelog](CHANGELOG.md) when behavior or installation changes. Update the known limitations when a correction has been verified. Deployment and publication are separate maintainer actions.
