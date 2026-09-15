Open Members uses an independent installation per organization. Its presentation can be configured without editing application components. This configuration does not create organizations in a shared database or provision external services.

## Public configuration

Copy the example at the project root:

```sh
cp openmembers.config.example.json openmembers.config.json
```

Git ignores the local file. It contains public information only. To use another path, set `OPENMEMBERS_CONFIG_FILE` to an absolute path or one relative to the server's working directory. An explicit missing path, invalid JSON, unknown field, or invalid value produces a configuration error; file values are not copied into the error message.

Without a file or explicit path, the application uses neutral defaults. The loader does not fetch remote URLs, and the file does not accept credentials. Do not use it to configure Auth, database, payments, email, or deployment: those settings remain in their dedicated variables.

Example of a fictitious identity:

```json
{
  "branding": {
    "site_name": "Jardim Academy",
    "logo_light_url": "/branding-example.svg",
    "logo_dark_url": "/branding-example.svg",
    "favicon_url": "/branding-example.svg",
    "primary_color": "#0f766e",
    "accent_color": "#b45309",
    "font_family": "serif"
  },
  "public": {
    "title": "Conhecimento que floresce",
    "description": "Cursos para aprender no seu ritmo."
  },
  "metadata": {
    "description": "Aprenda com a Jardim Academy.",
    "shortName": "Jardim"
  },
  "links": {
    "support": "mailto:support@jardim.example.test",
    "terms": "https://policies.example.test/terms",
    "privacy": "https://policies.example.test/privacy",
    "community": "https://community.example.test/"
  }
}
```

The `.example.test` domains are demonstrations. Replace them with the organization's destinations before using the installation. The example drawing is in `public/branding-example.svg`; it is a generic project asset. See the [brand guide](brand/README.md) for assets and their provenance.

## Fields and precedence

| Group | What it configures |
| --- | --- |
| `branding` | Name, logos, favicon, social image, colors, font, dashboard hero, and loading indicator |
| `public` | Public entry title and description; `null` uses existing neutral translations |
| `metadata` | Browser/sharing description and short manifest name. `description: null` uses default text in the account/visitor language; a custom string is preserved across languages |
| `links` | Support, help, community, terms, and privacy; `null` retains the declared fallback or omits the link |

Branding field precedence is **defaults → file → valid fields saved in `tenant_settings`**. Existing administrative configuration has priority, including `null` in nullable fields; this lets a saved logo be cleared. Malformed database values are not used, and unknown columns are not propagated by the loader.

For an installation with a database, **Admin → Branding** remains the editor for names, logos, colors, font, hero, and loading indicator. Entry text, description/short name, and public destinations are defined in the file. The file does not automatically overwrite branding already saved in the panel.

Available fonts are `system`, `serif`, and `mono`, using system fonts. No external font is downloaded. The selector affects base text; heading styles may retain their own composition when specified by the component. Colors accept six hexadecimal digits; hover variants and scales are derived, and primary control text color is selected by contrast.

Use HTTPS URLs or local paths beginning with a single `/`. HTTP is allowed only on loopback for local development. `support`/`help` links also accept simple `mailto:` or `tel:` phone links; do not include sending parameters. Protocol-relative links, executable schemes, backslashes, URL credentials, and ambiguous paths are rejected. The same handling protects custom menu links. Invalid URLs already stored in the menu are omitted from navigation.

Logos, favicons, and social images may use installation-owned asset paths or safe public URLs. Prefer assets hosted by the installation. Replacing or removing an image in the form does not delete the active asset before saving; replaced files may need later administrative cleanup.

## Surfaces and states

- Resolved names, logos, and colors appear in entry, navigation, authentication, footer, and setup states. The manifest uses the same configuration's name, icon, and color.
- Terms and privacy point to configured policies. Without a configured policy, the internal page states that absence; it does not invent organizational terms.
- Support uses the configured public destination when available. Otherwise, the footer offers internal support. The suspension page does not show a fictitious address or direct users to an area requiring an active account.
- Opening the confirmation page does not by itself establish an approved purchase or promise email delivery without evidence.
- A course without a valid checkout directs users to internal support. An absent offer does not imply a sale is available. The library explains that materials follow access/release rules.
- Course chat requires `COURSE_CHAT_ENABLED=true` opt-in and mandatory configuration; otherwise, it is not mounted. Having keys does not establish that AI or other providers are operational. See [chat requirements and limits](features/overview.md).

The file applies the same custom text to every available language. When those fields are `null`, existing translated defaults are used. Custom text is not translated automatically.

## Emails

The ten transactional templates use the resolved name, logo, and color, with button contrast and link validation. During onboarding, `links.community` and `links.help`/`links.support` take precedence over the legacy `MEMBERSHIP_COMMUNITY_URL` and `MEMBERSHIP_HELP_URL` fallbacks, which are also validated.

Sender and provider remain independent of branding. Rendering templates and capturing messages locally in Mailpit do not prove external delivery. The default local Supabase/Mailpit template still belongs to Auth: customizing those emails requires configuring and validating the provider hook/template, as described in the [integration matrix](integrations/README.md).

## Run and verify

```sh
npm run dev
```

Without Supabase, this allows entry, policies, identity, and setup checks. With the local stack available, use `npm run dev:local` and also validate the panel and authenticated navigation. Check image uploads, saving, replacement/discarding, and student reading in light/dark themes on desktop and mobile.

To test the same build with default and fictitious identities:

```sh
npm run build
npm run verify:artifact
npm run test:e2e
npm run test:e2e:branding
```

The suites use `localhost:3100` and `localhost:3102`, respectively, and their own fixtures. Tests do not change any personal configuration file. Generated captures go in `test-results`, which Git ignores.

For deployments with `output: standalone`, provide the file in the working directory or mount it and specify its absolute path. The ignored local file is not automatically included in the container. The [installation guide](deployment/installation.md) uses `/etc/openmembers/installation.json` on the host, mounted read-only at `/app/config/installation.json`, with `OPENMEMBERS_CONFIG_FILE` set by Compose. Restart the process after changing deployment configuration and verify metadata, manifest, and pages. Local packaging does not replace validation of the hosted installation.
