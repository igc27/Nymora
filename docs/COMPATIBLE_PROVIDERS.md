# Compatible provider review — 2026-10-04

Nymora installs no remote addon automatically. The first UI development build
offers Cinemeta in Recommended / Compatible, with an explicit Install button,
independent-provider attribution and a link to the provider's terms. It does not
use the label “Nymora Official”, copy Stremio's visual identity, or install any
community torrent index or streaming addon.

Reviewed primary sources:

- [Stremio official descriptor repository](https://github.com/Stremio/stremio-official-addons)
  and [MIT license](https://github.com/Stremio/stremio-official-addons/blob/master/LICENSE.md).
  The collection is MIT licensed and lists Cinemeta as its own movie/series
  catalog and metadata addon. The current descriptor points to
  `https://v3-cinemeta.strem.io/manifest.json`.
- [Current descriptor list](https://github.com/Stremio/stremio-official-addons/blob/master/index.json).
  Provider ownership and capability facts inform the recommendation. Nymora
  does not redistribute the descriptor collection or service implementation.
- [Stremio General Terms and Conditions](https://www.stremio.com/tos).
  These address Stremio's platform, users, addons and services. This review did
  not establish an explicit grant for automatic hosted-service use by every
  independent third-party client, nor a trademark endorsement.
- [Official Cinemeta usage tutorial](https://github.com/Stremio/stremio-addons/blob/master/docs/tutorial/using-cinemeta.md).
  This older protocol example documents metadata use in addon development; it
  does not establish the current hosted endpoint's unrestricted default-use terms.

Decision: hosted-service default permission is unclear, so do not silently
bundle or preinstall Cinemeta. Users can choose to install the compatible addon
and consult its operator's terms. The addon uses Nymora's existing working
transport and can be removed normally. The operator may change service access,
availability, metadata or terms. Re-review explicit service permission before
any future default installation. MIT software permissions do not supply hosted
service, content or trademark rights.

Existing upstream copyright and license notices remain intact. No Cinemeta
service source was found under the guessed Stremio/stremio-cinemeta path; Nymora
does not claim a verified license for a remotely hosted implementation.
