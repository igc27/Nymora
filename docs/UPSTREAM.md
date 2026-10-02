# Upstream tracking

Nymora reuses selected MIT-licensed source from Stremio/stremio-addon-client. It is not a fork of the complete Stremio web application or desktop shell. Its addon semantics follow the Stremio HTTP addon protocol.

## Pinned references

| Repository | Inspected commit | License evidence | Decision |
|---|---|---|---|
| https://github.com/Stremio/stremio-addon-client | 7c66830cfc1a8e749373d9df0bb105c7dad33bfd | LICENSE.md: MIT, Copyright © 2019 SmartCode OOD | Selected code in vendor/ |
| https://github.com/Stremio/stremio-addon-sdk | ec4e0a49e61bac4f2285891d39414dfbafe93f58 | LICENSE.md: MIT, Copyright © 2019 SmartCode OOD | Protocol reference snapshot only |
| https://github.com/Stremio/stremio-web | d4275cb250ca722cf06439645dc8c250a8b68e36 | LICENSE.md: GPL v2; source copyright Smart code 203358507 | Architecture study only |
| https://github.com/Stremio/stremio-video | 0df46746ec557fb15c63b56b5ea148beb20035e3 | No LICENSE file; package declares MIT | Excluded from reuse |
| https://github.com/Stremio/stremio-shell | c3a8bcbf857d5569b6ae7444ead0dc0a0814888b | LICENSE.md: GPL v3; original project contributors, no separate holder declaration found in inspected main/mpv source headers | Qt/QML + native mpv architecture studied; no copied code or binaries |
| https://github.com/Stremio/stremio-core | 065237d69f0c8c60c5ec2049b46f592c0d37d321 | LICENSE.md: MIT, Copyright © 2019 SmartCode OOD | Rust models, runtime/Env and HTTP addon transport studied; no copied executable code |

MIT requires preservation of copyright and permission notices, without compulsory source disclosure. GPL v2/v3 derivative distributions would require their notices, license and corresponding source under the applicable GPL version. None of the excluded web/shell/video/core executable components is distributed by Nymora.

## Architecture studied

Upstream core uses explicit state models and effects behind an Env boundary for fetch and storage; web bridges to core WASM in a worker. Its catalogs request declared extras, metadata contains episode video IDs, streams target those exact IDs, and subtitle resources use stream identification extras. The shell integrates QML/QtWebEngine with native mpv and a separate streaming server. Nymora keeps the resource architecture, replaces account/profile services with a local store and packages a self-contained Electron UI. hls.js and Chromium supply the media engine; a token-protected loopback proxy handles byte ranges, HLS relative URLs and addon request headers.

## Reviewing future changes

Clone each upstream into a separate ignored checkout, fetch its current default branch, and diff from the pinned commit. Compare selected files against vendor/stremio-addon-client and review protocol changes. The complete upstream Git history remains available at the above repositories; Nymora starts its own history and records exact source origins rather than inventing shared ancestry.

Preserve LICENSE.md when updating vendored files. Review any changed license before copying new code. Update this table, OPEN_SOURCE_AUDIT.md and THIRD_PARTY_NOTICES.md, describe modifications, and run unit and desktop end-to-end tests. Merge protocol fixes selectively; do not bring upstream credentials, compiled signing materials, branding, automatic addon collections, analytics or cloud-account requirements into the product.
