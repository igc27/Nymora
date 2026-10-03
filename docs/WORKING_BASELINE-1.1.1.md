# Nymora 1.1.1 — Working Baseline

The owner manually verified the installed Windows application with their real
compatible addon and episode: stream selection, P2P notice, peer connection,
video playback, pause/resume, seeking, subtitles and Arabic subtitles worked.
This baseline preserves that implementation before any UI redesign.

The exact working development source was first secured as local commit
`6061b7b4c1ea67068f781e039d91d30bb81de99c`. Only package version, workflow
instructions and release documentation differ for the 1.1.1 release candidate.
No source file under src/, native/, or vendor/ was changed. The same native
librqbit helper binary is reused. No user's addon configuration is included.

## Windows artifacts

Primary: `Nymora-1.1.1-Windows-x64-Setup.exe`

SHA-256: `9a0f256f405f1441a88e1b1540a2fa8104ba4171667c4073a62c09c0a35b45e8`

Optional: `Nymora-1.1.1-Windows-x64-Portable.zip`

SHA-256: `4f786737a19e8e6e34fbbc654f568cc212fdaf6450e845c6c15b29638eb0e070`

Both hashes are in the accompanying SHA256SUMS.txt. Artifacts were built
locally with electron-builder --publish never; publication is a separate,
explicitly authorized action after installed Windows verification.

## Release boundary

v1.1.1 is the one publication expressly authorized by the owner on 2026-10-03.
Historical releases remain untouched. After baseline publication, UI work goes
to local dev/1.2-ui, version 1.2.0-dev. That branch and its installers stay local
until the owner explicitly says PUBLISH NYMORA. No UI work may overwrite the
baseline tag, source commit, or published assets.

## Installed Windows verification

Setup installation completed with exit 0. Packaged and installed app.asar
matched SHA-256 `6234eb92c3d7a744f98acb8ff8b42d298bef50866b6a43ea820bb9d9446e7ce4`.
The existing user configuration was preserved (hash check only); isolated QA
profiles were used without reading private configured addon URLs.

- Lint and 27 unit tests passed.
- 33 installed HTTP/HLS checks passed: addon install, catalogs/search, exact
  episode IDs, source cards, MP4/WebM/HLS decode, pause/resume, seeking,
  English/Arabic subtitle switching/size/delay, progress, library and restart.
  Evidence: `.qa/e2e-1791059723208/evidence.json`.
- All eight body formats and accurate failure/cancellation paths passed,
  including a first body chunk delayed 21 seconds. Real public example addon
  and Cinemeta JSON were parsed into source cards. Cross-origin auth remained
  stripped while same-origin auth was preserved.
  Evidence: `.qa/body-1791059731379/evidence.json`,
  `.qa/redirect-1791059816629/evidence.json`.
- Legal public Sintel was discovered using only its infoHash/tracker hints;
  real internet peers supplied metadata and selected file pieces. No HTTP
  torrent metadata, HTTP video fallback or self-seeder was used. The installed
  player decoded 1024×436 frames, paused/resumed, sought beyond 180 seconds,
  displayed English/Arabic/local subtitles, saved progress and resumed after
  reopening with fresh consent. All 10 public-P2P checks passed.
  Evidence: `.qa/public-installed-1791059818133/evidence.json`.
- Actual native Windows Cancel started zero sessions. Actual I Understand —
  Play started one session and decoded public-peer video.
  Evidence: `.qa/native-p2p-1791059864616/native-evidence.json`.

Application architecture and current playback behavior are unchanged. The
baseline retains its per-session native notice; the requested persistent
Nymora modal belongs exclusively to the later local UI branch.
