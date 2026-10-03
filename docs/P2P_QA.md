# Nymora 1.1.0 P2P verification

Date: 2026-10-03. Windows 11 x64, Node.js 24, Electron 44.5.1, WebTorrent 3.0.21, Playwright 1.63.0. This supplements the historical 1.0.0 HTTP release record in QA.md; that release has no torrent backend.

## Automated checks

Lint and build pass. **16 unit/HTTP tests pass**, covering source validation, file selection, authoritative native consent, ignored renderer consent flags, cancellation of pending acceptance, bounded cache preservation, compact IPv4/IPv6 decoding, ranges and the original addon/store/subtitle suite.

Real engine integration passes: developer-owned torrent metadata arrives from an actual local seeder, the explicit MP4 index is selected, original first/future bytes return through HTTP 206 before the file is complete, and the unselected WebM remains untouched. An unavailable hash times out and closes its client/cache. Cancellation interrupts metadata preparation; the next source starts normally. Stopping closes the endpoint and clearing removes owned data.

**33 original HTTP/HLS desktop checks pass** again: decoded MP4/WebM/HLS, movie/episode IDs, seek/pause/resume/fullscreen, English/Arabic subtitles, library, progress persistence and native window closure.

**16 P2P desktop checks pass**:

* Startup has no P2P session; infoHash, magnet and backend sources share source selection.
* Each pending notice and Cancel creates zero sessions, client tracker requests and player instances. Seeder announcements are excluded from the client count.
* Acceptance resolves real peer metadata, selects the requested file and decodes 640×360 frames before full download.
* Pause/resume and future seeking request later pieces while the download is incomplete.
* Original English/Arabic subtitles render during P2P playback. Actual filename/size is supplied in subtitle queries.
* Clearing is rejected during an active session. Exit saves progress and closes the endpoint.
* Restarted magnet playback requires fresh consent and resumes progress. Natural video completion stops the session.
* Backend-marked episode playback uses the exact episode ID and saves progress on native close.
* Settings shows bounded usage, persists the limit and clears the inactive cache.

Automated tests intercept Electron's dialog function only to supply deferred explicit tester decisions. The router, engine, tracker, seeder, streaming endpoint and video decoder remain real. [Sanitized evidence](p2p-qa-evidence.json) records the tested executable category and decoded frames.

## Actual native dialog

The real Windows notice was visually inspected without a dialog mock. All disclosures and both buttons were visible. Clicking Cancel returned native response 0, retained source selection and created zero sessions. A fresh second notice returned response 1 after clicking I Understand — Play, then decoded 13 original-video frames with advancing time. Only developer-owned media and a loopback tracker/seeder were used.

## Distribution verification

The Windows Setup EXE and portable ZIP built successfully after a fresh npm ci. Setup installed with exit 0 and registered version 1.1.0. The **actual Setup-installed executable passed all 16 P2P and 33 HTTP/HLS desktop checks**. P2P playback decoded 13 frames at 640×360 while only 884736 of 3627633 selected-file bytes had downloaded; restarting magnet playback resumed at 60.424 seconds. Both metadata interruption and normal completion cleanup pass.

The real native Windows notice was then tested again against that installed executable: Cancel returned response 0 with zero sessions; a fresh acceptance produced decoded video (13 frames, 0.313555 seconds). See [native evidence](p2p-native-evidence.json) and [HTTP regression evidence](qa-evidence-1.1.0.json).

Local build SHA-256 values:

* Nymora-1.1.0-Windows-x64-Setup.exe: `c3c8f31194ddc02a56a9928fac31fe40e8b33fad1ec62ba73247d25e3787be07`
* Nymora-1.1.0-Windows-x64-Portable.zip: `f4d3d3e08d4183cd6509af4984d9e8e694e9565723c7dde52c391b379b34f661`

Public release/download results are recorded once publication completes; the above establishes the local built-and-installed application.

## Dependency audit and limits

Runtime npm audit: **0 known vulnerabilities**. Full audit: **8 high findings in the development-only electron-builder/got/http-cache-semantics chain**, rooted in the unpatched http-cache-semantics <=4.2.0 advisory. These are not application runtime dependencies. Original notices, production dependency inventory and native corresponding-source references are included. The unused vulnerable ip package is removed in the tracker fork; compact peer decoding is original Nymora code.

Tests use original 90-second H.264/AAC media and subtitles, local TCP peers and an HTTP tracker. DHT/LSD and router port mapping are disabled in the isolated QA environment. Public DHT/PEX reachability, UDP/WS tracker and WebRTC interoperability are not independently certified. Production discovery/peer exchange and supplied tracker support come from WebTorrent. Optional uTP is omitted.

Codecs depend on Chromium; v2-only magnets are unsupported. Selected video plus padding must fit the configured 256–16384 MB cache limit. Windows 11 was tested; separate Windows 10 hardware was not. No unauthorized media, content indexes, default addons or content trackers are bundled. The notice is informational P2P consent and does not grant copyright permission. Third-party sources remain independent.
