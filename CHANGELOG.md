# Changelog

## Nymora 1.0.2

* Replaces the shipped WebTorrent backend with a bundled, managed librqbit 9.0.1 native helper. Startup is idle; every P2P session requires fresh native consent. The local API uses loopback, random authentication and a random port.
* Preserves tracker, DHT, explicit peer, filename, size and index hints; fetches metadata from real peers and streams selected video through authenticated localhost byte ranges.
* Adds real discovery status, distinct startup/discovery/file errors, crash recovery and Copy P2P Diagnostics with a strict redacted field allowlist.
* Queries movie sources immediately and displays Watch / Sources above Library / Watched controls. Failed addons produce a small warning alongside successful sources; fetch failures retain safe underlying causes.
* Installs the actual Windows Setup and verifies legal Sintel internet-peer playback, seeking, subtitles and saved progress before the release workflow can attach assets. See docs/P2P_QA-1.0.2.md.

## Nymora 1.0.1

Requested Alpha version for the existing local BitTorrent capability. The already published 1.0.0 and 1.1.0 releases remain unchanged.

* Routes infoHash/magnet/P2P sources through fresh native consent and the managed local WebTorrent backend into the existing player.
* Default torrent file selection now prefers main video files over preview samples; explicit fileIdx and filename/size hints retain precedence.
* Preparation shows connecting, metadata, video-file selection and buffering stages.
* Packaged tests cover separate catalog/meta, stream-only and subtitle-only addons, P2P volume/mute/fullscreen, local subtitles, delay, seeking and saved episode progress.
* Release publication stops if either packaged HTTP/HLS or P2P tests fail.

See docs/P2P_QA-1.0.1.md for actual installed-application verification.

## Nymora 1.1.0

* Fresh native P2P Streaming Notice for every infoHash, magnet or P2P-backend source; Cancel leaves the source list intact and starts no torrent activity.
* Trusted-backend WebTorrent integration: real peer metadata, file index/name/size hints, supplied tracker/DHT hints, selected-file sequential streaming and token-protected byte ranges for seeking.
* Shared internal player with actual P2P phases, peer/transfer rates, English/Arabic subtitles and persistent movie/episode progress.
* Bounded owned piece cache with visible usage, adjustable limit, safe clearing and cleanup on cancellation, failure, playback completion and app exit.
* Runtime dependency audit passes; original upstream notices, native corresponding-source links and production dependency inventory are included.

Legal tests use original developer-owned media and only loopback trackers/peers. See docs/P2P_QA.md for current verification and limitations. Version 1.0.0 remains unchanged.

## Nymora 1.0.0

Published Windows x64 release. The public-download installer was installed and passed the complete desktop flow; verification is recorded in docs/QA.md.

* Validated manifest URL installation and persistent local addon management.
* Reused Stremio addon-client resource matching and request encoding.
* HTTP addon catalogs, supported filters, pagination, search and movie/series metadata.
* Exact episode stream requests and visible errors for unavailable addons or unsupported streams.
* Actual in-app MP4/WebM/HLS playback, seek, play/pause, volume/mute and native fullscreen.
* English/Arabic addon subtitles, UTF-8 local subtitle support, text size/delay and preferred language.
* Persistent movie/episode progress, Continue Watching after restart, Library and watched status.
* Windows Setup EXE and portable ZIP; original icon, Start Menu shortcut, app registration and uninstall.
* Sandboxed desktop shell and installer handling for inherited AppContainer runtime permissions.

Nine unit/HTTP tests and 33 desktop checks pass, including the Setup-installed application. See docs/QA.md and docs/qa-evidence.json.
