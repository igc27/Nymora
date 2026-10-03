# Nymora 1.1.0

Independent, neutral media client for Windows x64. Version 1.1.0 adds consent-gated BitTorrent streaming to the existing internal HTTP/HLS player.

Every infoHash, magnet or P2P-backend source opens a fresh native **P2P Streaming Notice**. **Cancel** returns to source selection with no torrent activity. **I Understand — Play** allows peer discovery, metadata resolution, buffering and playback. The notice explains downloading/uploading, visible IP addresses, content authorization and source/legal limits; it grants no copyright permission.

WebTorrent 3.0.21 supplies real metadata/file selection, supplied tracker hints, sequential streaming and seek-prioritized byte ranges. The same player retains English/Arabic subtitles and saved movie/episode progress. Settings provides bounded cache usage, an adjustable limit and safe clearing. Sessions close on cancellation, error, video completion and app exit.

The application starts with no installed addons and does not provide or host movies or television content. Third-party addons are independent services.

Known limits: Chromium codecs; BitTorrent v1/hybrid info hashes; optional uTP omitted; selected videos must fit the configured cache limit. Public DHT/PEX reachability, UDP/WS trackers, WebRTC peers and separate Windows 10 hardware are not independently certified by the isolated tests. Legacy/IPFS-only sources and DRM are unsupported. ASS/SSA uses plain text; subtitle files must be UTF-8. UI is English; Arabic subtitles work. The installer is unsigned. No automatic updater.

Reuses MIT-licensed Stremio addon-client primitives and WebTorrent/tracker components, with original copyrights and full licenses. Electron/Chromium, hls.js, all production dependencies and native MPL corresponding-source references retain their notices. See OPEN_SOURCE_AUDIT.md and THIRD_PARTY_NOTICES.md.

Download Nymora-1.1.0-Windows-x64-Setup.exe or Nymora-1.1.0-Windows-x64-Portable.zip. Compare SHA256SUMS.txt. Version 1.0.0 remains available.

Sixteen unit/HTTP tests, 33 HTTP/HLS desktop checks and 16 P2P desktop checks pass using original developer-owned media and a real local tracker/seeder. Actual native Cancel/acceptance also passes. See docs/P2P_QA.md and its machine-readable evidence for the tested executable. Runtime npm audit has zero known vulnerabilities; an unresolved development-only http-cache-semantics advisory in electron-builder's toolchain is recorded there.
