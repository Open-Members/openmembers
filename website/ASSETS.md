# Website assets and provenance

| Material | Source and license | Treatment |
| --- | --- | --- |
| Open Members brand SVGs and icon | `public/brand/` and `public/icon.svg`; project MIT artwork, outlined Montserrat Bold | Copied from exact committed Git objects; original viewboxes/proportions preserved |
| Montserrat source license | `docs/brand/Montserrat-OFL.txt`; SIL OFL 1.1 | Preserved in `dist/assets/Montserrat-OFL.txt`; no font binary or runtime font request |
| Six real product PNGs | `docs/images/`; fictitious local application captures, September 16, 2026 (UTC) | Copied from committed originals. CSS crops and responsive selection are framing only; the gallery opens the original and offers original-size inspection |
| Visual framing, gradients, and color swatches | Original HTML/CSS authored for this site; project MIT | The current monochrome brand sits alongside the application’s semantic colors. No fictional product screens or sample academies |
| Body typography | Arial/Helvetica and Georgia/Times/system fallbacks | Uses the visitor's installed fonts; no font files redistributed |
| Markdown renderer | Marked 15.0.12, [upstream](https://github.com/markedjs/marked), MIT | Fixed in this website's own lockfile; build-time dependency only. Full package license copied to `dist/assets/Marked-LICENSE.txt` |

The [brand guide](../docs/brand/README.md), [application image inventory](../docs/images/README.md), [MIT license](../LICENSE), and [third-party notices](../THIRD_PARTY_NOTICES.md) retain their original scope. The build manifest records SHA-256 and byte length for each committed source asset. Product captures show the current identity and were not retouched or recolored. Presentation screenshots and visual framing do not establish application or provider validation.
