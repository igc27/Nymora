'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { TorrentEngine } = require('../src/torrent-engine.cjs');
const { normalizeTorrent } = require('../src/torrent-source.cjs');
const { startTorrentFixture } = require('./torrent-fixture.cjs');
(async () => {
  const fixture = await startTorrentFixture({ uploadLimit: 1024 * 1024 });
  const engine = new TorrentEngine({ cacheDirectory: path.resolve(`.qa/p2p-engine-${Date.now()}`), localOnly: true });
  try {
    assert.equal(engine.client, null); console.log('PASS no torrent client exists before starting the accepted session');
    const unavailable = normalizeTorrent({ infoHash: 'f'.repeat(40), trackers: fixture.info.sources.map(value => value.slice(8)) });
    engine.metadataTimeout = 600;
    await assert.rejects(engine.start(unavailable), /waiting limit was reached/);
    assert.equal(engine.status().phase, 'error'); assert.equal(engine.client, null); assert.equal(engine.cache.active, null);
    engine.metadataTimeout = 90000;
    const cancelled = engine.start(unavailable);
    const rejection = assert.rejects(cancelled, /cancelled/);
    setTimeout(() => engine.stop(), 150);
    await rejection; await engine.stop(); assert.equal(engine.client, null); assert.equal(engine.cache.active, null);
    console.log('PASS real unavailable metadata times out, cancellation closes its session, and the next source can start');
    const source = await engine.start(normalizeTorrent(fixture.info), 256 * 1024 ** 2);
    assert.equal(source.filename, 'test.mp4'); assert.equal(source.fileIdx, fixture.info.fileIdx);
    const first = await fetch(source.url, { headers: { Range: 'bytes=0-4095' } }); assert.equal(first.status, 206);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), fs.readFileSync('.qa/media/test.mp4').subarray(0, 4096));
    const start = Math.floor(fixture.videoSize * 0.8), end = start + 4095;
    const seek = await fetch(source.url, { headers: { Range: `bytes=${start}-${end}` } }); assert.equal(seek.status, 206);
    assert.deepEqual(Buffer.from(await seek.arrayBuffer()), fs.readFileSync('.qa/media/test.mp4').subarray(start, end + 1));
    assert.ok(engine.status().downloaded < fixture.videoSize); assert.equal(engine.status().lastRangeStart, start);
    // Adjacent files can share the verified first/last piece with the selection.
    assert.ok(engine.torrent.files.find(file => file.name === 'test.webm').downloaded <= 2 * fixture.seed.pieceLength);
    console.log('PASS real peer metadata, explicit file selection, partial streaming and future byte seeking without downloading the full file');
    await engine.stop(); assert.equal(engine.client, null); assert.equal(engine.server, null); assert.equal((await fetch(source.url).catch(() => null)), null);
    engine.cache.clear(); assert.equal(engine.cache.size(), 0); console.log('PASS P2P sockets, HTTP endpoint and owned cache cleanup');
    const peerOnly = normalizeTorrent({ ...fixture.info, sources: [], magnet: `magnet:?xt=urn:btih:${fixture.seed.infoHash}&x.pe=127.0.0.1:${fixture.seeder.torrentPort}` });
    await engine.start(peerOnly, 256 * 1024 ** 2); assert.equal(engine.status().metadataState, 'received');
    console.log('PASS explicit magnet peer resolves metadata without any tracker or DHT; 1.0.1 discarded this discovery path');
    const sessionCount = engine.status().startedSessions;
    const restarted = new Promise(resolve => engine.helper.on('message', message => { if(message.event==='idle') resolve(); }));
    engine.helper.child.kill(); await restarted; assert.equal(engine.status().phase,'error'); assert.equal(engine.status().errorCode,'ENGINE_CRASH'); assert.equal(engine.status().startedSessions,sessionCount);
    console.log('PASS crashed helper restarts idle without automatically resuming P2P activity');
  } finally { await engine.stop(); await fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
