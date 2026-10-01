# Proposal: advanced appearance customization

Status: draft proposal for discussion. This document does not implement the controls, add fonts, or introduce a database migration. The implementation and its runtime verification remain pending.

## Problem and goal

Administrators can currently configure identity, colors, a system font family, the dashboard hero, and the loading indicator through [Admin Branding](../../features/Admin/components/AdminBranding.tsx). The [branding contract](../../core/theme/branding.ts) offers `system`, `serif`, and `mono`; it has no configurable button style or corner radius. Hero imagery is distinct from a full-page background.

Extend this mechanism so an installation can choose additional fonts, a home background, button appearance, and corner shapes without editing application components. Existing installations must keep their appearance until an administrator opts into a new setting.

## Proposed first delivery

| Area | Proposed behavior | Compatibility requirement |
| --- | --- | --- |
| Fonts | Extend a reviewed catalog with a small set of named font choices and reliable fallbacks. Record the source and redistribution terms of each included font. | Preserve the current three choices. Define whether new choices affect body text, headings, or both before implementation. |
| Home background | Allow a validated color or image for the selected home surface, with readable content and a way to restore the default. | Keep the existing hero controls independent. Confirm whether the target is the public entry, the signed-in dashboard, or both; each surface needs an explicit scope. |
| Buttons | Offer bounded appearance choices, including foreground/background treatment and shape, applied through shared styles or components. | Preserve focus, hover, pressed, and disabled states. Specify which button categories participate so status and destructive actions keep their meaning. |
| Corners | Offer named rounding presets for the supported component categories, such as buttons, inputs, and cards. | Preserve existing shapes by default; do not silently apply one radius to every component. |

Use this scope as the first iteration. Arbitrary administrator-supplied CSS, uploaded fonts, and a general page builder require separate proposals. A preview and restore-default control should accompany the new settings, with failed saves retaining the administrator's edits.

## Integration approach

Extend the existing branding flow rather than creating a second settings system:

1. Add validated presentation settings and explicit defaults to the [branding contract](../../core/theme/branding.ts). Preserve the documented precedence: built-in defaults, installation file, then valid saved administrative fields.
2. Extend [administrative input validation](../../core/theme/admin-branding.ts), the existing load/save actions, and [Admin Branding](../../features/Admin/components/AdminBranding.tsx). New saved settings must remain restricted to authorized administrators.
3. Connect the selected appearance to shared styles in the [root layout](../../app/layout.tsx) and [global stylesheet](../../app/globals.css), and update affected components to consume those values. A new setting alone does not change components that still use fixed styles.
4. Include compatible, versioned storage changes if persistence requires them. Preserve existing saved branding and document the order of migration and application update. Choose the exact storage representation during implementation design.
5. Provide localized labels, validation messages, and help for the supported interface languages. Update [customization](../customization.md), configuration examples, the changelog, and third-party notices when implementation changes their contracts.

Consult the documentation shipped with the installed Next.js version before choosing a font-loading implementation. Prefer fonts and assets whose loading, distribution, and fallback behavior can be verified for the actual application build.

The installation model stays one application installation and one dedicated Supabase project per organization, as described in the [documentation index](../README.md). This proposal does not introduce a shared-database organization model.

## Contribution and delivery

Develop the reusable behavior on a branch from the public repository's `main`. Any external implementation used as a reference must be reviewed file by file for compatibility and redistribution rights; contribute fictional examples and independently reviewed assets.

The current draft PR contains only this proposal and its documentation-index link. Subsequent implementation can be reviewed in focused increments: font choices, home backgrounds, then shared button and corner controls. Each increment must preserve defaults and include its own verification evidence. Integrating a PR and updating an existing installation are separate steps.

## Acceptance criteria for implementation

- An authorized administrator can select, save, reload, and restore each supported appearance option.
- Existing installations and their saved branding retain their appearance when the new settings are not configured.
- Preview and saved appearance agree on the surfaces included in the implementation scope.
- Invalid values cannot reach the rendered theme, and non-administrators cannot save presentation changes.
- Text, controls, and focus indicators remain readable in light and dark themes, on desktop and mobile, including over background images.
- Every supported button state works, and changing appearance preserves the button's action and accessibility.
- Included fonts have documented sources and licenses, reliable fallbacks, and verified loading without an avoidable initial layout shift.
- Configuration examples, translations, migration instructions when applicable, and customization documentation match the delivered behavior.

## Verification

For this documentation-only proposal, review the diff and relative links, run `git diff --check`, and run `npm run verify:source` against the clean committed snapshot before publication. Application tests and screenshots do not establish anything about an unimplemented feature and are not required for this proposal.

For implementation, follow [CONTRIBUTING](../../CONTRIBUTING.md): run the relevant type, lint, unit, build, artifact, authenticated, and branding checks using fictitious data and isolated development services. Record exact commands, environment, results, and any checks not run. Verify persistence and authorization when storage changes, and distinguish local results from hosted CI and production verification.
