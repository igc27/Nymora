'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { P2PConsent } = require('../src/consent.cjs');
const { Playback } = require('../src/playback.cjs');
const { mergeMetadata, orderedCatalogs, catalogKey } = require('../src/ui-data.js');
test('P2P gate ignores forged source consent; Cancel saves nothing; acceptance persists before engine starts; reset restores notice', async () => {
  const events = [], store = { data: {}, save: () => events.push('save') };
  const gate = new P2PConsent({ store, show: notice => events.push(notice), dismiss: () => {} });
  const playback = new Playback({ media: { stop() {} }, torrents: { selected() {}, start: async () => { assert.equal(store.data.p2pNoticeAccepted, true); events.push('start'); return { p2p: true }; }, stop: async () => {} }, confirm: notice => gate.confirm(notice), cacheLimit: () => 1000 });
  const stream = { infoHash: 'a'.repeat(40), consent: true, p2pNoticeAccepted: true };
  let pending = playback.source(stream);
  assert.equal(events.length, 1); assert.throws(() => gate.answer({ nonce: 'forged', accepted: true }));
  gate.answer({ nonce: gate.pending.nonce, accepted: false }); assert.deepEqual(await pending, { cancelled: true }); assert.equal(store.data.p2pNoticeAccepted, undefined);
  pending = playback.source(stream); gate.answer({ nonce: gate.pending.nonce, accepted: true }); await pending;
  assert.deepEqual(events.slice(-2), ['save', 'start']); assert.throws(() => gate.answer({ nonce: events[0].nonce, accepted: true }));
  const count = events.filter(v => typeof v === 'object').length; await playback.source(stream); assert.equal(events.filter(v => typeof v === 'object').length, count);
  gate.reset(); pending = playback.source(stream); assert.ok(gate.pending); gate.cancel(); await playback.stop(); assert.deepEqual(await pending, { cancelled: true }); assert.equal(store.data.p2pNoticeAccepted, false);
});
test('P2P gate settles on cancellation and never accepts on storage failure', async () => {
  const store = { data: {}, save() { throw new Error('disk full'); } };
  const gate = new P2PConsent({ store, show() {}, dismiss() {} });
  const pending = gate.confirm({}); assert.throws(() => gate.answer({ nonce: gate.pending.nonce, accepted: true }), /disk full/); assert.equal(store.data.p2pNoticeAccepted, false); gate.cancel(); assert.deepEqual(await pending, { response: 0 });
});
test('Metadata merging preserves stable IDs, complete descriptions, episode IDs and rich nonempty fields', () => {
  const initial = { id: 'title:1', type: 'series', name: 'Title', description: 'A complete supplied description', poster: 'https://example.org/poster.jpg', videos: [{ id: 'opaque:ep:1', season: 9, title: 'One' }] };
  const merged = mergeMetadata(initial, [{ id: 'wrong', description: 'Must never overwrite another title' }, { id: initial.id, name: '', description: 'Short', poster: '', videos: [{ id: 'opaque:ep:1', title: '', thumbnail: 'https://example.org/1.jpg' }, { id: 'opaque:ep:2', title: 'Two' }], genres: ['Drama'] }]);
  assert.equal(merged.id, initial.id); assert.equal(merged.description, initial.description); assert.equal(merged.poster, initial.poster); assert.equal(merged.name, 'Title'); assert.equal(merged.videos[0].title, 'One'); assert.equal(merged.videos[0].season, 9); assert.deepEqual(merged.videos.map(v => v.id), ['opaque:ep:1', 'opaque:ep:2']);
});
test('Catalog display ordering is stable, independent of addon installation and contains no private transport URL', () => {
  const catalogs = [{ addonId: 'a', type: 'movie', id: 'top', transportUrl: 'https://example.org/private/token/manifest.json' }, { addonId: 'b', type: 'series', id: 'top' }, { addonId: 'c', type: 'movie', id: 'new' }];
  const ordered = orderedCatalogs(catalogs, { homeCatalogOrder: [catalogKey(catalogs[1])] }); assert.deepEqual(ordered.map(c => c.addonId), ['b', 'a', 'c']); assert.deepEqual(catalogs.map(c => c.addonId), ['a', 'b', 'c']); assert.ok(!catalogKey(catalogs[0]).includes('token'));
});
