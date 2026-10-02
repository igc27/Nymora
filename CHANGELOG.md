# Changelog

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
