# Nymora 1.2.0

The owner manually accepted the 1.2.0-dev implementation and explicitly
authorized this release on 2026-10-04 before further development.

Accepted application source: 6f966d0e361211ce7a3cd2bc1c5bc35af405fece.
Files under src/, native/, vendor/ and assets/ are byte-identical to that
commit. Only release version, workflow instructions and documentation change.
The same native librqbit helper binary is included. No private addon
configuration, credentials or QA profiles are packaged.

Primary asset: Nymora-1.2.0-Windows-x64-Setup.exe

SHA-256: f3ded2fc0469f56bce851fbc842bd7900fb22ef9b17543f7b6a16bbfafb8003a

The installed app.asar matches the packaged app.asar:
09b9d9f070ee26b47e970dea5d6d6d11a4115ec6ce72e7cc4869c60d139b53ff.
Silent Setup installation returned 0; the existing user configuration
was preserved using a hash-only comparison.

## Installed Windows verification

Isolated profiles and original QA media were used for HTTP/HLS checks.
Legal public Sintel was tested using only infoHash and tracker/file hints,
with metadata and video supplied by real internet peers. No HTTP torrent
metadata, video fallback or self-seeder was used.

- Lint and 31 unit tests passed.
- 33 installed media checks: addons, catalogs/search, MP4/WebM/HLS decode,
  seeking, subtitles, progress, library and restart.
  Evidence: .qa/e2e-1791115073817/evidence.json.
- 17 installed UI checks: player shortcuts, hold Space, fullscreen, catalog
  preferences, 1001 episodes, cast, authorship, persistent main-process consent.
  Evidence: .qa/ui-1791115117852/evidence.json.
- Eight Chromium body formats, accurate timeout/error classification, cancellation
  and recovery, real public addon JSON and cross-origin credential stripping.
  Evidence: .qa/body-1791115095037/evidence.json and the matching redirect evidence.
- Public peer playback, pause/resume, distant seeking, English/Arabic/local subtitles,
  progress and endpoint shutdown. Restart preserves consent and resume choice.
  Evidence: .qa/public-installed-1791115228558/evidence.json.
  The initial harness clicked auto-hidden controls. Later runs completed playback
  and seeking, but public MP4 resume after restart intermittently waited on tail
  bytes without decoding within the observation window. These failures remain
  preserved in .qa/public-installed-1791115228558 and -1791115517859.
  HTTP/HLS restart/resume passed; public-peer cold resume is a known limitation
  in this exact accepted implementation and will be investigated locally in 1.3.
  Release smoke verification reveals controls through mouse movement.

## Release boundary

v1.1.1 and all historical releases/assets/tags remain untouched. After this
release and verified direct download, all 1.3.0-dev work stays on local
dev/1.3-ui. No further pushes, tags, releases or installer uploads are authorized
until the owner explicitly says PUBLISH NYMORA.
