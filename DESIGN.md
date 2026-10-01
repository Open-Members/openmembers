---
version: alpha
colors:
  primary: "#0235a8"
  accent: "#f20505"
  background: "#ffffff"
  foreground: "#040d1f"
  border: "#dde2ef"
  darkBackground: "#0a0b0e"
  darkForeground: "#f2f1ee"
  errorText: "#b91c1c"
  errorSurface: "#fef2f2"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
  display:
    fontFamily: "Georgia, ui-serif, serif"
rounded:
  appearanceControl: "12px"
  appearancePanel: "16px"
  squareButton: "0px"
  roundedButton: "12px"
  pillButton: "9999px"
omitted:
  - section: spacing
    reason: "Existing Tailwind utilities and shared component layouts own spacing."
  - section: components
    reason: "Component recipes remain in the existing application primitives."
---

# Open Members visual context

## Overview

A learning library with editorial display type and a practical administration panel. Public and member screens express installation identity; administration prioritizes clear labels, grouped settings and recoverable work. This document records existing choices and the appearance feature, without prescribing a redesign of every screen.

The canonical runtime owners are [globals.css](app/globals.css), [branding](core/theme/branding.ts) and [presentation](core/theme/presentation.ts). This document mirrors them; it does not generate tokens.

## Colors

Primary and accent are configurable installation colors. Foreground on filled brand actions is derived by contrast. Light and dark themes retain semantic surface roles. Authentication error feedback uses independent error tokens, including dark equivalents `#fca5a5` / `#3b1717`, so a brand accent cannot conceal failures.

Solid entry backgrounds derive foreground, muted and border values from the chosen color. Image overlays use the active background token; administrators must check image legibility in both themes.

## Typography

System sans is the default body family. Georgia supplies editorial display contrast. Optional local Inter, Montserrat and Lora are catalog choices, not a replacement brand. Heading inheritance is explicit; absent heading settings preserve current composition. Supported UI locales are English, Brazilian Portuguese and Spanish. Use complete normal variable fonts and system fallbacks; italic styles use browser synthesis when selected fonts lack an italic file.

## Layout

Admin Branding keeps its existing max-width and vertical Section/Field rhythm. Each entry-screen fieldset groups controls beside an inert preview at large widths and stacks them on phones. A preview can simulate a narrow viewport within this frame; it does not resize the entire editor. The save/discard bar retains the existing workflow. No extra nested document scrollbar is introduced. Global scrollbars consume foreground/surface tokens, with standards properties, WebKit fallback and system colors in forced-color mode; horizontal scrollbar-hide utilities remain independent.

## Elevation & Depth

Theme surfaces and thin borders establish form hierarchy. Preview frames separate simulation from editable controls. Keep existing auth backdrop and shell treatment when no override is selected. Do not add decorative elevation solely to signal customization.

## Shapes

Controls and appearance panels use existing rounded-xl/rounded-2xl vocabulary. Action-button shape overrides are opt-in and apply only to `data-brand-button`. Native selectors, mode controls, media controls and tabs retain functional geometry. Card and input radii are independent of the action-button setting.

## Components

| Role | Owner | Runtime mapping |
| --- | --- | --- |
| Body / heading fonts | Theme catalog and presentation | `--font-sans` / `--font-display` |
| Action shape | Appearance catalog and presentation | `--brand-button-radius` on marked actions |
| Entry surface / preview | EntryBackground | Shared layer and derived surface CSS variables |
| Editing and publication | AdminBranding / server action | Local draft, explicit save, discard, retained edits after failure |
| Image input | ImageUpload / Storage validation | Native picker plus drop target, busy state, size/type/signature checks |
| Selects and range | Native controls | Platform-owned popup geometry and keyboard behavior are accepted |
| Color and feedback | ColorPicker / appToast | Existing localized component behavior |

Use Lucide icons, localized names and project focus styles. No new motion system is introduced; reduced-motion behavior remains owned by the existing stylesheet.

## Do's and Don'ts

Preserve the installation's current look until an administrator opts in. Keep the three entry backgrounds independent, and use the same layer for draft and published surfaces. Expose errors with semantic feedback and keep failed drafts editable.

References for this extension: [Attio](https://attio.com) supports distinct display and utility font roles; [Cal.com](https://cal.com) supports deliberate action silhouettes. Refero's [Vimeo customization screen](https://refero.design/pages/b3260ffa-bfb9-4abf-a7de-302410531b63) and [Tome typography editor](https://refero.design/pages/bdc19655-2c12-4620-8ba4-d125fdaa3285) inform grouped controls with immediate preview. Existing Open Members components remain the primary reference. Do not import reference palettes, proprietary fonts or imagery, and do not turn the settings page into a page builder.

Solid entry backgrounds derive the logo variant from their readable foreground, independent of the global theme. Home, authentication and footer artwork share this rule with the draft preview. Image and default backgrounds keep theme-based artwork selection.
