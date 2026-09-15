# Website assets and provenance

| Material | Source and license | Treatment |
| --- | --- | --- |
| Open Members brand SVGs and icon | `public/brand/` and `public/icon.svg`; project MIT artwork, outlined Montserrat Bold | Copied from exact committed Git objects; original viewboxes/proportions preserved |
| Montserrat source license | `docs/brand/Montserrat-OFL.txt`; SIL OFL 1.1 | Preserved in `dist/assets/Montserrat-OFL.txt`; no font binary or runtime font request |
| Six real product PNGs | `docs/images/`; original fictitious pilot captures, September 13, 2026 | Bytes unchanged. CSS crops and responsive selection are framing only; the gallery opens the original and offers original-size inspection |
| Visual framing, gradients, and color swatches | Original HTML/CSS authored for this site; project MIT | Colors follow the existing blue/purple/red application captures. No fictional product screens or sample academies |
| Body typography | Arial/Helvetica and Georgia/Times/system fallbacks | Uses the visitor's installed fonts; no font files redistributed |
| Markdown renderer | Marked 15.0.12, [upstream](https://github.com/markedjs/marked), MIT | Fixed in this website's own lockfile; build-time dependency only. Full package license copied to `dist/assets/Marked-LICENSE.txt` |

The [brand guide](../docs/brand/README.md), [application image inventory](../docs/images/README.md), [MIT license](../LICENSE), and [third-party notices](../THIRD_PARTY_NOTICES.md) retain their original scope. The build manifest records SHA-256 and byte length for each committed source asset. No original product image was retouched or recolored; original branding remains visible. Presentation screenshots and visual framing do not establish application or provider validation.
