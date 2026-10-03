# Body transport correction — local development only

Version remains 1.0.3-dev. Publication is frozen. The torrent engine was not
modified for this fix. Default user configuration is not read by the tests;
all application QA runs use separate local profiles.

## Reproduced causes

The previously installed candidate rejected a legal fixture's HTTP 200 body
after 8025 ms. The same Electron session's standard `response.text()` read that
body successfully after its first chunk arrived at 9 seconds. Nymora already
used `getReader()`, not a Node async iterator. The header timer already cleared
on arrival. The bugs were an overly short 8-second body idle deadline, a
30-second overall deadline starting before headers, and partial diagnostics.

StreamQueries merged the body failure into the earlier header record. That kept
the header's elapsed time (22 ms in the reproduction) beside a much later body
TIMEOUT and HTTP 200. The addon error formatter then said “did not respond”.

The Chromium matrix also reproduced failure on redirects: Electron 44.5.1
`net.fetch` forwards manual redirects to ClientRequest without a redirect
listener; ClientRequest rejects with “Redirect was cancelled”. Native follow
works, including a redirect whose old body never ends. Explicit authentication
headers required a session guard to prevent forwarding to another origin.

Inspected upstream implementation (no upstream code was copied):
[Electron fetch wrapper](https://github.com/electron/electron/blob/v44.5.1/lib/browser/api/net-fetch.ts),
[Electron ClientRequest redirect handling](https://github.com/electron/electron/blob/v44.5.1/lib/common/api/net-client-request.ts).

## Current behavior

- Connection/header budget: 20 seconds across redirects, cleared at headers.
- Body idle budget: 30 seconds, starting at headers and resetting on actual bytes.
- Total body budget: 120 seconds, starting at headers independently of connection time.
- Standard Web `getReader()` consumption; decoded byte counter capped at 8 MiB.
- Content-Length is optional; compressed wire length is not compared to decoded bytes.
- Timers disarm at EOF; success releases the reader without cancelling it.
  Failures/caller cancellation cancel the reader and abort the network request.
- UTF-8 decoding follows Response.text BOM behavior before JSON parsing.
- Failure codes: HEADER_TIMEOUT, BODY_TIMEOUT (idle/overall), INVALID_JSON,
  TRUNCATED_RESPONSE, RESPONSE_TOO_LARGE, STREAM_READ_FAILURE, CANCELLED,
  and REDIRECT_FAILURE. HTTP 200 body failures retain that status in the message.
- Every diagnostic is a fresh snapshot. Export includes total/header/body time,
  byte count and configured body budgets. No private URL, headers, raw error,
  token or credential enters the export. Native redirect count is unavailable
  from net.fetch and is reported as null.
- Chromium handles its bounded native redirect chain. The dedicated session
  strips Authorization, Cookie and Proxy-Authorization on a different origin
  and cleans its request tracking at completion/error.

## Reproduction and verification

`npm run demo:body` runs the development-only server. Its manifest routes cover
Content-Length, chunked transfer, gzip, brotli, delayed chunks, keep-alive,
redirects and a UTF-8 BOM. Error routes cover malformed JSON, a broken declared
length, an oversized compressed body, header/body stalls and a redirect loop.
Fixtures are test files excluded from the installer; media is not bundled.

`npm test` includes the local body regressions. `npm run test:body` runs the
production Electron reader, normal Web text/arrayBuffer baselines, actual UI
source queries, exported diagnostics and cross-origin authentication checks.
Set NYMORA_TEST_EXE to the installed Nymora.exe to exercise packaged production
modules from that app's app.asar, rather than importing workspace copies.

The real public endpoint is the official
[Stremio static example](https://github.com/Stremio/stremio-static-addon-example),
using its BigBuckBunny catalog/meta/stream routes. Cinemeta's Big Buck Bunny
metadata route is also checked. These tests establish full JSON consumption,
parsed stream descriptors and visible playable cards. They do not claim the
example's historical video host is currently playable, nor do they access the
user's privately configured addon. That compatibility remains the manual gate.

## Final installed candidate

Local Setup installation completed with exit code 0. Packaged and installed
app.asar both have SHA-256:
`2b6d92bfd9ed9b43ba7bacde2e1c2077fab503956b20c129db056eab3b8e5786`.

Installer: `release/development/Nymora-1.0.3-dev-Windows-x64-Setup.exe`

SHA-256: `a2387fdfc43e15129f983006d166e687dfdf6dfba0081228cc30edf41c356361`.

Existing default configuration remains byte-for-byte unchanged (hash only
checked; configuration contents were never read). Build identity evidence is
in `.qa/development/body-build-evidence.json`. Final installed QA evidence
is recorded in the isolated profiles listed below after verification.
No passing check authorizes publication.

Final installed verification passed:

- Body matrix and UI: `.qa/body-1791008944190/evidence.json`.
  Installed version 1.0.3-dev, Electron 44.5.1. All eight body formats parsed.
  The delayed body finished after 21004 ms with HTTP 200. Movie and episode
  queries each displayed eight playable cards, including the delayed provider.
  Copy Addon Diagnostics measured 30005 ms of body time plus 2080 ms of header
  time (32085 ms total), accurately labelled BODY_TIMEOUT / HTTP 200.
- Public example addon catalog/meta/stream and Cinemeta meta all completed
  HTTP 200 JSON reads. Big Buck Bunny source cards appeared in the installed UI.
- Redirect auth guard: `.qa/redirect-1791009026616/evidence.json`.
  Same-origin Authorization preserved; cross-origin Authorization and Cookie
  absent. Redirect loops, unfinished redirect bodies, cancellation and recovery
  passed in the production session.
- Existing addon suite: `.qa/addons-1791009027807/evidence.json`.
  Partial results, 20-second header timeout, accurate notices, configured paths,
  exact episode IDs, proxy routing and cancellation all passed.
- Existing HTTP/HLS/player suite: `.qa/e2e-1791009051582/evidence.json`.
  MP4/WebM/HLS decoding, seek, English/Arabic subtitles, progress and restart
  all passed on the installed build.
- Lint, 27 unit tests, diff whitespace check and runtime dependency audit passed.

No pushes, tags, releases or uploads were performed. No torrent-engine changes
were made. The local installer is ready for the user's manual addon test.
