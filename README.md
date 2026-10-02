<p align="center"><img src="assets/logo.svg" width="88" alt="Nymora logo"></p>

# NYMORA

**Version 1.0.0 · Windows x64 · Independent open-source media client**

Bring your own compatible addons. Browse their catalogs, search for a title, choose a movie or episode and play a supported stream inside the desktop application. Your library, addons and viewing progress stay on your computer.

Nymora is an independent project, not affiliated with, sponsored by or endorsed by Stremio. It reuses selected MIT-licensed Stremio addon-client components and follows the HTTP addon protocol. It does not provide or host movies or television content. Third-party addons are independently maintained services.

**Release status:** release candidate until all gates in [docs/QA.md](docs/QA.md) are verified. A version number is not proof that the Windows release has shipped.

## Windows installation

Use the [project release page](https://github.com/igc27/Nymora/releases) when the verified release is published. Download `Nymora-1.0.0-Windows-x64-Setup.exe`, compare its SHA-256 value with `SHA256SUMS.txt`, and run it. The installer supports a per-user installation, Start Menu and optional desktop shortcuts, and uninstall through Windows Settings. Windows 10/11 x64 is the target. The initial release is unsigned.

An optional `Nymora-1.0.0-Windows-x64-Portable.zip` contains the same desktop client. Extract it before launching `Nymora.exe`. Portable mode uses the ordinary local data folder unless `NYMORA_DATA_DIR` is explicitly set.

## Core experience

* **Addons:** install a manifest URL, inspect its version/description/resources/types, open a supported configuration page, and remove it. Addons persist across restarts. No addons are preinstalled.
* **Home and Discover:** catalog rows come from installed addons; choose catalogs, declared filters and pagination. Search-only/required-filter catalogs are queried with their required extras.
* **Search and details:** query search-enabled catalogs; display available metadata without inventing missing fields. Series list seasons/episodes and request streams using the exact episode video ID.
* **Playback:** supported HTTP(S) video and HLS inside the packaged application, with play/pause, seeking, timeline, volume/mute and native fullscreen. Audio tracks are selectable when exposed by the source/player.
* **Subtitles:** addon and stream subtitle results, English/Arabic/other Unicode text, automatic text direction, local UTF-8 SRT/WebVTT/ASS/SSA files, on/off/switching, size, delay and remembered language. ASS/SSA is rendered as plain text.
* **Local library and progress:** save/remove movies and series, mark watched/unwatched, store per-episode positions, and return through Continue Watching. No Nymora account or paid infrastructure.

Actual playback and subtitle verification evidence is recorded in [docs/QA.md](docs/QA.md). Screenshots in `docs/screenshots/` are captured from the running client using only original developer-generated test media.

![Catalogs loaded from the developer-controlled legal test addon](docs/screenshots/catalogs.png)

![In-app playback with original Arabic test subtitles](docs/screenshots/arabic-playback.png)

## Installing an addon

Open **Addons**, paste the addon developer's HTTP(S) URL ending in `/manifest.json`, and choose **Install addon**. Configured addons can place configuration in the URL path. Standard `catalog`, `meta`, `stream` and `subtitles` resources are supported, including resource-specific types and ID prefixes. The app lists streams supplied by your installed addons and passes the selected HTTP source to the player. It can query separate metadata, stream and subtitle addons for the same ID.

Use only sources you are authorized to access. Addon developers are responsible for their independent services. No piracy addon collection, copyrighted media index, movie service credentials, DRM circumvention or media files are bundled with Nymora.

## Playback and compatibility

The desktop client bundles its UI; it does not launch a hosted website. Electron's Chromium video engine and `hls.js` supply playback. A temporary token-protected loopback proxy supports byte ranges, relative HLS paths and selected addon request headers without depending on addon CORS. Missing/unsupported sources show an error and let you choose another source.

Support depends on Chromium's codecs and addon behavior. Direct MP4/WebM/HLS are tested using generated legal video. Torrent `infoHash`, IPFS/legacy addon transports, DRM streams, external-service-only streams and codecs not supported by Chromium are not supported by this release. In-band subtitle/audio tracks are selectable when the player exposes them. Advanced ASS styling and non-UTF-8 subtitle detection are not implemented. The UI is English; Arabic subtitles work independently of UI localization. There is no account, sync, downloader, automatic updater or built-in addon marketplace.

## Build from source

Requirements: Windows x64, Node.js 24 and npm, internet access for packages and the official Electron/NSIS build tools. FFmpeg is required **only** to generate legal QA media for end-to-end tests; the application does not distribute or require an external FFmpeg executable. The icon is already included; Pillow is needed only if regenerating it with `scripts/icon.py`.

```powershell
git clone https://github.com/igc27/Nymora.git
cd Nymora
npm ci
npm run lint
npm test
npm run notices
npm run build
npm start
```

Create the Windows installer and portable ZIP:

```powershell
npm run package
```

Outputs appear in `release/`. The source includes the lockfile, original assets, vendored addon-client source, licenses and build scripts. Electron/Chromium license files remain beside the packaged executable. CI runs lint, unit tests, build, runtime dependency audit and desktop end-to-end tests. The release workflow tests the packaged executable before producing a draft release.

## Legal end-to-end development test

Install FFmpeg from its official distribution or your trusted package manager, or set `FFMPEG_PATH` to an existing executable. Generate the original motion study and run the full desktop test:

```powershell
npm run test:media
npm run build
npm run test:e2e
```

This test starts a real local HTTP addon, installs it through the UI, restarts the app, browses/searches actual addon responses, plays generated video, selects Arabic/English subtitles and checks persistent progress. It records decoded frames and saves screenshots/evidence. It does not use an unauthorized commercial stream.

To inspect the developer test addon manually, run `npm run demo` in a second terminal and install the printed manifest URL in Nymora. The test addon is never installed automatically. Its ephemeral port is valid while that server is running. For packaged testing:

```powershell
$env:NYMORA_TEST_EXE = (Resolve-Path release/win-unpacked/Nymora.exe).Path
npm run test:e2e
```

## Privacy and security

Viewing data, addon configuration and preferences are stored in `%APPDATA%/Nymora/nymora.json` (the exact folder is shown in Settings). Nymora has no telemetry or Nymora-controlled viewing-history server. Addons and stream/subtitle hosts see requests you send to them. Configured addon paths may include private keys; do not post them in public bug reports.

The renderer is sandboxed without Node access. Addon data cannot execute OS shell commands, and metadata is rendered as text. See [SECURITY.md](SECURITY.md) for the security model and vulnerability reporting.

## Licensing and upstream attribution

Original Nymora modifications, branding, interface and project-specific code: **MIT**, Copyright © 2026 Mohammed Alanazi. Reused Stremio addon-client code: **MIT**, Copyright © 2019 SmartCode OOD. Upstream copyright and full license notices are preserved. Electron/Chromium, `hls.js` and build tools have their respective licenses.

See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [OPEN_SOURCE_AUDIT.md](OPEN_SOURCE_AUDIT.md), [CONTRIBUTORS.md](CONTRIBUTORS.md) and [docs/UPSTREAM.md](docs/UPSTREAM.md) for exact origins, revisions, redistribution obligations and future upstream review. Nymora does not claim authorship of upstream code.

See [CHANGELOG.md](CHANGELOG.md), [ROADMAP.md](ROADMAP.md) and [docs/QA.md](docs/QA.md) for shipped changes, future work and verification limits.
