'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validURL, json } = require('../src/network.cjs');
const addons = require('../src/addons.cjs');
const { Store } = require('../src/store.cjs');
const { parseSubtitles } = require('../src/subtitles.cjs');
const { createMediaProxy, safeHeaders } = require('../src/media.cjs');
const { startFixture, manifest } = require('./fixture.cjs');
test('URLs reject shell, file and embedded credentials; manifest paths preserve configured prefixes', () => {
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'https://user:secret@example.com/manifest.json', 'https://example.com/foo', 'https://example.com/manifest.json?key=x']) assert.throws(() => validURL(url, true));
  assert.equal(validURL('https://example.com/configured/manifest.json', true), 'https://example.com/configured/manifest.json');
  assert.equal(validURL('stremio://example.com/manifest.json', true), 'https://example.com/manifest.json');
});
test('manifests validate mandatory fields and malformed filter objects', () => {
  assert.equal(addons.validateManifest(manifest), manifest);
  assert.throws(() => addons.validateManifest({ name: 'broken' }));
  assert.throws(() => addons.validateManifest({ ...manifest, resources: [{ name: 'stream', types: 'movie' }] }));
});
test('upstream resource matching honors prefixes and inherits missing per-resource types', () => {
  const addon = addons.client({ manifest, transportUrl: 'https://example.com/manifest.json' });
  assert.equal(addon.isSupported('subtitles', 'series', 'nymora:series:2:1'), true);
  assert.equal(addon.isSupported('stream', 'movie', 'unrelated:1'), false);
  assert.equal(addon.isSupported('catalog', 'series', 'test-series'), true);
});
test('actual HTTP addon install, search, pagination, episodes, streams and subtitles', async () => {
  const f = await startFixture();
  try {
    const descriptor = await addons.install(`${f.base}/manifest.json`);
    assert.equal(descriptor.manifest.id, manifest.id);
    assert.equal((await addons.search([descriptor], 'Nymora')).items.length, 2);
    assert.equal((await addons.catalog([descriptor], { transportUrl: descriptor.transportUrl, type: 'movie', id: 'test-movie', extra: { skip: 1 } })).length, 0);
    const meta = await addons.aggregate([descriptor], 'meta', 'series', 'nymora:series');
    assert.equal(meta.items[0].videos[1].id, 'nymora:series:2:1');
    const streams = await addons.aggregate([descriptor], 'stream', 'series', 'nymora:series:2:1');
    assert.equal(streams.items.length, 3);
    assert.ok(f.requests.some(url => url.includes('nymora%3Aseries%3A2%3A1')));
    const subtitles = await addons.aggregate([descriptor], 'subtitles', 'series', 'nymora:series:2:1', { filename: 'Unicode اسم.mp4', videoID: 'nymora:series:2:1' });
    assert.equal(subtitles.items[1].lang, 'ara');
    assert.ok(f.requests.some(url => url.includes('filename=Unicode%20%D8')));
    await assert.rejects(addons.install(`${f.base}/invalid/manifest.json`), /Invalid addon/);
  } finally { await f.close(); }
});
test('one failed addon does not hide sources from another addon', async () => {
  const f = await startFixture();
  try {
    const good = await addons.install(`${f.base}/manifest.json`), broken = await addons.install(`${f.base}/broken/manifest.json`);
    const result = await addons.aggregate([good, broken], 'stream', 'movie', 'nymora:motion');
    assert.equal(result.items.length, 3); assert.match(result.errors[0], /503/);
    await assert.rejects(json(`${f.base}/missing`), /404/);
  } finally { await f.close(); }
});
test('UTF-8 Arabic SRT, English VTT, ASS timing and markup sanitization', () => {
  const arabic = 'مرحباً بكم — الترجمة العربية';
  assert.equal(parseSubtitles(`1\r\n00:00:01,000 --> 00:00:03,500\r\n${arabic}\r\n`)[0].text, arabic);
  assert.equal(parseSubtitles('WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<b>Hello</b> &amp; goodbye')[0].end, 2);
  assert.equal(parseSubtitles('[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\\b1}مرحبا\\NHello, world')[0].text, 'مرحبا\nHello, world');
  assert.throws(() => parseSubtitles('not a subtitle'), /No readable/);
});
test('progress, addon, preferences and library survive a new Store instance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nymora-unit-'));
  const store = new Store(dir);
  store.data.addons = [{ manifest, transportUrl: 'https://example.com/manifest.json' }];
  store.data.library = [{ id: 'test', type: 'series', name: 'Test' }]; store.data.settings.subtitleLanguage = 'ara';
  store.progress({ id: 'test:1:2', mediaId: 'test', type: 'series', position: 33, duration: 90, name: 'Test' });
  const restored = new Store(dir);
  assert.equal(restored.data.progress['series:test:1:2'].position, 33);
  assert.equal(restored.data.progress['series:test:1:2'].watched, false);
  assert.equal(restored.data.settings.subtitleLanguage, 'ara'); assert.equal(restored.data.addons.length, 1); assert.equal(restored.data.library.length, 1);
  restored.progress({ id: 'test:1:2', mediaId: 'test', type: 'series', position: 88, duration: 90 });
  assert.equal(restored.data.progress['series:test:1:2'].watched, true);
});
test('corrupt storage preserves a recovery copy and returns a visible warning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nymora-corrupt-'));
  fs.writeFileSync(path.join(dir, 'nymora.json'), '{broken'); const store = new Store(dir);
  assert.match(store.warning, /recovery/); assert.ok(fs.readdirSync(dir).some(name => name.includes('.recovery-')));
});
test('media proxy forwards byte ranges and supports HLS rewriting without CORS dependence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nymora-media-'));
  fs.writeFileSync(path.join(dir, 'test.webm'), Buffer.from('0123456789'));
  fs.writeFileSync(path.join(dir, 'test.m3u8'), '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nsegment.ts\n');
  const f = await startFixture(dir), proxy = await createMediaProxy();
  try {
    const source = proxy.source({ url: `${f.base}/media/test.webm` });
    const response = await fetch(source.url, { headers: { Range: 'bytes=2-5' } });
    assert.equal(response.status, 206); assert.equal(await response.text(), '2345');
    const hls = proxy.source({ url: `${f.base}/media/test.m3u8` });
    const body = await (await fetch(hls.url)).text(); assert.match(body, /http:\/\/127\.0\.0\.1:/); assert.match(body, /key\.bin/); assert.equal(hls.hls, true);
    assert.throws(() => proxy.source({ infoHash: 'abc' }), /Torrent/);
    assert.equal(Object.keys(safeHeaders({ Host: 'evil', Authorization: 'Bearer example', Referer: 'bad\r\nInjected: yes' })).length, 1);
  } finally { proxy.close(); await f.close(); }
});
