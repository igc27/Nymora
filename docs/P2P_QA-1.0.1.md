# Nymora 1.0.1 Alpha: installed Windows verification

Verified 2026-10-03 on Windows 11 x64. This is the user-requested Alpha version in the existing repository; the previously published 1.0.0 and 1.1.0 tags and downloads remain unchanged.

## Engine and source routing

WebTorrent **3.0.21**, MIT, is pinned to npm source revision `e75f75c7ac6b755c2eb36842c51806da8ff560ff`. Official registry metadata was rechecked: 3.0.21 remains the stable `latest` package and requires Node >=22. The tested installed runtime is Electron **44.5.1**, Node **24.21.0**, Chromium **152.0.7977.130**. The complete engine license, runtime/native dependency notices and corresponding-source references are included in the installer. No paid API or torrent service is used.

The trusted playback router handles HTTP/HLS with the existing proxy and infoHash/magnet/P2P sources with the separate local backend. Pure identifier validation occurs before the native notice. Only native response 1 creates a torrent client; addon/renderer consent fields cannot bypass it. The engine is imported dynamically from CommonJS after acceptance. There is one managed active session, with previous sockets, reads and cache writers closed before replacement.

Explicit fileIdx is authoritative when it identifies a video. Otherwise filename/size hints guide selection, followed by the largest main video; preview samples are avoided when another video exists. Selected-file sequential download and high-priority range streams serve an authenticated 127.0.0.1 endpoint. Future seeking does not wait for a full download. The existing player and exact movie/episode subtitle/progress IDs are retained.

## Checks completed

`npm run lint`, `npm test` (**17 passing tests**), `npm run notices`, `npm run build` and `npm run package` passed. Runtime `npm audit --omit=dev` reports **0 known vulnerabilities**. The source release workflow explicitly stops when either packaged media suite fails.

The actual `Nymora-1.0.1-Windows-x64-Setup.exe` installed successfully with exit 0; Windows executable version is 1.0.1.0 and Electron app version is 1.0.1. Testing used that installed application, with isolated test profiles that leave the ordinary user profile unchanged.

**20 P2P desktop checks passed**, plus real engine integration for metadata timeouts, cancellation, selected-file byte accuracy, future range requests, unselected-file preservation and cleanup:

* Fresh startup and pending/cancelled notices produce no torrent client sessions or client tracker requests; no video player opens before acceptance. infoHash, magnet and backend-marked sources all require fresh consent.
* Separate catalog/meta, stream-only and subtitle-only addons work; stream/subtitle addons have no catalogs.
* Accepted infoHash playback resolves metadata, selects the exact video, buffers, connects to real loopback peers and decodes 13 frames at 640×360 with only 884736 of 3627633 selected-file bytes downloaded.
* Pause/resume, volume, mute, native fullscreen and future seeking work during P2P playback. Seeking requests later byte ranges while the file remains incomplete.
* English/Arabic addon subtitles, delay, Off, a local original UTF-8 subtitle and switching tracks work during playback. Episode subtitle queries use the exact episode ID.
* Exit saves progress and closes the endpoint. A fresh accepted magnet session after restart resumes at 60.627798 seconds. Natural completion and native window close stop the session and preserve movie/episode progress.
* Cache usage is bounded, limits persist, active clearing is rejected, and inactive clearing removes only owned pieces.

All **33 original HTTP/HLS desktop checks also passed**, including actual MP4/WebM/HLS decoding, catalogs/search, seasons/episodes, controls, Arabic subtitles, Continue Watching, Library and persisted preferences.

See [installed P2P evidence](p2p-qa-evidence-1.0.1.json), [HTTP regression evidence](qa-evidence-1.0.1.json) and [native notice evidence](p2p-native-evidence-1.0.1.json).

## Actual native notice

The real installed Windows dialog was tested without replacing its decisions: Cancel returned response 0 and started zero sessions. The next actual notice was accepted through its visible I Understand — Play button; one session started and decoded 13 frames with playback advancing to 0.31271 seconds. The title, disclosures and both buttons were visible. [Captured native notice](screenshots/p2p-notice-1.0.1.png).

Automated desktop suites defer the native message-box result to explicit tester decisions; they do not mock the torrent engine, metadata, tracker, network, range endpoint or decoder. The local-subtitle test supplies an explicit test-file choice at the native file-picker API, then uses the actual parser/renderer. The supplementary native notice test uses the real Windows message box.

## Distribution and limits

Locally built installer SHA-256: `de853add1084e693c778058b99e256a2436cdf30a031e1e07b232c1b9d5b87d9`.

Locally built portable ZIP SHA-256: `f151469adfbf8cf65ab5a8e5324bbfdd1c155ef06a29e59be28a594d0675a05e`.

The GitHub release workflow rebuilds and tests packaged binaries before attaching them. Its public artifact hashes may differ from local builds; use the checksum manifest accompanying that release. Public-download verification is recorded separately once those assets are available.

Tests use original developer-owned 90-second H.264/AAC media and original English/Arabic subtitles, only a loopback TCP seeder and HTTP tracker, with public discovery disabled in isolated QA. Public DHT/PEX reachability, UDP/WS trackers and WebRTC interoperability are not independently certified. Optional uTP is omitted. Codecs depend on Chromium; a .mkv extension does not guarantee that its codecs are playable. v2-only magnets, DRM and legacy/IPFS-only sources are unsupported. Selected video plus piece padding must fit the configured 256–16384 MB cache; default 2 GiB. Windows 11 was tested, separate Windows 10 hardware was not. Installer is unsigned.

The development-only electron-builder/http-cache-semantics audit findings remain documented in the historical P2P audit; runtime audit is clean. Native source/notice limits are documented in OPEN_SOURCE_AUDIT.md and third_party/NATIVE_SOURCE.md.

No unauthorized media, content trackers, indexes or third-party addons are bundled. The P2P notice is informational consent and grants no copyright permission.
