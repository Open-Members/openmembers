# Advanced appearance customization

This design record describes the appearance controls implemented in the existing branding flow. See the [usage and migration guide](../features/appearance.md).

## Delivered scope

| Area | Behavior | Default compatibility |
| --- | --- | --- |
| Fonts | System families plus self-hosted Inter, Montserrat and Lora; independent body and heading selection | Existing families and editorial heading composition remain available |
| Entry backgrounds | Independent public home, login and registration color/image settings; position and overlay | Nullable settings preserve each existing surface |
| Public copy | Administrator-authored home title/description | Installation copy, then neutral translations, supply the fallback |
| Buttons | Named square, rounded and pill shapes for marked action buttons | No shape override unless selected; media controls and tabs keep their geometry |
| Preview | Inert draft simulation in desktop/mobile and light/dark; explicit copy and discard | No settings write before Save changes; failed saves retain edits |

The dashboard hero remains independent. Card/input radii, arbitrary CSS, uploaded fonts, button color recipes and a general page builder are outside this delivery.

## Integration decisions

Extend the [branding schema](../../core/theme/branding.ts), [administrative parser](../../core/theme/admin-branding.ts), existing actions and [Admin Branding](../../features/Admin/components/AdminBranding.tsx). Use explicit catalog values, semantic theme tokens and a shared background renderer for preview and published surfaces. Preserve defaults → installation file → valid saved fields precedence.

Persistence adds nullable columns with strict checks and existing administrative RLS. Missing appearance columns cause a legacy read, keeping saved identity during an additive rollout. Uploaded backgrounds are restricted and verified before settings are updated. Sources and licenses of locally served fonts are independently recorded.

The installation model remains one application and one dedicated Supabase project per organization. No source history, customer branding, credentials, content or production workflows are part of this contribution.

## Verification contracts

Verify administrative authorization, defaults and malformed inputs, independent save/clear/copy, failed saves and retry, safe uploads and retained published assets, actual font loading, button shape, localized controls and responsive public pages. Use the unit, database and browser suites described in [CONTRIBUTING](../../CONTRIBUTING.md). Report the tested revision/environment separately from hosted CI and production validation.
