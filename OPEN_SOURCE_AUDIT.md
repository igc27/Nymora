# Nymora 1.0.0 open-source audit

Audit started 2026-10-03. This file records evidence and distribution decisions, not a claim that every Stremio repository shares a license.

## Reused upstream components

| Repository | Exact revision | License and copyright | Reuse and modifications | Obligations |
|---|---|---|---|---|
| [Stremio/stremio-addon-client](https://github.com/Stremio/stremio-addon-client) | `7c66830cfc1a8e749373d9df0bb105c7dad33bfd` | MIT; Copyright © 2019 SmartCode OOD, read from LICENSE.md | AddonClient, promisify, resource matching, stringifyRequest; selected source files vendored. Resource objects may inherit manifest types/idPrefixes. The original network transport is replaced by a bounded, validated native-fetch transport. | Preserve original full MIT license and copyright with source and binaries. No copyleft/source disclosure requirement; source is nevertheless published. |
| [Stremio/stremio-addon-sdk](https://github.com/Stremio/stremio-addon-sdk) | `ec4e0a49e61bac4f2285891d39414dfbafe93f58` | MIT; Copyright © 2019 SmartCode OOD, read from LICENSE.md | Protocol documentation studied for HTTP resource paths, manifests, catalogs, metadata, streams, subtitles. SDK executable code is not bundled. | Preserve MIT notice for copied protocol documentation snapshots in third_party. |

Vendored addon-client filenames and require paths use `.cjs`; the original implementation and full license are preserved apart from the documented resource-filter inheritance adjustment. The addon SDK documentation snapshot is unchanged.

## Playback and desktop dependencies

* Electron 44.5.1: MIT, Copyright (c) Electron contributors and Copyright (c) 2013-2020 GitHub Inc.; the official runtime LICENSE was read before running it. electron-builder preserves it as LICENSE.electron.txt beside Nymora.exe. Preserve that notice and the bundled LICENSES.chromium.html for Chromium, FFmpeg and other runtime subcomponents. No Electron source modifications.
* hls.js 1.7.3: Apache-2.0, Copyright (c) 2017 Dailymotion; derived portions acknowledge Copyright (c) 2013-2015 Brightcove. The package LICENSE was read before using its distribution. Preserve these notices and supply the full Apache License 2.0 text in third_party/Apache-2.0.txt and the About notices. Unmodified pinned distribution; no upstream changes to identify. Apache-2.0 is permissive, with license/notice preservation and relevant patent provisions; no compulsory source disclosure.
* Important build/test tools and their versions, package origins, licenses and usage appear in third_party/dependency-inventory.json. They are not media-client runtime code. npm package integrity is pinned in package-lock.json; official registry metadata supplies the integrity hashes. A local fallback mirror was used only after integrity verification because official tarball transfers were stalled; the committed lockfile retains official npm registry URLs.
* NSIS installer runtime 3.0.4.1 from electron-builder-binaries: inspected its bundled COPYING, Copyright (C) 1999-2018 Contributors. zlib/libpng for the principal code and plugins, bzip2 for its compression module, CPL-1.0 for LZMA with the explicit linking exception. Native modules are unmodified; original COPY­ING is preserved in third_party/NSIS-COPYING.txt and the application notices. Nymora's original installation script and runtime-file permission manifest are separate original source. NSIS source is available from https://nsis.sourceforge.io/ and its exact build bundle from https://github.com/electron-userland/electron-builder-binaries/releases/tag/nsis-3.0.4.1. 7-Zip is used only as a build/extraction tool and is not distributed as a standalone application component.

## Inspected but not incorporated

* `Stremio/stremio-web`, revision `d4275cb250ca722cf06439645dc8c250a8b68e36`: LICENSE.md is GNU GPL version 2; package declares gpl-2.0. Source headers include Copyright (C) 2017-2023 Smart code 203358507. Studied core/services/player boundaries. No source or assets copied. A derivative distribution would require GPL-compatible licensing, notices and corresponding source. Nymora does not distribute this application.
* `Stremio/stremio-video`, revision `0df46746ec557fb15c63b56b5ea148beb20035e3`: package declares MIT, author Smart Code OOD, but the inspected repository contains no LICENSE file. Excluded from copying/distribution because the requested license-file audit cannot be satisfied.
* `Stremio/stremio-shell`, revision `c3a8bcbf857d5569b6ae7444ead0dc0a0814888b`: LICENSE.md contains GPL v3. Qt/QML and mpv integration studied; no copied code or binaries. A derivative would require GPL v3 notices, license and corresponding source. Separate copyright-holder evidence was not found in the inspected main/mpv headers; no redistribution is attempted.
* `Stremio/stremio-core`, revision `065237d69f0c8c60c5ec2049b46f592c0d37d321`: LICENSE.md contains MIT, Copyright © 2019 SmartCode OOD. Rust model/effect architecture and HTTP resource encoding studied; no executable code copied. MIT redistribution requires the copyright and permission notice; no mandatory source disclosure.

## Architecture decision

Reuse the proven addon-client protocol primitives, rather than fork the cloud/account-oriented web application and its branding. Use Electron's packaged Chromium media pipeline plus hls.js for HTTP playback. Original Nymora components provide the local store, desktop security boundary, catalog aggregation, UI, subtitle parsing/rendering and progress. No Stremio logo, icons, default addon collection, cloud service or streaming-server binary is included.

## Distribution materials

`vendor/stremio-addon-client/LICENSE.md` preserves the complete upstream notice. `third_party/` contains dependency license texts and protocol reference snapshots. Packaged Electron distributions retain LICENSE.electron.txt and LICENSES.chromium.html. The public source, lockfile, build scripts and release source archives supply reproducible build inputs. The dependency inventory is generated before packaging and checked against npm audit. Detailed limitations and test evidence belong in docs/QA.md.
