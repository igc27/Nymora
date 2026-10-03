# Nymora development workflow

The user has imposed a release freeze. All work stays local until the user
explicitly sends the exact instruction `PUBLISH NYMORA` in this conversation.
Do not push commits or version bumps, create tags, create or modify GitHub
Releases, upload installers/assets, or publish anything during this freeze.
Preserve historical releases and their evidence. Passing tests is not permission
to publish. Local edits, tests, commits, builds and installers are allowed.

Use the same local development identifier, `1.0.3-dev`, through subsequent bug
reports. After local verification and installed Windows testing, provide the
local installer path with: "Development build ready for your manual test."
Then stop and wait for the user's manual test. Continue fixing the same local
development version until explicit publication authorization arrives.

Current priority: prove and fix addon HTTP transport before changing the torrent
engine. Study official Stremio projects and their licenses before reusing code.
Preserve configured addon base paths; never log private addon URLs, credentials
or tokens. Do not ask for a private addon URL. Use safe public endpoints and
isolated QA profiles. Show successful addon results as they arrive, with
independent request cancellation and small failure notices. Informational and
filtering addon entries must never become playable cards.

P2P sessions always require fresh native consent before any peer networking.
Use legal public media and real internet peers for public P2P QA. Keep all media
processing free and local. No paid services or cloud torrent conversion.
