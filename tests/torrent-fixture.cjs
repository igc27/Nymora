'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { startFixture } = require('./fixture.cjs');
async function startTorrentFixture({ uploadLimit = 350 * 1024 } = {}) {
  const { default: WebTorrent } = await import('webtorrent');
  const { Server } = await import('bittorrent-tracker');
  const tracker = new Server({ http: true, udp: false, ws: false, stats: false });
  tracker.on('error', error => console.error('QA tracker:', error.message));
  await new Promise((resolve, reject) => { tracker.once('error', reject); tracker.listen(0, '127.0.0.1', resolve); });
  const announce = `http://127.0.0.1:${tracker.http.address().port}/announce`; const requests = [];
  tracker.http.on('request', req => { if (req.url.startsWith('/announce')) requests.push(req.url); });
  const seeder = new WebTorrent({ dht: false, tracker: true, lsd: false, utp: false, natUpnp: false, natPmp: false, webSeeds: false, uploadLimit, seedOutgoingConnections: false });
  seeder.on('error', error => console.error('QA seeder:', error.message));
  const readme = path.resolve('.qa/media/README.txt'); fs.writeFileSync(readme, 'Nymora developer-owned test torrent. No commercial media.\n');
  const seed = await new Promise((resolve, reject) => { seeder.once('error', reject); seeder.seed([readme, path.resolve('.qa/media/test.mp4'), path.resolve('.qa/media/test.webm')], { announce: [announce], name: 'Nymora-original-media-test', private: true, pieceLength: 64 * 1024 }, resolve); });
  const fileIdx = seed.files.findIndex(file => file.name === 'test.mp4');
  const videoSize = seed.files[fileIdx].length;
  const info = { name: 'Legal P2P infoHash', infoHash: seed.infoHash, fileIdx, sources: [`tracker:${announce}`], behaviorHints: { filename: 'test.mp4', videoSize } };
  const magnet = { name: 'Legal P2P magnet', url: `magnet:?xt=urn:btih:${seed.infoHash}&dn=Nymora%20original%20test&tr=${encodeURIComponent(announce)}`, behaviorHints: { filename: 'test.mp4', videoSize } };
  const backend = { name: 'Legal P2P backend', backend: 'bittorrent', infoHash: seed.infoHash, fileIdx, trackers: [announce] };
  const addon = await startFixture(path.resolve('.qa/media'), { streams: [info, magnet, backend] });
  return { ...addon, tracker, seeder, seed, streams: [info, magnet, backend], trackerRequests: requests, info, magnet, backend, videoSize, async close() { await addon.close(); await new Promise(resolve => seeder.destroy(resolve)); await new Promise(resolve => tracker.close(resolve)); } };
}
if (require.main === module) startTorrentFixture().then(f => console.log(`Developer-owned P2P test addon: ${f.base}/manifest.json`));
module.exports = { startTorrentFixture };
