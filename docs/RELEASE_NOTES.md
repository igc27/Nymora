# Nymora 1.0.2 Alpha

The shipped BitTorrent backend is now a bundled **librqbit 9.0.1** native engine. It runs locally and needs no separately installed development tools or paid services. Existing releases remain unchanged.

Every infoHash, magnet or P2P source opens the native **P2P Streaming Notice**. Cancel starts zero P2P sessions; only **I Understand — Play** permits discovery, metadata exchange, downloading/uploading and playback. The warning explains peer-visible IP addresses and content responsibility; it does not grant copyright permission.

Discovery preserves tracker/DHT/explicit-peer and file index/name/size hints. The helper starts idle, binds its authenticated service only to loopback after consent, restarts idle after crashes, and closes with Nymora. Real preparation status and distinct discovery/startup/file errors replace the generic metadata error. **Copy P2P Diagnostics** exports only the requested discovery fields, with private tracker paths/query values redacted; it never exports configured addon URLs, credentials, tokens, cookies or API keys.

Movies query stream addons immediately and put **Watch / Sources** above Library / Watched. Series retain exact episode IDs. An unavailable addon leaves working sources visible with a small warning. Network failures retain safe DNS/TLS/reset/timeout causes. Torrent failures and unsupported video codecs are reported separately.

The installed Windows client passed legal Sintel internet-peer metadata, file selection, partial buffering, localhost Range delivery, decoded playback, pause/resume, seeking to 180 seconds, English/Arabic/Off/local subtitles and saved progress after reopening with fresh consent. A DHT-only run obtained peer metadata with zero trackers or initial peers. The actual native Cancel and acceptance buttons were exercised. See [verification](https://github.com/igc27/Nymora/blob/main/docs/P2P_QA-1.0.2.md).

Download **Nymora-1.0.2-Windows-x64-Setup.exe** or the Portable ZIP and compare **SHA256SUMS.txt**. The installer includes the engine and statically linked C runtime. Per-user installation needs no administrator permission and preserves local addon configuration and viewing data.

Limits: unsigned Alpha installer; Chromium codec/container support; BitTorrent v1/hybrid sources; stable TCP transport, with experimental uTP omitted. No WebRTC transport or universal third-party-source compatibility is claimed. PEX/LSD are enabled but not separately certified over the public internet. No account, automatic updater or bundled media/addon index. Runtime npm audit has zero known vulnerabilities; development-only toolchain advisories remain documented. Original upstream licenses and full native dependency notices are included.
