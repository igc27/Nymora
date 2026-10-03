'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isP2P, normalizeTorrent, selectFile } = require('../src/torrent-source.cjs');
const { TorrentCache } = require('../src/torrent-cache.cjs');
const { Playback } = require('../src/playback.cjs');
const { range } = require('../src/torrent-engine.cjs');
const infoHash = '0123456789abcdef0123456789abcdef01234567';
const put = (store, index, data) => new Promise((resolve, reject) => store.put(index, data, error => error ? reject(error) : resolve()));
test('P2P identifiers route to consent; magnet parameters are data, never executable metadata URLs', () => {
  for (const stream of [{ infoHash }, { magnet: `magnet:?xt=urn:btih:${infoHash}` }, { magnetUri: `magnet:?xt=urn:btih:${infoHash}` }, { url: `MAGNET:?xt=urn:btih:${infoHash}` }, { backend: 'p2p' }, { behaviorHints: { p2p: true } }]) assert.equal(isP2P(stream), true);
  assert.equal(isP2P({ url: 'https://example.com/video.mp4' }), false);
  const source = normalizeTorrent({ url: `magnet:?xt=urn:btih:${infoHash}&dn=Original&tr=http%3A%2F%2F127.0.0.1%3A1234%2Fannounce&xs=file%3A%2F%2FC%3A%2Fprivate&ws=https%3A%2F%2Fexample.com`, fileIdx: 0 });
  assert.equal(source.infoHash, infoHash); assert.equal(source.displayName, 'Original'); assert.equal(source.trackers.length, 1); assert.doesNotMatch(source.magnet, /xs=|file:/); assert.match(source.magnet, /ws=/);
  assert.throws(() => normalizeTorrent({ infoHash: 'invalid' }), /Invalid/);
  assert.throws(() => normalizeTorrent({ infoHash, fileIdx: -1 }), /index/);
  assert.throws(() => normalizeTorrent({ infoHash, trackers: ['file:///private'] }), /tracker/);
  assert.throws(() => normalizeTorrent({ infoHash, magnet: `magnet:?xt=urn:btih:${'f'.repeat(40)}` }), /different/);
});
test('Explicit file index, filename and video size choose actual metadata; no file name becomes a disk path', () => {
  const files = [{ name: 'readme.txt', path: '../../readme.txt', length: 300 }, { name: 'original.mp4', path: 'Video/original.mp4', length: 1234 }, { name: 'alternate.webm', path: 'alternate.webm', length: 2345 }];
  assert.equal(selectFile(files, { fileIdx: 1 }), files[1]); assert.equal(selectFile(files, { filename: 'original.mp4' }), files[1]); assert.equal(selectFile(files, { videoSize: 2345 }), files[2]);
  assert.throws(() => selectFile(files, { fileIdx: 0 }), /video/); assert.throws(() => selectFile(files, { fileIdx: 9 }), /index/);
});
test('Default file selection prefers a main video over samples while explicit selections remain exact', () => {
  const files = [{ name: 'poster.jpg', length: 90000 }, { name: 'notes.nfo', length: 70000 }, { name: 'preview.mkv', path: 'Samples/preview.mkv', length: 60000 }, { name: 'motion.sample.mp4', length: 50000 }, { name: 'motion.m4v', length: 30000 }, { name: 'motion.webm', length: 20000 }];
  assert.equal(selectFile(files, {}), files[4]);
  assert.equal(selectFile(files, { fileIdx: 2 }), files[2]);
  assert.equal(selectFile(files, { filename: 'motion.sample.mp4' }), files[3]);
  assert.equal(selectFile([files[3]], {}), files[3]);
  assert.throws(() => selectFile(files.slice(0, 2), {}), /no supported video/);
});
test('No engine start, stop, cache work or HTTP replacement before native consent; Cancel and forged consent do nothing', async () => {
  let started = 0, stopped = 0, replacement = 0, confirmResolve, shown;
  const torrents = { status: () => ({ phase: 'idle', startedSessions: started }), start: async () => { started++; return { p2p: true }; }, stop: async () => { stopped++; } };
  const playback = new Playback({ media: { source: () => { replacement++; return {}; }, stop: () => { replacement++; } }, torrents, cacheLimit: () => 100, confirm: options => { shown = options; return new Promise(resolve => { confirmResolve = resolve; }); } });
  const first = playback.source({ infoHash, consent: true, p2pConsent: true });
  assert.equal(playback.status().phase, 'awaiting-consent'); assert.equal(started + stopped + replacement, 0);
  assert.equal(shown.title, 'P2P Streaming Notice'); assert.deepEqual(shown.buttons, ['Cancel', 'I Understand — Play']); assert.equal(shown.defaultId, 0); assert.equal(shown.cancelId, 0);
  for (const word of ['upload', 'IP address', 'authorized', 'legality', 'does not grant permission']) assert.ok(shown.detail.includes(word));
  confirmResolve({ response: 0 }); assert.deepEqual(await first, { cancelled: true }); assert.equal(started + stopped + replacement, 0);
  const second = playback.source({ infoHash }); confirmResolve({ response: 1 }); assert.equal((await second).p2p, true); assert.equal(started, 1);
  const third = playback.source({ infoHash }); assert.equal(started, 1); confirmResolve({ response: 0 }); await third; assert.equal(started, 1);
});
test('Cancelling pending consent invalidates that request even if its later response accepts', async () => {
  let accept, started = 0;
  const playback = new Playback({ media: { stop() {} }, torrents: { async start() { started++; }, async stop() {} }, cacheLimit: () => 100, confirm: () => new Promise(resolve => { accept = resolve; }) });
  const pending = playback.source({ infoHash }); await playback.stop(); accept({ response: 1 }); assert.equal((await pending).cancelled, true); assert.equal(started, 0);
});
test('Bounded piece cache rejects overflow and preserves unrelated files while clearing owned data', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nymora-p2p-cache-')), cache = new TorrentCache(path.join(root, 'owned'));
  cache.ensure(); fs.writeFileSync(path.join(cache.directory, 'user-document.txt'), 'keep');
  const Store = cache.create(8), store = new Store(8, { length: 16 });
  await put(store, 0, Buffer.from('12345678')); await assert.rejects(put(store, 1, Buffer.from('abcdefgh')), /limit/);
  assert.equal(cache.size(), 8); assert.throws(() => cache.clear(), /Stop/);
  await new Promise(resolve => store.close(resolve)); cache.clear(); assert.equal(cache.size(), 0); assert.equal(fs.readFileSync(path.join(cache.directory, 'user-document.txt'), 'utf8'), 'keep');
  const other = path.join(root, 'unrecognized'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'keep.txt'), 'keep'); assert.throws(() => new TorrentCache(other).clear(), /Unrecognized/); assert.ok(fs.existsSync(path.join(other, 'keep.txt')));
});
test('HTTP ranges support full, suffix and seek slices and reject malformed/unsatisfiable requests', () => {
  assert.deepEqual(range('bytes=50-70', 100), { start: 50, end: 70, partial: true }); assert.equal(range('bytes=-10', 100).start, 90);
  for (const value of ['bytes=101-', 'bytes=4-2', 'bytes=1-4,8-9', 'bytes=-0', 'evil']) assert.throws(() => range(value, 100));
});
test('Tracker peer decoding preserves IPv4/IPv6 ports and rejects truncated protocol data', async () => {
  const { default: addresses } = await import('../vendor/bittorrent-tracker/lib/compact-address.js');
  assert.deepEqual(addresses.multi(Buffer.from('7f0000011ae1', 'hex')), ['127.0.0.1:6881']);
  assert.deepEqual(addresses.multi6(Buffer.from('000000000000000000000000000000011ae1', 'hex')), ['[0:0:0:0:0:0:0:1]:6881']);
  assert.throws(() => addresses.multi(Buffer.alloc(5)), /Malformed/);
  const peerExchangeAddresses = require('compact2string');
  assert.deepEqual(peerExchangeAddresses.multi(Buffer.from('7f0000011ae1', 'hex')), ['127.0.0.1:6881']);
  assert.equal(peerExchangeAddresses(Buffer.from('000000000000000000000000000000011ae1', 'hex')), '[0:0:0:0:0:0:0:1]:6881');
});
