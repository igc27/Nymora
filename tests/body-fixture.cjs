'use strict';
const http = require('node:http');
const zlib = require('node:zlib');
const { manifest, movie, series } = require('./fixture.cjs');
const MODES = ['length', 'chunked', 'gzip', 'br', 'delayed', 'keep-alive', 'redirect', 'bom'];
async function startBodyFixture({ firstChunkDelayMs = 21000, chunkDelayMs = 40 } = {}) {
  const timers = new Set(), requests = []; let base;
  const later = (fn, ms) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); return timer; };
  const server = http.createServer((req, res) => {
    const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
    const mode = parts[0], resource = parts[1]; requests.push({ mode, resource, type: parts[2], id: parts[3] });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    let value;
    if (resource === 'manifest.json') value = { ...manifest, id: `org.nymora.body.${mode === 'redirect-gzip' ? 'redirect' : mode}`, name: `Body ${mode} addon` };
    else if (resource === 'catalog') value = { metas: [parts[2] === 'series' ? series : movie] };
    else if (resource === 'meta') value = { meta: parts[2] === 'series' ? series : movie };
    else if (resource === 'subtitles') value = { subtitles: [] };
    else value = { streams: [{ name: `Body ${mode} playable`, url: `${base}/media/test.mp4` }], padding: 'development QA ✓ العربية'.repeat(mode === 'gzip' || mode === 'br' ? 1000 : 1) };
    const body = Buffer.from(JSON.stringify(value));
    if (mode === 'redirect-auth') { res.writeHead(302, { Location: `${base.replace('127.0.0.1', 'localhost')}/auth/stream/movie/id.json` }); res.end(); return; }
    if (mode === 'auth') { res.end(JSON.stringify({ authorization: !!req.headers.authorization, cookie: !!req.headers.cookie })); return; }
    if (mode === 'redirect') { res.writeHead(302, { Location: req.url.replace('/redirect/', '/redirect-gzip/') }); res.write('Redirect body that never ends'); return; }
    if (mode === 'redirect-loop') { res.writeHead(302, { Location: req.url }); res.end(); return; }
    if (mode === 'invalid') { res.end('{invalid JSON}'); return; }
    if (mode === 'truncated') { res.setHeader('Content-Length', body.length + 100); res.write(body.subarray(0, 20)); res.flushHeaders(); later(() => res.destroy(), 30); return; }
    if (mode === 'large') { res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(Buffer.from(JSON.stringify({ padding: 'x'.repeat(8 * 1024 * 1024) })))); return; }
    if (mode === 'stall' && resource === 'stream') { res.write('{'); return; }
    if (mode === 'header-stall') return;
    if (mode === 'length') { res.setHeader('Content-Length', body.length); res.end(body); return; }
    if (mode === 'bom') { res.end(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body])); return; }
    if (mode === 'gzip' || mode === 'redirect-gzip') { res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(body)); return; }
    if (mode === 'br') { res.setHeader('Content-Encoding', 'br'); res.end(zlib.brotliCompressSync(body)); return; }
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();
    if (mode === 'delayed' && resource === 'stream') { later(() => { if (!res.destroyed) res.end(body); }, firstChunkDelayMs); return; }
    let offset = 0;
    const chunk = () => { if (res.destroyed) return; const end = Math.min(body.length, offset + Math.ceil(body.length / 3)); res.write(body.subarray(offset, end)); offset = end; if (offset === body.length) res.end(); else later(chunk, chunkDelayMs); };
    chunk();
  });
  server.keepAliveTimeout = 60000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  return { base, modes: MODES, requests, close: async () => { for (const timer of timers) clearTimeout(timer); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
module.exports = { startBodyFixture };
if (require.main === module) startBodyFixture().then(f => console.log(`Development body fixture: ${f.base}/{length,chunked,gzip,br,delayed,keep-alive,redirect,bom}/manifest.json`));
