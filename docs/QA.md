# Nymora 1.0.0 verification log

Date: 2026-10-03 (Asia/Riyadh). Local, public-source, release-download and installed-release verification gates pass.

## Build and dependency results

Node.js 24; Electron 44.5.1; electron-builder 26.15.3; hls.js 1.7.3; ESLint 10.12.0; Playwright 1.63.0. Lint and renderer build pass. Unit/HTTP integration tests: **9 passed, 0 failed**. Coverage includes URL/manifest rejection, upstream resource matching/inheritance, real HTTP addon installation/search/pagination, exact episode IDs, subtitle extras and Arabic SRT/English VTT/plain ASS parsing, partial addon failure, persistence, corrupt-store recovery, byte ranges and HLS rewriting.

Full npm audit after dependency updates: **0 known vulnerabilities**, including development dependencies. A reset audit request was retried successfully. The lockfile contains official npm URLs and SHA-512 integrity hashes. Stalled official tarball transfers were replaced locally with a mirror using those integrity checks; failed partial installs are isolated in ignored .qa and are not release inputs.

Complete upstream MIT, Apache-2.0, NSIS and Electron/Chromium notices are preserved. Executable Windows metadata reads Nymora / Mohammed Alanazi / 1.0.0. The initial release is unsigned.

Original developer-controlled 90-second color/motion/tone media was generated locally with FFmpeg as MP4 (H.264/AAC), WebM (VP8/Vorbis), and HLS. No commercial media or unauthorized streams were used.

## Actual Windows installation

Windows build 10.0.26200 (Windows 11 x64) was used. Windows 10 x64 is a supported target but was not tested on separate Windows 10 hardware. Setup returned **0**, registered **Nymora 1.0.0**, version **1.0.0**, and created a Start Menu shortcut and working uninstaller. Uninstall returned **0** and removed the executable; fresh reinstallation returned **0**.

An initial installed build failed before startup because the inherited install-directory ACL contained an AppContainer SID without ALL APPLICATION PACKAGES access. The installer now grants read/execute only to exact distribution paths, with no write grants, recursive changes to unrelated files or changes to user data. The renderer sandbox stays enabled. Fresh installation with the fix passes the desktop flow.

## Real desktop end-to-end result

**33 checks passed** against the actual Setup-installed executable using Playwright 1.63.0. [Machine-readable evidence](qa-evidence.json) omits local machine paths.

* Fresh startup, invalid manifest error, addon installation and persistence after restart.
* HTTP movie/series catalogs, switching, declared filter/skip pagination, search and metadata.
* A failing stream addon shows HTTP 503 while another addon provides usable sources.
* Source selection and decoded MP4 H.264/AAC, WebM VP8/Vorbis and HLS H.264/AAC frames at 640×360, duration 90 seconds. Tests verify advancing time and decoded frames.
* Seek, pause/resume, volume/mute and native fullscreen.
* English/Arabic addon subtitle queries, track switching/off, size and delay. Arabic screenshot visually reviewed: correctly joined Unicode glyphs and right-to-left text.
* Progress saved to disk, Continue Watching after restart and resume at the saved position.
* Season 2 / episode 1 requests the exact episode ID. Episode progress saves when the native window closes during playback.
* Library and preferred subtitle language persist. Addon removal succeeds.

Only original developer-generated video and original subtitle text were used. The developer-controlled addon is not preinstalled in production. Native computer-use inspection also verified the real desktop interface and original Nymora branding.

## Publication and clean-user gates

**All required gates passed.** Public repository: https://github.com/igc27/Nymora. Published release: https://github.com/igc27/Nymora/releases/tag/v1.0.0, title **Nymora 1.0.0**. Source tag **v1.0.0** points to **77d0f95653855379ac27930c65b10c3afe59d2c8**. Publication includes only scanned, Git-tracked project source; private upstream checkouts, signing materials, credentials, local viewing data, dependencies and build outputs are excluded.

A separate clone from the public repository installed dependencies with `npm ci`, passed lint and all nine unit/HTTP tests, built the renderer, regenerated notices and produced both the Setup EXE and portable ZIP with `npm run package`. The tagged commit's GitHub Build and test workflow also passed: https://github.com/igc27/Nymora/actions/runs/37076524060. The independent Windows release workflow passed packaging and the packaged desktop flow: https://github.com/igc27/Nymora/actions/runs/37076701414. It preserves the existing, locally installed-and-tested public release assets.

The public release contains **Nymora-1.0.0-Windows-x64-Setup.exe**, **Nymora-1.0.0-Windows-x64-Portable.zip**, and **SHA256SUMS.txt**. Both binaries were downloaded again from their public GitHub release URLs and matched the original build and published SHA-256 values:

* Setup: `8b3ee07f3fcc633f85361cd637789431276b795e419f00ccedbccfe3fdf911ea`
* Portable: `bf41da60fb1c40369a0274575aee56fb53f0d414e2866cc315a4e9dffef95ef5`

The previous installed copy was uninstalled (exit **0**, executable removed), then the **downloaded public Setup** was installed (exit **0**). The resulting installed executable passed **all 33 desktop checks**, including actual decoded movie/episode playback, Arabic/English subtitles and progress across restart/native window closure. The final machine-readable desktop evidence above comes from this downloaded-release installation. A separate ordinary launch with the default user-data location was visually inspected and shows the Nymora home interface with no preinstalled addons.

The downloaded portable ZIP was extracted and passed startup, Settings/About version, displayed upstream/NSIS notices, sandbox/context isolation and disabled Node integration checks. Its application archive has exactly the same SHA-256 as the Setup-installed application archive. Electron and Chromium license files are present beside the executable. See [release-evidence.json](release-evidence.json) for the public-download receipt; no private local paths are published.

## Compatibility limits

Modern HTTP catalog/meta/stream/subtitles are tested, including object/string resources, prefix filtering, inherited types, configured manifest paths, search/skip extras and exact episode IDs. This does not certify every third-party addon. Legacy/IPFS transports, torrent/infoHash sources, external-service-only sources and DRM are unsupported. Codecs depend on Chromium. ASS/SSA uses plain text and subtitles must be UTF-8. UI is English. Native audio/in-band subtitle selection appears when the engine exposes tracks. Separate Windows 10 hardware, arbitrary third-party services and advanced styled ASS are not claimed as tested.
