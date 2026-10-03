'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { aggregate } = require('../src/addons.cjs');
const { json, boundedText, validURL } = require('../src/network.cjs');
const { classify, playableResults } = require('../src/stream-classification.cjs');
const { manifest } = require('./fixture.cjs');
async function fixture(handler) {
  const server = http.createServer(handler); await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); } };
}
test('Valid HTTP/HLS and normalized P2P are playable; AIO notices, external actions and invalid hashes are not', () => {
  for (const s of [{ url: 'https://video.example/live.m3u8' }, { url: 'http://video.example/file.mp4' }]) assert.equal(classify(s), 'http');
  for (const s of [{ infoHash: 'a'.repeat(40), fileIdx: 5 }, { magnet: `magnet:?xt=urn:btih:${'b'.repeat(40)}` }]) assert.equal(classify(s), 'p2p');
  const bad = [{ name: '🚫 Removal Reasons', description: '📌 Disabled Stream Types (16)', externalUrl: 'https://github.com/Viren070/AIOStreams', streamData: { type: 'statistic' } }, { name: 'Excluded Resolution', url: 'https://video.example/placeholder.mp4' }, { name: 'Disabled Stream Types' }, { externalUrl: 'https://external.example/action' }, { infoHash: 'invalid' }, { magnet: `magnet:?xt=urn:btmh:1220${'b'.repeat(64)}` }, { url: 'file:///private.mp4' }];
  for (const stream of bad) assert.ok(!['http', 'p2p'].includes(classify(stream)));
  const result = playableResults({ items: [...bad, { url: 'https://video.example/video.mp4' }], errors: [] });
  assert.equal(result.items.length, 1); assert.ok(result.notices.length);
});
test('Configured paths survive all resource URLs; redirect compression and response limits remain bounded', async () => {
  const longConfiguredURL = `https://addon.example/${'synthetic'.repeat(2048)}/manifest.json`;
  assert.equal(validURL(longConfiguredURL, true), longConfiguredURL);
  const paths = [], prefix = '/private-test-config%2Fwith%20spaces';
  const f = await fixture((req, res) => {
    paths.push(req.url);
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/gzip' }); res.end(); }
    else if (req.url === '/gzip') { res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync('{"streams":[]}')); }
    else if (req.url === '/large') res.end('a'.repeat(1000));
    else { const resource = req.url.slice(prefix.length).split('/')[1]; res.end(JSON.stringify({ [resource === 'meta' ? 'meta' : resource === 'catalog' ? 'metas' : resource === 'stream' ? 'streams' : 'subtitles']: resource === 'meta' ? { id: 'nymora:series' } : [] })); }
  });
  try {
    const descriptor = { manifest, transportUrl: `${f.base}${prefix}/manifest.json` };
    for (const resource of ['catalog', 'meta', 'stream', 'subtitles']) await aggregate([descriptor], resource, 'series', resource === 'catalog' ? 'test-series' : 'nymora:series:2:1', { filename: 'اسم.mp4' });
    assert.equal(paths.length, 4); for (const url of paths) assert.ok(url.startsWith(`${prefix}/`));
    assert.deepEqual(await json(`${f.base}/redirect`), { streams: [] });
    await assert.rejects(boundedText(`${f.base}/large`, 100), e => e.code === 'RESPONSE_TOO_LARGE');
  } finally { await f.close(); }
});
test('Fast providers publish seven sources before the independent stalled provider times out', async () => {
  const f = await fixture((req, res) => {
    if (req.url.startsWith('/slow/')) return;
    const count = req.url.startsWith('/five/') ? 5 : 2;
    res.end(JSON.stringify({ streams: Array.from({ length: count }, (_, i) => ({ url: `https://video.example/${i}.mp4` })) }));
  });
  try {
    const descriptors = ['slow', 'five', 'two'].map(name => ({ manifest: { ...manifest, name, resources: ['stream'] }, transportUrl: `${f.base}/${name}/manifest.json` }));
    const updates = []; const result = await aggregate(descriptors, 'stream', 'movie', 'nymora:motion', {}, { network: { responseTimeoutMs: 150 }, onUpdate: value => updates.push(value) });
    assert.ok(updates.some(value => value.items.length === 7 && value.pending === 1 && !value.errors.length));
    assert.equal(result.items.length, 7); assert.deepEqual(result.errors, ['slow did not respond.']);
  } finally { await f.close(); }
});
test('Body stalls time out; caller cancellation cannot disable deadlines or leak private URLs', async () => {
  const f = await fixture((_req, res) => { res.writeHead(200); res.write('{'); });
  try {
    const controller = new AbortController();
    await assert.rejects(json(`${f.base}/private-test-token`, { signal: controller.signal, idleTimeoutMs: 30 }), e => e.code === 'BODY_TIMEOUT' && !e.message.includes('private-test-token'));
    controller.abort();
    await assert.rejects(json(`${f.base}/private-test-token`, { signal: controller.signal }), e => e.code === 'CANCELLED');
  } finally { await f.close(); }
});
