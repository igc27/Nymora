'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { NativeTorrentCache } = require('../src/native-torrent-cache.cjs');
const { TorrentHelper } = require('../src/torrent-helper.cjs');
const { TorrentEngine } = require('../src/torrent-engine.cjs');
const { clock, runtime, languageMatches } = require('../src/ui-data.js');
const { Store } = require('../src/store.cjs');
test('Player clocks cross the hour boundary; metadata durations and language aliases stay useful', () => {
  assert.equal(clock(3697), '1:01:37'); assert.equal(clock(45), '0:45'); assert.equal(clock(-1), '0:00');
  assert.equal(runtime('61 minutes'), '1h 1m'); assert.equal(runtime('103 min'), '1h 43m'); assert.equal(runtime('PT1H43M'), '1h 43m'); assert.equal(runtime('unprovided'), 'unprovided');
  assert.equal(languageMatches('ara', 'ar-SA'), true); assert.equal(languageMatches('eng', 'en'), true); assert.equal(languageMatches('', ''), false);
});
test('Patient helper waiting has no timer and cancellation settles it without leaking a receiver', async () => {
  const helper = new TorrentHelper(); let settled = false;
  const result = helper.wait('metadata', 0).then(value => { settled = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(settled, false);
  helper.emit('message', { event: 'metadata', bytes: 'original' }); assert.equal((await result).bytes, 'original'); assert.equal(helper.listenerCount('message'), 0);
  const cancelled = assert.rejects(helper.wait('metadata', 0), /cancelled/); await helper.close(); await cancelled; assert.equal(helper.pending.size, 0);
  await assert.rejects(helper.wait('metadata', 10), /timeout/);
});
test('Patient policy overrides old short deadlines and retries transient metadata exchange with low peer counts', async () => {
  const engine = new TorrentEngine({ cacheDirectory: path.join(os.tmpdir(), 'nymora-policy-unused'), metadataTimeout: 20 });
  engine.waitPolicy = () => 'patient'; assert.equal(engine.waitLimit(), 0); engine.waitPolicy = () => '5m'; assert.equal(engine.waitLimit(), 300000); engine.waitPolicy = () => '10m'; assert.equal(engine.waitLimit(), 600000); engine.waitPolicy = () => 'none'; assert.equal(engine.waitLimit(), 0);
  engine.availabilityLimit = 0; engine.startedAt = Date.now(); engine.state.peers = 0; engine.helper.child = {}; let attempts = 0;
  engine.helper.resolve = async (_source, timeout) => { assert.equal(timeout, 0); if (++attempts === 1) throw Object.assign(new Error('Transient peer exchange failure'), { code: 'METADATA_EXCHANGE_FAILED' }); return { bytes: 'supplied by peer' }; };
  assert.equal((await engine.resolvePatiently({}, engine.generation)).bytes, 'supplied by peer'); assert.equal(attempts, 2);
  engine.helper.resolve = async () => { throw Object.assign(new Error('retry'), { code: 'METADATA_EXCHANGE_FAILED' }); };
  engine.helper.close = async () => { engine.helper.child = null; };
  const waiting = assert.rejects(engine.resolvePatiently({}, engine.generation), /cancelled/); await new Promise(resolve => setTimeout(resolve, 20)); await engine.stop(); await waiting;
});
test('Native cache evicts oldest inactive data, reserves active space, and preserves unrelated files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nymora-lru-')), cache = new NativeTorrentCache(path.join(root, 'owned'));
  function session(bytes, age) { const dir = cache.createSession(); cache.register([{ path: 'video.mp4' }]); fs.writeFileSync(path.join(dir, 'video.mp4'), Buffer.alloc(bytes)); cache.release(); fs.utimesSync(path.join(dir, '.nymora-session'), new Date(age), new Date(age)); return dir; }
  const oldest = session(20, 1000), newer = session(20, 2000); fs.writeFileSync(path.join(oldest, 'personal.txt'), 'keep');
  const active = cache.createSession(); cache.register([{ path: 'video.mp4' }]); fs.writeFileSync(path.join(active, 'video.mp4'), Buffer.alloc(10));
  cache.enforce(35, 10); assert.equal(fs.existsSync(path.join(oldest, 'video.mp4')), false); assert.equal(fs.existsSync(path.join(newer, 'video.mp4')), true); assert.equal(cache.size(), 30);
  assert.equal(cache.clearInactive(), 20); assert.equal(fs.statSync(path.join(active, 'video.mp4')).size, 10); assert.equal(fs.readFileSync(path.join(oldest, 'personal.txt'), 'utf8'), 'keep');
  cache.release(); cache.enforce(5); assert.equal(cache.size(), 0);
});
test('New preferences and histories migrate without losing addons, watchlist or progress', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nymora-prefs-')); const store = new Store(dir);
  store.data.settings.subtitleAppearance = 'box'; store.data.settings.posterStyle = 'landscape'; store.data.settings.p2pWaitMode = '10m'; store.data.searchHistory = ['Original test']; store.data.dismissedContinuing = ['movie:test']; store.progress({ id: 'test', mediaId: 'test', type: 'movie', position: 40, duration: 90 });
  const reopened = new Store(dir); assert.equal(reopened.data.progress['movie:test'].position, 40); assert.equal(reopened.data.settings.subtitleAppearance, 'box'); assert.equal(reopened.data.settings.p2pWaitMode, '10m'); assert.deepEqual(reopened.data.searchHistory, ['Original test']); assert.deepEqual(reopened.data.dismissedContinuing, ['movie:test']);
});
