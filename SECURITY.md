# Security

Version 1.0.x receives security fixes while it is the current release.

Report vulnerabilities privately using GitHub's **Report a vulnerability** on the Nymora repository when enabled. If it is unavailable, open a minimal issue requesting a private reporting channel; do not post credentials or a working exploit publicly. Include the version, affected feature and reproducible steps once a private channel is available.

The renderer has no Node access. Context isolation, sandboxing, web security, a restrictive CSP, denied permission requests and a narrow IPC interface protect the desktop boundary. Addon metadata is inserted as text, not HTML. Manifest and external URLs accept HTTP(S) only, reject embedded credentials, and cannot execute OS shell commands. Resource JSON and subtitle downloads are bounded; redirects are validated. A random per-playback token protects the loopback media proxy. No addon executable code is loaded.

The Windows installer grants the standard ALL APPLICATION PACKAGES SID read/execute access to each exact file/directory in the packaged runtime manifest. This allows Chromium's sandbox to read its own runtime on hosts with inherited AppContainer ACLs. It grants no write access, does not recursively alter unrelated files in a chosen folder, and does not touch the user-data directory. The manifest is generated from the packaged distribution by scripts/after-pack.cjs. Failure to apply a required permission aborts installation visibly.

Third-party addons are independently maintained services. Installing one allows it to receive catalog/search/title/subtitle requests and return media URLs; those services can observe their requests and your IP address. HTTP endpoints are accepted for developer and user-controlled servers, so use HTTPS for untrusted internet services. Configured addon URLs may contain private addon keys in their paths; they are stored locally and should not be included in public screenshots or bug reports. Nymora has no telemetry and does not upload viewing data to its own servers.

Releases are initially unsigned. There is no automatic updater. Obtain binaries from the project's release page and compare SHA256SUMS.txt. Unsupported sources fail visibly instead of invoking arbitrary external programs. Dependency audit results and unresolved findings must be recorded in docs/QA.md before release.
