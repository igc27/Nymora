# Corresponding source for the WebRTC dependency

This document preserves historical native WebTorrent provenance for the 1.0.1/1.1.0 releases and development-only fixtures. Nymora 1.0.2 does not ship those modules as its torrent backend. Its production engine is pinned librqbit 9.0.1, with full native dependency notices under third_party/rqbit/ and the original wrapper source under native/torrent-helper/.

The historical WebTorrent tracker client includes `webrtc-polyfill` and the unmodified official N-API binary from `node-datachannel` 0.32.3. It was loaded only after P2P confirmation. TCP torrent playback was the verified transport; WebRTC interoperability was not independently certified by Nymora's tests.

The MPL-covered files remain under MPL-2.0, with their original notices; Nymora's separate original files remain MIT. Recipients may obtain the corresponding unmodified source, including native build files, without charge from these exact public revisions:

| Component | Source revision / source download | License |
|---|---|---|
| node-datachannel 0.32.3 | https://github.com/murat-dogan/node-datachannel/tree/e495b7efad200bca44038609455c06a7f2ea812d | MPL-2.0 |
| libdatachannel 0.24.2 | https://github.com/paullouisageneau/libdatachannel/tree/4e4f4892dccb2a57fe3a490d0c9d958de4244e74 | MPL-2.0 |
| libjuice | https://github.com/paullouisageneau/libjuice/tree/5948a4162d37bc213d6051b67ee2876ccc5a99a6 | MPL-2.0 |
| usrsctp | https://github.com/paullouisageneau/usrsctp/tree/fec583d54493f879d2ae44a743423bf8a04371ab | BSD |
| libsrtp | https://github.com/cisco/libsrtp/tree/ee1a77c9f9dc02c42bda9901038c500c5efe4cfa | BSD |
| plog | https://github.com/SergiusTheBest/plog/tree/94899e0b926ac1b0f4750bfbd495167b4a6ae9ef | MIT |
| nlohmann/json | https://github.com/nlohmann/json/tree/55f93686c01528224f448c19128836e7df245f72 | MIT (library; upstream test-only licenses are separate) |

Clone libdatachannel at that revision and initialize its submodules to retrieve all exact source dependencies. Its full MPL license and each dependency's original notices are included in `third_party/native-licenses` and the application's About notices. Native binding source is also included in the official npm package. No MPL-covered code was modified by Nymora.

The official node-datachannel Windows prebuild uses OpenSSL from vcpkg; its published build recipe does not pin the vcpkg revision. OpenSSL's source and release history are available at https://github.com/openssl/openssl. Both its Apache-2.0 (3.x) and legacy OpenSSL/SSLeay notices are supplied, without claiming an independently identified exact OpenSSL version inside that upstream binary. OpenSSL Project and Eric Young copyrights remain applicable to their respective components.

The binding's build recipe is available at https://github.com/murat-dogan/node-datachannel/blob/e495b7efad200bca44038609455c06a7f2ea812d/.github/workflows/build-win.yml. The N-API binary is unmodified; its original SHA-256 and source/build references are recorded in `third_party/native-binary.json`.
