# Nymora 1.2.0-dev — local UI development

The permanent working baseline is
[v1.1.1](https://github.com/igc27/Nymora/releases/tag/v1.1.1), commit
`653251b76334a6497e6e6c98261cb559c8e964b7`. Its direct installer was downloaded
from GitHub and verified against the SHA-256 in WORKING_BASELINE-1.1.1.md.
No UI work modifies that tag, source or published assets. This branch, version
and all development installers remain local until the owner says PUBLISH NYMORA.

The first development delivery changes presentation and local preferences:

- Full viewport, aspect-preserving player; compact overlay controls and audio,
  subtitle and speed menus. Idle controls hide after 2.6 seconds and return on
  pointer movement, with interaction and keyboard focus protection.
- Space on release toggles playback; a 350 ms hold temporarily plays at 2×,
  restoring the prior rate on release, focus loss or exit. Arrow seeking,
  volume, mute and fullscreen shortcuts ignore typing fields. Escape exits
  fullscreen or closes player menus while retaining playback.
- Nymora P2P acknowledgement modal uses the existing complete warning. Main
  owns the persisted p2pNoticeAccepted flag and validates pending notice
  challenges. Cancel saves nothing; Settings → Privacy / P2P resets acceptance.
  The unchanged Playback gate still awaits main's confirmation before start.
- Continue Watching is first. Home catalog order and hidden rows are stored
  separately from addon installation order and can be reset in Settings.
- Cinematic details, supplied synopsis with More/Less, cast portraits/avatar
  fallback, and profiles only for stable supplied person IDs. Metadata merging
  preserves nonempty rich fields, exact title IDs and episode IDs.
- Seasons paginate in chunks of 24; episode selection opens a dedicated source
  view and returns to the same season/page. Spoiler blur covers both episode
  cards and source-view artwork.
- Installed addon cards, explicit user-installed Cinemeta recommendation,
  manifest URL installation and independent provider attribution. See
  COMPATIBLE_PROVIDERS.md for the license/service review.
- About credits Mohammed Alanazi (M72) and preserves upstream notices.

Protected transport, peer discovery, metadata resolution, torrent cache,
loopback Range proxy, subtitle queries/parsing and progress logic are unchanged.
Main changes add the consent coordinator, preference validation and fullscreen
state coordination. Store changes add defaults without replacing existing data.
The native helper remains identical to the baseline binary.

Verification commands: npm run lint; npm test; npm run test:e2e;
npm run test:ui; node tests/addons.e2e.cjs; npm run test:body;
npm run test:p2p:public. Installed verification sets NYMORA_TEST_EXE to the actual
installed Nymora.exe and uses isolated profiles, never private addon URLs.
UI consent tests stub discovery only to verify the gate; the separate public
Sintel test requires metadata and video pieces from real internet peers, decode,
seek, English/Arabic/local subtitles, progress and restart with remembered consent.

Evidence is kept locally under .qa. A public-peer test may fail when peers cannot
supply startup pieces within the existing buffering timeout. Preserve failures
alongside passing attempts; do not replace public-peer proof with self-seeding
or HTTP media/metadata fallbacks.

## First local installer verification

`release/development/Nymora-1.2.0-dev-Windows-x64-Setup.exe`

SHA-256: `9119898f9e2b232439b9764e9fdf257def8f5f0e785729009dd25bfb09f50398`

Installation completed with exit 0. Installed app.asar matched the package at
SHA-256 `b6c7bca1eef70f634425bf61ccb122d2c1716c614e5fbd2ac913004169a508a0`.
The existing default user configuration was unchanged (hash verification only).

Lint and 31 unit tests passed. Installed core playback and UI checks passed,
including full viewport, Windows fullscreen/Escape, idle behavior after mouse
clicks, keyboard field protection, temporary speed cleanup, 1,001-episode
pagination and opaque IDs, subtitle switching, progress/library/restart,
catalog visibility/order/reset, consent cancellation and persistence/reset.

- Installed core evidence: `.qa/e2e-1791063753849/evidence.json`.
- Installed UI evidence and visual checks: `.qa/ui-1791063761991/`.
- Real public-peer installed evidence: `.qa/public-installed-1791063753838/evidence.json`.
  All 10 checks passed, including 1024×436 decode, seek beyond 180 seconds,
  English/Arabic/local subtitles and resume after restart. A prior development
  attempt received metadata but hit the unchanged buffering timeout; its failure
  record remains at `.qa/public-installed-1791063296391/evidence.json`.
- Independent provider timeout/cancellation/proxy checks passed in
  `.qa/addons-*/evidence.json` during development.
- Installed artifact/configuration record: `.qa/ui-install/installed-build.json`.
- Installed HTTP body evidence: `.qa/body-1791063843212/evidence.json`.
  All eight response formats, failure timing/cancellation/recovery, movie and
  episode source cards and real public example/Cinemeta HTTP 200 parsing passed.
  Installed Chromium redirect tests also passed cross-origin credential stripping.

No UI branch, commit, tag, installer or release was uploaded. The published
baseline installer still matches its original SHA-256.
