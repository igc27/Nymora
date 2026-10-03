# Local development investigation — 1.0.3-dev

The first candidate's body-reading implementation failed manual verification.
The latest correction and installed-build evidence are documented in
[BODY_TRANSPORT-1.0.3-dev.md](BODY_TRANSPORT-1.0.3-dev.md). Earlier measurements
below describe that earlier candidate, not proof of private-addon compatibility.

Publication is frozen. This identifier stays fixed through manual bug reports.
No remote commits, tags, releases or assets are part of this work. Local Windows
artifacts go into `release/development/`; QA output goes into ignored `.qa/`.
Historical 1.0.2 installers, screenshots and evidence are preserved.

## Official implementation study (2026-10-03)

Read the current official sources before implementing transport changes:

| Project | Inspected revision | License | Relevant behavior |
| --- | --- | --- | --- |
| [stremio-service](https://github.com/Stremio/stremio-service) | `1891799734acba88904f9f62cb8ca491873b36fb` | GPL-2.0 | Separate local service supervises a bundled runtime and server.js; includes FFmpeg/FFprobe. |
| [stremio-core](https://github.com/Stremio/stremio-core) | `065237d69f0c8c60c5ec2049b46f592c0d37d321` | MIT | Resource URL construction preserves addon configuration paths; the web environment uses browser fetch; results have independent loading/ready/error state. |
| [stremio-addon-client](https://github.com/Stremio/stremio-addon-client) | `7c66830cfc1a8e749373d9df0bb105c7dad33bfd` | MIT | Manifest/resource matching and encoded resource paths; existing Nymora vendored primitives remain in use. The old HTTP adapter uses node-fetch, unlike the current web core. |
| [stremio-web](https://github.com/Stremio/stremio-web) | `d4275cb250ca722cf06439645dc8c250a8b68e36` | GPL-2.0 | StreamsList renders ready addon groups independently of loading groups; player consumes core-resolved streams and a local streaming server URL. |

Service details: `src/config.rs` locates packaged binaries beside the service,
or in resources during development. `src/server.rs` launches the hidden bundled
runtime with server.js and FFMPEG_BIN/FFPROBE_BIN, retains the child and stops it
on shutdown/drop. `build.rs` downloads the server bundle version specified in
Cargo.toml (currently v4.21.1). The Windows installer includes the runtime,
server.js, FFmpeg and FFprobe. Core calls local settings/statistics endpoints
and converts torrent hash/file index/trackers into a local media URL. The
inspected official server bundle handles Range with 206, Content-Range,
Accept-Ranges and a selected torrent file's createReadStream.

No GPL service/web code or binaries were copied into Nymora or its installer.
The bundle's referenced separate license file was unavailable at the inspected
download URL; this is an additional reason not to redistribute that bundle.
Research copies are ignored and excluded from packaging. The existing Apache-2.0
librqbit helper remains a separate local service with its existing notices.
Torrent discovery/streaming code was not changed for this addon bug.

Also inspected AIOStreams revision `70ffb17a7bb99dd73dbab257af040b04f56eaa42`
(AGPL-3.0) to identify protocol data, without copying its implementation:
`transformers/stremio.ts` exports statistics as externalUrl entries marked
`streamData.type: statistic`, and errors as type error. Removal reasons and
disabled stream types are statistics, not playable media.

## Installed-process measurements

`node tests/network.probe.cjs` with NYMORA_TEST_EXE pointing to the installed
historical 1.0.2 app used a fresh isolated profile. Only a safe public Cinemeta
manifest and a synthetic proxy endpoint were contacted. No private addon
configuration was read. Extracted evidence is in `.qa/network-1791005560986/`.

| Measurement | Node fetch / HTTPS | Electron Chromium |
| --- | --- | --- |
| Public manifest HTTP status | 200 | 200 |
| Complete JSON | 189 ms | 171 ms |
| DNS | 25 ms, IPv4 answers | 17 ms, IPv4 answers |
| Connection/TLS | fetch combined 110 ms; HTTPS connected at 36 ms and TLS authorized at 117 ms | TCP 35 ms, TLS 48 ms (NetLog phase durations) |
| Connection reuse | available through undici pooling | repeat 2 ms (cache/reuse); production addon session disables cache |
| Controlled proxy-only endpoint | ENOTFOUND, 33 ms | 200, 5 ms |

The machine reported DIRECT for this safe public endpoint. Therefore the public
measurement does **not** reproduce the user's private addon timeout and does
not establish that their active configuration uses a proxy. The controlled test
demonstrates an actual compatibility gap: raw Node fetch does not follow the
Chromium session proxy route. No third HTTP implementation performed better;
Node HTTPS also reached the public endpoint with verified TLS.

The local fix uses an isolated Chromium addon session inheriting normal system
networking. Chromium handles DNS, IPv4/IPv6 connection racing, TLS verification,
system proxy/PAC, compression, user agent and pooling. There is no forced IPv4,
custom DNS override, TLS bypass or paid dependency. Chromium doesn't expose a
separate connect timer in fetch: its establishment/retry policy is capped by
Nymora's 20-second response-header budget, across redirects. Bounded JSON/text
reads now have a 30-second body idle deadline and 120-second total body deadline,
both starting after headers. Each request has its own controller; a caller signal cannot replace
these deadlines. Media body streaming retains the player's cancellation signal
and is not limited to the JSON body deadline.

Configured path encoding is retained for catalog/meta/stream/subtitles, including
long configuration paths (up to a bounded 128 KiB URL). Chromium owns its bounded
native redirects; Electron's manual fetch redirect path is incompatible.
Cross-origin authentication is stripped by the dedicated session's header guard.
Session credentials are
omitted, and the Chromium session is separate from the renderer's session.

## Result delivery and classification

Each compatible addon updates the main-process source query as it settles.
The renderer reads changed revisions every 200 ms and appends ready source
cards immediately. One timeout produces a small notice without removing cards.
Cancelling the native P2P notice keeps addon discovery running. Only accepted
playback cancels the remaining source queries. Navigation/episode changes cancel
the old group; individual provider failure
does not cancel the others. No P2P networking runs during these requests.

Only supported HTTP(S) streams and validated v1 hash/magnet streams become
cards. Statistics, configuration/removal messages, external actions, invalid
hashes and unsupported formats become compact notices. Main-process source
routing independently rejects them. Valid P2P still requires native consent.

Copy Addon Diagnostics appears beside failures. Its allowlisted output contains
only transport, addon request index, stage, total/header/body elapsed milliseconds,
status, decoded byte count, configured timeout budgets/kind, and normalized code.
Chromium's unexposed redirect count is null. It contains no URL/host/path, configured
addon data, headers, cookies, tokens or raw errors. Existing Copy P2P Diagnostics
keeps its stricter P2P-specific field allowlist.

## Reproducible local checks

- `npm run lint`; `npm test` (27 tests); runtime audit (zero vulnerabilities).
- `npm run test:body`: Web body formats, deadlines, diagnosis, real public
  addon JSON/source cards and Chromium redirect authentication.
- `npm run test:e2e`: generated legal HTTP/HLS media, movie/series, exact episode
  IDs, seeking, English/Arabic/local subtitles, progress, restart, addon removal.
- `node tests/addons.e2e.cjs`: five installed addons, seven sources visible in
  35–43 ms while another request hangs; real 20-second timeout; cards remain;
  notice classification; player boundary; redacted export; configured paths;
  exact episode ID; navigation cancellation; production Chromium proxy route.
- `npm run package`: local-only development installer, publish never.

Installed development build and public-peer results are recorded separately
under `.qa/development/` after running the checks. Automated checks establish
the tested cases only. The user's installed addon remains the final manual
compatibility gate; neither a passing test nor this report permits publication.

## Earlier candidate results (superseded for body transport)

The final local Setup installed successfully (exit 0). Its installed app.asar
matched the packaged app.asar byte for byte. Existing user configuration was
preserved; QA used isolated profiles. The installed addon suite returned seven
playable cards in 54 ms, preserved pending addon discovery after P2P Cancel,
retained all cards after the actual 20-second timeout, and passed proxy routing,
exact episode IDs and redacted diagnostics. The installed HTTP/HLS suite passed.

The final installed public Sintel test passed all 10 checks: peer metadata
(1215 ms, 14 live peers at initial playback), selected file, buffer, localhost Range,
decoded frames, seek to 180.206814 seconds, English/Arabic/Off/local subtitles,
progress, shutdown and restart with fresh consent/resume at 180.595446 seconds.
The real native dialog independently recorded Cancel = zero sessions and
Accept = one session with decoded public-peer video. The helper remains the
unchanged 1.0.2 engine component within the 1.0.3-dev application.

Local installer: `release/development/Nymora-1.0.3-dev-Windows-x64-Setup.exe`

SHA-256: `448069ced67584be237469e56e1a51294b3a8173531fdaddd495303fbecd72e6`

No pushes, tags, releases or uploads were performed. Manual testing of the
user's installed addon is still required. If it fails, Copy Addon Diagnostics
provides the redacted local evidence without requesting its private URL.
