# Open Members brand

Open Members uses an open-doorway symbol, an uppercase wordmark and a monochrome palette. Use the supplied vector masters for product and documentation artwork.

## Assets

Use the SVGs as the production masters. They contain vector paths and do not need an installed font, a font download or an external image to render.

| Asset | Intended use |
|---|---|
| [Dark mark](../../public/brand/mark-dark.svg) | Dark symbol on a light background |
| [Light mark](../../public/brand/mark-light.svg) | Light symbol on a dark background |
| [Dark wordmark](../../public/brand/wordmark-dark.svg) | Horizontal logo on a light background |
| [Light wordmark](../../public/brand/wordmark-light.svg) | Horizontal logo on a dark background |
| [Default icon](../../public/icon.svg) | Light symbol within a dark square tile |
| [Organization avatar](../../public/brand/openmembers-avatar.png) | Square PNG for the GitHub organization profile |
| [Organization avatar — JPG](../../public/brand/openmembers-github.jpg) | Alternative 500 px JPEG export for upload |
| [README cover](../images/openmembers-cover.svg) | Project introduction and documentation |

The color suffix describes the artwork, not the background: `wordmark-light.svg` belongs on a dark surface. Use the icon when there is too little room for the complete wordmark. Preserve the asset's aspect ratio and keep surrounding text or controls outside a clear space of at least one quarter of the symbol's height. The mark and lettering should stay together in the supplied horizontal composition.

Use one solid ink with ample contrast. Keep the symbol free of gradients, shadows, outlines, textures and accent colors. Do not stretch it or substitute a different typeface inside the supplied lockup. Course imagery and semantic interface colors remain separate from the brand artwork.

The core inks are **near-black `#101010`** and **off-white `#F5F3EE`**. Master viewboxes are 244 × 176 for the mark, 690 × 100 for the wordmark, 64 × 64 for the icon and 1440 × 440 for the cover. These are scalable vector dimensions, not required display sizes.

## Application defaults

The default wordmark appears in authentication, navigation and the footer only when the installation has no configured logo and retains the name “Open Members”. A configured logo or custom name takes precedence. A custom favicon remains supported. See [customization](../customization.md).

The brand artwork does not set the application's content fonts or semantic theme colors. The [product screenshots](../images/README.md) predate this identity and retain their original pixels.

## Typography and license

The wordmark uses Montserrat Bold (weight 700), converted to vector outlines. The font is not an application dependency and is not downloaded at runtime.

Source: the official [Google Fonts Montserrat directory at revision `8b0a1d0`](https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/montserrat). The distributed files are the outlined artwork and the preserved [SIL Open Font License 1.1](Montserrat-OFL.txt).

| Source file | Bytes | SHA-256 |
|---|---:|---|
| `Montserrat[wght].ttf` | 744,936 | `0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7` |
| `OFL.txt` | 4,400 | `8b7141c03fa4f8d44e6345d5d4931709290f0f67875e452e95ac1fd3a027802e` |

The font copyright is **2024 The Montserrat.Git Project Authors**. The repository's MIT license does not replace the font's OFL. See [third-party notices](../../THIRD_PARTY_NOTICES.md) for the source-distribution context.

