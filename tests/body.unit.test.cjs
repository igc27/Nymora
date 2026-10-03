'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startBodyFixture } = require('./body-fixture.cjs');
const { json, configureTransport } = require('../src/network.cjs');
test('Web body reader handles framing, compression, BOM, delayed chunks, redirects and persistent connections', async () => {
  const fixture = await startBodyFixture({ firstChunkDelayMs: 90, chunkDelayMs: 15 });
  try {
    for (const mode of fixture.modes) {
      const updates = [];
      const result = await json(`${fixture.base}/${mode}/stream/movie/id.json`, { responseTimeoutMs: 70, idleTimeoutMs: 150, onDiagnostic: d => updates.push(d) });
      assert.equal(result.streams.length, 1, mode);
      assert.equal(updates.at(-1).stage, 'complete');
      assert.equal(updates.at(-1).status, 200);
      assert.ok(updates.at(-1).bytesRead > 0);
      if (mode === 'delayed') assert.ok(updates.at(-1).bodyElapsedMs >= 80);
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(updates.at(-1).code, null);
    }
  } finally { await fixture.close(); }
});
test('Header and body idle/overall failures have fresh, consistent diagnostics; errors do not poison later requests', async () => {
  const fixture = await startBodyFixture({ firstChunkDelayMs: 100 });
  try {
    for (const [mode, code, options] of [
      ['header-stall', 'HEADER_TIMEOUT', { responseTimeoutMs: 40 }],
      ['stall', 'BODY_TIMEOUT', { idleTimeoutMs: 60, overallTimeoutMs: 200 }],
      ['stall', 'BODY_TIMEOUT', { idleTimeoutMs: 200, overallTimeoutMs: 60 }],
      ['invalid', 'INVALID_JSON', {}], ['truncated', 'TRUNCATED_RESPONSE', {}], ['large', 'RESPONSE_TOO_LARGE', {}]
    ]) {
      const updates = []; const started = performance.now();
      await assert.rejects(json(`${fixture.base}/${mode}/stream/movie/id.json`, { ...options, onDiagnostic: d => updates.push(d) }), e => e.code === code);
      const last = updates.at(-1);
      assert.equal(last.code, code);
      assert.ok(Math.abs(last.elapsedMs - (performance.now() - started)) < 40);
      if (mode !== 'header-stall') { assert.equal(last.status, 200); assert.ok(last.bodyElapsedMs !== null); }
      if (code === 'BODY_TIMEOUT') { assert.ok(last.bodyElapsedMs >= 55); assert.ok(last.elapsedMs > last.headersMs); assert.equal(last.timeoutKind, options.idleTimeoutMs === 60 ? 'idle' : 'overall'); }
      assert.equal((await json(`${fixture.base}/length/stream/movie/id.json`)).streams.length, 1);
    }
    const controller = new AbortController();
    const pending = json(`${fixture.base}/stall/stream/movie/id.json`, { signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    await assert.rejects(pending, e => e.code === 'CANCELLED');
    assert.equal((await json(`${fixture.base}/keep-alive/stream/movie/id.json`)).streams.length, 1);
  } finally { await fixture.close(); }
});
test('Body deadline starts after headers, idle resets with bytes, EOF clears all timers, and read failures are distinct', async () => {
  let cancelCount = 0;
  configureTransport(async () => {
    await new Promise(resolve => setTimeout(resolve, 350));
    const parts = ['{"streams":', '[', ']', '}'];
    return new Response(new ReadableStream({
      async pull(controller) { await new Promise(resolve => setTimeout(resolve, 30)); if (parts.length) controller.enqueue(new TextEncoder().encode(parts.shift())); else controller.close(); },
      cancel() { cancelCount++; }
    }));
  });
  try {
    const updates = [];
    assert.deepEqual(await json('https://synthetic.example/test', { responseTimeoutMs: 600, idleTimeoutMs: 200, overallTimeoutMs: 400, onDiagnostic: d => updates.push(d) }), { streams: [] });
    assert.ok(updates.at(-1).elapsedMs > 400);
    await new Promise(resolve => setTimeout(resolve, 450));
    assert.equal(updates.at(-1).stage, 'complete'); assert.equal(cancelCount, 0);
    configureTransport(async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('synthetic transport failure')); } })));
    await assert.rejects(json('https://synthetic.example/test'), e => e.code === 'STREAM_READ_FAILURE');
  } finally { configureTransport((...args) => fetch(...args)); }
});
