# Security policy

## Supported versions

Open Members is experimental software. No stable release or security-supported release line has been established. The `0.1.0` value in `package.json` is development metadata. Read the [known limitations](docs/known-limitations.md) for validation and operational boundaries. This policy does not establish a response-time commitment, disclosure deadline, or support agreement.

## Report a suspected vulnerability

Do not post vulnerability details, exploit instructions, credentials, personal data, or authentication traces in a public issue, pull request, or discussion.

**GitHub Private Vulnerability Reporting is enabled for this repository.** Open [Report a vulnerability](https://github.com/Open-Members/openmembers/security/advisories/new), or select **Security → Advisories → Report a vulnerability** in the repository. Sign in to GitHub to submit a private report. Public issues and pull requests are not appropriate for sensitive details.

If the private form is unavailable, use an established private contact with the maintainer to request a secure alternative. Confirm the recipient and channel before sharing sensitive material. If no such contact exists, request a private reporting channel without including vulnerability details. No project security email address has been designated.

A useful private report includes:

- The affected commit or release, component, and relevant configuration, with secrets removed.
- Reproduction steps using fictitious accounts and an installation you control.
- Expected and observed behavior, impact, and a minimal sanitized example.
- Any mitigation already tested and whether investigation is continuing.

Test only installations and services you are authorized to assess. Do not include real users' records or live secrets to demonstrate impact. Reports about an operator's private deployment also require coordination with that operator; this project does not provide access to or manage those installations.

## Credential exposure

If a credential has been exposed, revoke or rotate it at its provider and review its use. Removing a value from a later commit does not invalidate it or remove copies from Git history. Keep affected values, authentication traces, and private evidence out of public reports.
