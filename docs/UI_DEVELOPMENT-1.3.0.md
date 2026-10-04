# Nymora 1.3.0-dev — local manual test build

Local branch: dev/1.3-ui. Based on preserved release v1.2.0 /
988b406accbac9f7960c63cfea1675b79d91fb32. No development push, public
tag, release, or installer upload is authorized without PUBLISH NYMORA.

This records the earlier 69a81a9 development milestone. The later UI-only
round is recorded in UI_POLISH-1.3.0.md.

Preserved milestone installer:
release/development/milestones/1.3.0-dev-69a81a9/Nymora-1.3.0-dev-Windows-x64-Setup.exe

SHA-256: ae87ecedeb79b8e17eeed034df776e80fc7cde2036b4710b0a7fedf411d621cd

Installed and packaged app.asar match: 7309c230925a72ce379e2cfa215ec4fc3158cf0de6f68669ada37f957226df58.
Silent installation returned 0; the existing user configuration remained
unchanged by hash comparison. QA uses isolated profiles.

## Changes

- Actual Electron fullscreen on a frameless native host; a compact draggable
  caption and window buttons serve normal browsing. Fullscreen button, F, video
  double-click and Escape work. The player occupies the display, preserves
  aspect ratio and hides overlays after 2.5 seconds. Keyboard/hold-Space
  behavior, subtitle placement and seek feedback are preserved.
- Ten settings categories, persistent subtitle language/size/delay/appearance,
  volume and preferred audio language where language-labelled tracks exist.
- Patient P2P mode is default. Metadata and initial video availability remain
  cancellable without a short deadline; transient metadata exchange and initial
  peer reads retry while the local engine stays healthy. Optional five/ten-minute
  limits are explicit. Later loopback stream idle budgets follow that preference.
  Source validation, malformed metadata, impossible selection and engine-crash
  handling remain fatal. There is no minimum seed/peer-count rule.
- Owned inactive torrent cache is evicted oldest-first with a selected-file and
  boundary-piece reservation. Active data and unrelated files/links stay protected.
  Cache presets: 1/2/5/10 GiB; custom 256–16384 MiB. Empty/inactive session
  retention is also capped to avoid accumulating metadata-only sessions.
- Continue Watching Remove with Undo leaves progress and Library intact. Watched
  history moves to Library, with separate Watchlist/Watched/In Progress tabs.
  Last 20 search queries stay local, can be selected again, removed or cleared.
- Portrait/Landscape cards share consistent rules across browsing surfaces and
  preserve artwork proportions; Glass offers restrained mint surfaces and blur,
  automatically reducing blur during sustained slow foreground rendering.
- Delayed supplied-metadata hover previews, subtle card lifts, brief details
  transitions and reduced-motion support. Optional 1.4-second original startup
  animation and 0.86-second locally synthesized PCM sonic logo (sound off by
  default), each independently disableable.
- Existing rich details, provided cast/person profiles, spoiler thumbnails, exact
  opaque episode IDs and 24-item pagination for 1001+ episodes are retained.
  Runtime/player clocks format hours. Catalog order supports dragging, buttons,
  hiding/restoring and reset. About retains M72 authorship and upstream notices.

## Protected architecture

Addon networking/body reader/aggregation, stream queries, media proxy, subtitle
queries, playback/consent orchestration, native Rust helper and vendored source
are unchanged from v1.2.0. Native helper SHA-256:
e74cad679f2975771b1c165709324dd8a881e8b340124a6e8ca24b70fb9bbe47.
P2P changes are limited to availability waiting, cancellation and cache policy.
Playback progress storage retains its existing schema and implementation;
Continue Watching dismissal is stored separately. Consent still belongs to
main, saves acceptance only after the pending notice is acknowledged, and
cannot be granted through generic renderer settings/source flags.

## Verification

- Lint and 36 unit checks: transport bodies, redaction, consent, source/range
  validation, patient waiting/cancellation, LRU active protection and persistence.
- Installed core media suite: 33 checks; installed UI suite: 17 checks.
  Evidence: .qa/e2e-1791117719863/evidence.json and
  .qa/ui-1791117727856/evidence.json.
- Installed new UI suite: 14 checks covering settings, preferences, Glass/landscape,
  preview, histories, Undo, native display coverage, double-click and original audio.
  Evidence: .qa/development-ui-1791117877355/evidence.json.
- Actual Windows screenshot inspection verified no title bar/sidebar/navigation
  or taskbar in fullscreen, preserved aspect ratio, auto-hidden overlays and
  native Escape continuing playback/subtitles. Evidence:
  .qa/development/native-ui-observation.json.
- Installed legal public Sintel: 10 checks. Real internet peers supplied metadata
  and pieces; file selection, buffering, localhost Range stream, player, seeking,
  English/Arabic/local subtitles, progress and restart/resume passed. No HTTP
  torrent metadata/video fallback and no self-seeder. Evidence:
  .qa/public-installed-1791117719814/evidence.json.
- Installed Chromium body suite passed all eight formats, including a 21-second
  first chunk, complete movie/episode cards, accurate errors/cancellation/recovery,
  public compatible addon bodies and redirect credential stripping. Evidence:
  .qa/body-1791117721129/evidence.json and .qa/redirect-1791117803822/evidence.json.
- Additional native/local P2P integration and end-to-end tests passed selection,
  consent-before-networking, cancellation, seeking, active-cache protection,
  crash recovery, natural completion and episode progress. Local-peer checks
  complement the public-internet test and do not substitute for it.

Historical releases and their tags/installers/evidence remain untouched. This
installer is a local development delivery awaiting the owner's manual feedback.
