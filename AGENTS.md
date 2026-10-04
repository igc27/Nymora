# Nymora development workflow

The user explicitly authorized publishing the exact manually accepted
1.2.0-dev implementation as v1.2.0 on 2026-10-04. Change only release version
and documentation before securing it. Build, install and verify addon loading,
real public-peer P2P playback, seeking, subtitles, progress and restart first.
Publish Nymora 1.2.0 with direct Windows Setup.exe and SHA256SUMS.txt.
Preserve v1.1.1 and all historical releases, tags, installers and evidence.

After publishing v1.2.0 and verifying its direct installer download, work
locally on dev/1.3-ui with version 1.3.0-dev. Do not push development commits,
create another public tag/release, upload development installers or modify
accepted releases until the user explicitly says `PUBLISH NYMORA`.
At delivery say "Development build ready for your manual test.", give the
local Setup.exe path, stop and wait for feedback. Passing tests is not permission
to publish development work.

Protect addon transport/aggregation, torrent discovery and metadata handling,
loopback Range streaming, HTTP/HLS playback, subtitle queries and progress.
The user specifically authorizes patient/configurable P2P availability waiting
and bounded inactive-cache management in 1.3.0-dev. Make those narrow changes
without unrelated engine refactoring. Fatal source/engine errors must still fail;
ordinary low availability must remain cancellable and continue waiting.

Study official Stremio sources/licenses before reusing code. Preserve configured
addon paths; never log private addon URLs, credentials or tokens. Never ask for
a private addon URL. Use safe public endpoints and isolated QA profiles. Render
successful addon sources as they arrive, independently cancel requests, and show
small failure notices. Informational/filtering entries are never playable cards.

Main-process P2P consent precedes all peer networking. The accepted Nymora modal
persists p2pNoticeAccepted only after actual acknowledgement; Cancel saves nothing,
Settings can reset it, and renderer-supplied consent cannot bypass the gate.
Use legal public media and real internet peers for P2P QA; self-seeding alone
is not proof. Keep processing free/local; no paid or cloud torrent conversion.
