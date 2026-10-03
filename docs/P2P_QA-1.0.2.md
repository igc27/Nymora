# Nymora 1.0.2 installed-client P2P verification

Verified on Windows 11 x64, 2026-10-03. The tests use isolated profiles and leave the user's installed addon configuration untouched. This replaces the shipped WebTorrent backend with librqbit 9.0.1; it does not merely increase a timeout. The metadata timeout remains 90 seconds.

## Root-cause evidence and its limits

The 1.0.1 source normalizer rebuilt magnets without `x.pe`, and ignored `behaviorHints.announce` and `behaviorHints.sources`. This can remove the only available discovery path. The new explicit-peer-only regression resolves metadata with DHT and trackers disabled; the original normalizer would discard that sole peer. The normalizer now preserves validated tracker hints, DHT nodes, explicit IP peer hints, file selection hints and safe standard magnet parameters. HTTP `xs/as/ws` values are retained as source data but not fetched by the native engine; metadata proof is peer-only.

The original WebTorrent backend also resolved public Sintel metadata in 1.770 seconds in the baseline audit. That prevents attributing every reported addon timeout to a universally broken WebTorrent stack. A specific failing addon source was not supplied, so the exact cause of that source's failure is not established. The confirmed hint-loss defect and generic diagnosis were fixed, and the backend was replaced and verified. No commercial torrent or private addon configuration URL is required for this QA. If a particular addon source still fails, use Copy P2P Diagnostics to investigate its redacted discovery state.

## Engine and distribution

* Native helper: original MIT Nymora code, version 1.0.2; pinned librqbit 9.0.1, Apache-2.0, revision `a499d2f243d124e144aef137afe7cb304a6e3f36`.
* Requested stream-server inspected at `f585ab6eda9b1411034548c131bb0dc30c6f5f9e`: root MIT, Copyright (c) 2025 perpetus. Its official v0.1.8 Windows build uses libtorrent 2.1.1; optional librqbit is 8.1.1. Its FFmpeg/tray/updater/shared-lock requirements motivated a minimal direct librqbit wrapper. No stream-server code or binary is bundled.
* Windows helper uses a statically linked Microsoft C runtime. `dumpbin /DEPENDENTS` shows only Windows system DLLs, with no VCRUNTIME140.dll dependency. The installer includes Electron and the helper. End users need no separate Node, Rust, Python, Docker, Visual Studio, FFmpeg, torrent application or paid service.
* Full native dependency attribution/license texts generated with cargo-about 0.9.2 from Cargo.lock are in third_party/rqbit/DEPENDENCY_NOTICES.md and packaged notices. npm runtime audit: zero known vulnerabilities. Existing development-only electron-builder toolchain advisories are not shipped runtime dependencies.

## Discovery, consent and lifecycle

The helper launches idle at app startup, with no BitTorrent session or network listener. Only native dialog response 1 can start discovery. Actual native Cancel and acceptance were exercised in the installed client: zero sessions on Cancel, one session and decoded public video after acceptance. No remembered consent or addon-provided acceptance is possible. The notice explicitly describes uploads/downloads, peer-visible IP, content responsibility and source/legal limits; it grants no copyright authorization.

After consent, librqbit creates its DHT routing table using protocol bootstrap hosts plus validated addon DHT hints. All supplied HTTP/HTTPS/UDP tracker URLs are passed through instead of relying on one tracker. Explicit `x.pe` peer hints reach native `initial_peers`. Engine PEX (BEP 11) and LSD (BEP 14) are enabled, along with BEP 9 metadata exchange. Private torrents disable DHT/PEX/LSD once metadata identifies them as private. Stable TCP transport is used; experimental uTP and WebRTC transports are not enabled. Public DHT-only connectivity is proven below; public PEX-only/LSD-only operation and every tracker protocol were not separately isolated.

The native API binds 127.0.0.1 on an ephemeral port, authenticates with a random per-session credential, and passes a health check. The renderer receives only a separately token-protected localhost Range stream. Metadata is hash-verified before file selection. A validated path manifest restricts storage/cleanup to owned files, and the selected video plus shared piece boundaries must fit the configured cache limit. Unsupported codecs/containers are a separate player-stage error after torrent metadata and bytes succeed.

Cancellation, natural completion, exit and app close stop sessions and endpoints. stdin EOF also shuts down the helper when its parent exits. A helper crash rejects preparation, reports the actual engine failure and restarts idle; it does not resume peer activity without a new accepted session. Explicit-peer-only metadata and idle crash recovery pass regression tests.

## Real internet test

The source is **Sintel**, © Blender Foundation, [Creative Commons Attribution 3.0](https://durian.blender.org/sharing/), from the [official WebTorrent free-torrent test list](https://github.com/webtorrent/webtorrent/blob/master/docs/free-torrents.md). The original video and credit sequence are unchanged. The versioned screenshot is an excerpt with this attribution. No movie file is bundled or published in the repository or installer. English/Arabic/local test subtitle cues are original QA text.

Source: `08ada5a7a6183aae1e09d831df6748d566095a10`, fileIdx 5, `Sintel.mp4`, 129,241,752 bytes. The local addon harness serves manifest/metadata/source descriptors and original QA subtitles only; it cannot serve torrent metadata, seed pieces or serve HTTP video. No self-seeder, HTTP .torrent, metadata mirror, webseed or previously downloaded content is used. Each run uses a fresh isolated cache/profile.

[Installed public-path evidence](public-p2p-evidence-1.0.2.json) records actual peer metadata, the selected video, buffering, localhost Range requests, decoded 1024×436 player frames, pause/resume, seek to 180 seconds, English/Arabic/Off/local subtitles, endpoint shutdown, saved progress and reopening/resuming after fresh consent. It also verifies immediate movie stream queries, Watch / Sources above Library / Watched, and a failed HTTP 503 addon leaving successful sources visible. The evidence identifies packaged=true and the actual Electron/Chromium versions.

[Actual native-button evidence](public-native-evidence-1.0.2.json) records Cancel=zero sessions, acceptance=one session and 13 decoded frames at 0.323 seconds. The interactive test wraps the real native dialog only to record its response; it does not fake an acceptance.

[Independent DHT-only evidence](public-discovery-evidence-1.0.2.json) records the same legal public hash with **zero trackers and zero initial peer hints**. Existing internet peers supplied metadata in **13,542 ms**; three live peers were observed. The selected video served a real 206 Range response of 4096 bytes. No Linux test was needed to establish an additional discovery path.

## Diagnostics privacy

Copy P2P Diagnostics is available during preparation and after a failed selected source. Its export uses an exact allowlist: infoHash, fileIdx, filenameHint, videoSize, trackerCount, trackerURLs, dhtEnabled, pexEnabled, lsdEnabled, peerCount, metadataState, elapsedDiscoveryMs, engineError and cause. Credential-bearing tracker paths/query values and token-like filename fragments are redacted. Raw addon URLs, headers, auth values, cookies, API keys, private engine logs, peer IPs and local profile/cache paths are never copied. Error/cause values are safe codes for startup/crash/no peers/tracker/DHT/timeout/metadata/file/cache/network failures. UI fetch causes distinguish DNS, TLS, reset, refusal and timeout without raw URLs.

## Regression and installer results

20 unit/HTTP tests, lint, 33 HTTP/HLS desktop checks and 20 P2P desktop checks pass. Native local regressions additionally verify explicit-peer-only metadata, partial Range/seek, cancellation, bounded cache ownership and idle helper crash recovery. The installer was actually run in silent per-user mode, exited 0, and installed Nymora 1.0.2. Installed app.asar and helper SHA-256 values match the packaged files. The existing default user profile's SHA-256 remained unchanged across installation; its private contents were never inspected. These local installer checks and public tests pass before publication.

The CI release workflow repeats packaged HTTP/local-P2P tests, installs the actual Setup and requires the complete public internet client path to pass before it may attach release assets. A failed public test stops asset publication. CI build archives can differ from local builds; SHA256SUMS.txt identifies the final published artifacts.

## Local verified release candidate hashes

* Setup: `0aaa9d0932f43eb976867702b4b9777793f9ca2f5646bb6168a40b68622a57fd`
* Portable ZIP: `953d62fbb23fccafb917f2c4ca4bce40c51e58d514e0765e75e1df8725577707`
* Installed app.asar: `bdd768fa6311d582b311529828ff2e9b966403614b28d9877b4837e96a02eb67`
* Installed native helper: `e74cad679f2975771b1c165709324dd8a881e8b340124a6e8ca24b70fb9bbe47`

Known limits: unsigned Alpha builds; Windows 10 hardware not separately tested; Chromium cannot decode every MKV/HEVC/DTS/TrueHD source; no claim that every third-party torrent has reachable peers or supported media codecs. Existing 1.0.1/1.1.0 artifacts and their historical evidence remain unchanged.

## Regression assertion correction

The first tagged release job stopped before asset upload at a synthetic-player assertion: the video reached 60 seconds while the last recorded HTTP Range start was 0. A most-recent request offset does not establish whether Chromium already has the seek target buffered or has an overlapping read in flight. The player regression now records buffered intervals and requires additional decoded frames after the requested seek. The independent native integration test still forces a 206 request at 80% of the selected file, compares its bytes with the original media and requires incomplete download. The installed public-torrent path and production engine remain unchanged. Publication remains gated on successful complete packaged and installed public-peer tests.
