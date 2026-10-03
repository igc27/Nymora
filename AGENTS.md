# Nymora development workflow

The user explicitly authorized one exception on 2026-10-03: publish the exact
manually verified implementation as v1.1.1, Nymora 1.1.1 — Working Baseline,
after installed Windows regression verification. Publish the direct Setup.exe
and SHA256SUMS.txt. Do not redesign before that baseline is published.
Preserve historical releases and evidence; never replace baseline assets/tags.

After publishing v1.1.1, work locally on dev/1.2-ui with version 1.2.0-dev.
Do not push UI commits, create public tags/releases, upload UI installers, or
modify v1.1.1 until the user explicitly says `PUBLISH NYMORA`. Passing tests
is not publication authorization. At the first UI delivery, say "Development
build ready for your manual UI test.", give the local Setup.exe path, and stop.

Protect the working networking, addon transport, torrent engine, metadata/peer
discovery, loopback Range streaming, subtitles and progress architecture.
Study official Stremio projects and their licenses before reusing code.
Preserve configured addon base paths; never log private addon URLs, credentials
or tokens. Do not ask for a private addon URL. Use safe public endpoints and
isolated QA profiles. Show successful addon results as they arrive, with
independent request cancellation and small failure notices. Informational and
filtering addon entries must never become playable cards.

Baseline v1.1.1 retains fresh native P2P consent. The user's UI request replaces
this in 1.2.0-dev with a Nymora modal and persistent p2pNoticeAccepted: Cancel
never saves acceptance; acceptance precedes all peer networking; Settings can
reset the notice. Renderer-supplied consent must never bypass the main-process gate.
Use legal public media and real internet peers for public P2P QA. Keep all media
processing free and local. No paid services or cloud torrent conversion.
