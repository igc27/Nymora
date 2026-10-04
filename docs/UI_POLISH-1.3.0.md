# Nymora 1.3.0-dev — local UI polish

Branch: dev/1.3-ui. UI-only work after the accepted local 69a81a9 milestone.
Version remains 1.3.0-dev. No push, public tag, release or upload.
The previous milestone installer and its evidence are preserved.

Installer: release/development/Nymora-1.3.0-dev-Windows-x64-Setup.exe

SHA-256: e23402702fd8e7e902eaf9fc9192c238e64464a35ab37fd34269f4c1f8b79cf7

Installed and packaged app.asar:
275996c425666e4da99dc6a8961899462bc0f1046b0293fda27d7b657e17da9c

Silent installation returned 0. Existing user configuration was preserved
by hash comparison. All regression profiles are isolated from user data.
Installation record: .qa/development/ui-polish-install.json.

## UI behavior

- Actual BrowserWindow fullscreen; renderer observes the settled native state.
  On Windows, fullscreen events can precede isFullScreen() changes. Custom
  titlebar, window buttons and app navigation are explicitly hidden in fullscreen.
  F, double-click and Escape work, including rapid F/Escape transitions and
  virtual keyboard input with omitted physical codes and the active Arabic layout.
- Player and video occupy the whole viewport. Persistent Fit/Fill/Original
  choices use contain/cover/scale-down, preserving aspect ratio. Fit explains
  aspect-ratio bars; Fill explains cropping.
- Static initial HTML intro appears before state IPC and catalog initialization.
  Preload receives only the two saved startup choices. Home loads in parallel
  behind the approximately 1.4-second intro. Intro and local original sound remain
  independent; both can be disabled, and previews remain available.
- Nine preference categories. Player defaults include fullscreen, fit, 5/10/15/30
  second skips, 2/3/5 second or Never auto-hide, hold Space, .5/.75/1/1.25/1.5/2
  speed, next episode autoplay, Ask/Resume/Start Over and P2P statistics visibility.
  Subtitle and audio preferences continue to use their existing global settings.
- Navigation history restores settings categories, search results, Discover
  filters, Library tabs, title/person pages and episode season/page selection.
  Top Back controls, Alt+Left, Backspace outside inputs and mouse Back are supported.
  Root Home has no Back control. Home/End retain their normal behavior.
- Approximately 700 ms external hover/focus preview with Open/Play, Watchlist and
  Watched actions. Placement prefers a 14 px gap above, then sides/below; compact
  viewport fallbacks never overlap the target card. Keyboard focus enters its
  actions; actions do not click through to the title.
- Title primary actions precede synopsis and cast. Source cards retain independent
  early arrival. Optional provider errors are deduplicated compact disclosures,
  with a source-notice count. The slogan is removed from all pages.
- Six-dot handles support actual pointer dragging with a mint insertion line and
  immediate persistence; Move Up/Down remain keyboard alternatives. The raw false
  came from passing a conditional boolean directly into DOM replaceChildren;
  that call is fixed, and the shared element helper rejects accidental primitives.
- Continue Watching removal keeps its separate dismissal state, Watchlist and
  progress, and offers Undo with the requested tooltip. Watched/Watchlist remain
  distinct. Card lifts and brief details transitions respect reduced motion.
- Autoplay uses the next supplied episode's exact ID and a matching provider and
  source when available, through the existing preparation/consent gate. When no
  matching source exists, the next episode's sources remain available for selection.

## Protected implementation

All 17 backend modules match 69a81a9, including addon/body transport,
aggregation, discovery, torrent/native cache, loopback streaming, subtitle
transport, classification and consent. Store class implementation, main
progress/Watched/Watchlist operations and renderer progress save are identical.
Main changes are limited to window UI and validated preference fields; Store
changes are limited to preference defaults.

Protection record: .qa/development/ui-polish-protected-code.json.
Native helper SHA-256 remains
e74cad679f2975771b1c165709324dd8a881e8b340124a6e8ca24b70fb9bbe47.

## Verification

Installed regression records are collected in
.qa/development/ui-polish-regression-summary.json.
Lint and 36 unit checks passed. Installed core/UI/development/polish suites
passed 33/17/14/7 grouped checks. The installed body suite passed all eight
response formats, body failure/cancellation/recovery checks and real public
compatible addon responses; the redirect credential-stripping check passed.
Installed public Sintel passed all 10 checks: real internet peer metadata and
pieces, selected file, buffering, loopback Range streaming, decoding, seek,
English/Arabic/local subtitles, progress and restart/resume. No self-seeder,
HTTP torrent metadata or HTTP video fallback was used.
Native Windows observation: .qa/development/native-ui-polish-observation.json.
The observed fullscreen viewport and video are 1536 × 864 display DIPs, with
titlebar and app chrome display:none. Native Escape returns to the window while
video and subtitles continue. Screenshots and detailed checks stay with each
isolated QA profile. This local build awaits the user's manual UI verification.
