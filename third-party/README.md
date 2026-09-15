# Third-party license materials

This directory preserves original license texts for versioned dependencies. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) describes the dependency and distribution scope. The texts are not translated or reformulated.

## Active npm supplements

[`supplements.json`](supplements.json) maps exact package versions to original license files and SHA-256 hashes. The [notice collector](../scripts/collect-third-party-notices.mjs) accepts only the listed versions; it does not infer coverage for another version from a matching package name.

| Packages | Version | License text | SHA-256 |
| --- | --- | --- | --- |
| `@next/env`, `@next/eslint-plugin-next`, `eslint-config-next` | `16.3.5` | [Next MIT license](licenses/next-16.3.5-license.md) | `ee765244e2d59f5234d474f62e0766fa0c8b99af967fdd4c0cb8dcb0c76ea224` |
| `@supabase/functions-js`, `@supabase/postgrest-js`, `@supabase/realtime-js`, `@supabase/storage-js`, `@supabase/supabase-js` | `2.100.0` | [Supabase JS MIT license](licenses/supabase-js-2.100.0-LICENSE) | `334dd6820e2eaeab2064e7c59001b810566728a28a41a7c1dbf69bbee17d0936` |

The Next license comes from [commit `ca2c75e`](https://github.com/vercel/next.js/blob/ca2c75eb7f8d9dd012a8bb83c06132149fe221f9/license.md), identified by tag `v16.3.5`. The corresponding upstream manifests declare version `16.3.5` and MIT. npm metadata does not provide `gitHead` for these versions; its tarball integrity and published provenance content correspond to that source revision. This is source and content matching, not independent cryptographic verification of npm provenance signatures.

The Supabase JS license comes from [commit `9ee9997`](https://github.com/supabase/supabase-js/blob/9ee9997608ae9f6d28717dcda4c4a85a66208069/LICENSE), identified by tag `v2.100.0` and npm `gitHead`. Its upstream package manifest uses the preparation version `0.0.0-automated`; the release association comes from the tag and published package metadata. The five listed packages share that exact source license.

## Node

[Node 22.23.2 LICENSE](evidence/node-22.23.2-LICENSE) preserves the consolidated original text for Node and components including V8, ICU, OpenSSL, libuv, npm, and zlib.

- Source: [Node commit `aa4c775`](https://github.com/nodejs/node/blob/aa4c77582be995286fc6e00aaf530dc7ade102a9/LICENSE), resolved from tag `v22.23.2`.
- Size: 145,485 bytes.
- SHA-256: `c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4`.

This text is outside the npm supplement manifest. The npm collector does not automatically include `third-party/evidence` in a container image. The retained license does not establish the composition or notice coverage of a specific Node binary or complete image.

## Supabase CLI scope

The `supabase@2.117.0` npm package declares MIT, but its complete package-root notices remain unresolved. The retained [Go-component license](evidence/supabase-cli-go-2.117.0-LICENSE) identifies a narrower scope:

- Source: [`apps/cli-go/LICENSE` at commit `21db855`](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli-go/LICENSE), resolved from tag `v2.117.0`.
- Size: 1,088 bytes.
- SHA-256: `81f7d60afa4316010b1c0df8eb8f0c80b27586a86b72f1bde85e129bfd10d52a`.

This file is deliberately absent from `supplements.json`: it does not establish the copyright notices applicable to the npm shim and all aggregated components. A missing supplement is a coverage limitation, not a conclusion that the declared license is incompatible.

## Coverage limits

Preserve original copyright and license terms when using these materials. A version change requires checking the corresponding source and integrity again. Package-root texts and this manifest do not establish coverage for every transitive dependency, bundled component, native library, or base-system package.

The source distribution contains these license texts, not the associated executable toolchains. Any distribution that includes those executables or a container image must account for its actual components and applicable notices, source materials, and other terms. See [compiled distribution](../THIRD_PARTY_NOTICES.md#compiled-distribution).
