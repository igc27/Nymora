'use strict';
// Safe endpoints only, isolated profile, no installed addon configuration read.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
async function main() {
  const directory = path.resolve(`.qa/network-${Date.now()}`); fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, NYMORA_DATA_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.NYMORA_TEST_EXE || require('electron'), args: process.env.NYMORA_TEST_EXE ? [] : [path.resolve('.')], env });
  const proxy = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"streams":[]}'); });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  try {
    await app.firstWindow();
    const evidence = await app.evaluate(async ({ app, net, session }, { port, directory }) => {
      const dns = process.getBuiltinModule('node:dns').promises, https = process.getBuiltinModule('node:https'), dc = process.getBuiltinModule('node:diagnostics_channel');
      const result = { appVersion: app.getVersion(), installed: app.isPackaged, node: process.versions.node, chromium: process.versions.chrome, public: [], controlledProxy: [] };
      const safeURL = 'https://v3-cinemeta.strem.io/manifest.json';
      const proxyRule = await session.defaultSession.resolveProxy(safeURL);
      result.systemProxy = proxyRule === 'DIRECT' ? 'DIRECT' : 'PROXY_CONFIGURED';
      async function timing(fn) { const start = performance.now(); try { const value = await fn(); return { ms: Math.round(performance.now() - start), value }; } catch (e) { return { ms: Math.round(performance.now() - start), code: e.cause?.code || e.code || e.name }; } }
      result.dns = { node: await timing(async () => (await dns.lookup('v3-cinemeta.strem.io', { all: true })).map(a => a.family)), chromium: await timing(async () => (await net.resolveHost('v3-cinemeta.strem.io')).endpoints.map(e => e.address.includes(':') ? 6 : 4)) };
      async function probe(label, fetcher, url) {
        const start = performance.now(); let headersMs;
        try { const response = await fetcher(url, { signal: AbortSignal.timeout(20000), redirect: 'follow', credentials: 'omit' }); headersMs = Math.round(performance.now() - start); const body = await response.json(); return { stack: label, status: response.status, headersMs, totalMs: Math.round(performance.now() - start), validJSON: !!body && typeof body === 'object' }; }
        catch (e) { return { stack: label, headersMs, totalMs: Math.round(performance.now() - start), code: e.cause?.code || e.code || e.name }; }
      }
      const connectTimings = []; let connectStart;
      const before = () => { connectStart = performance.now(); }, connected = () => { if (connectStart) connectTimings.push(Math.round(performance.now() - connectStart)); };
      dc.channel('undici:client:beforeConnect').subscribe(before); dc.channel('undici:client:connected').subscribe(connected);
      result.public.push(await probe('Node fetch', fetch, safeURL));
      dc.channel('undici:client:beforeConnect').unsubscribe(before); dc.channel('undici:client:connected').unsubscribe(connected);
      result.nodeConnectIncludingTLSMs = connectTimings;
      await session.defaultSession.netLog.startLogging(process.getBuiltinModule('node:path').join(directory, 'safe-chromium-netlog.json'));
      result.public.push(await probe('Electron net.fetch', net.fetch, safeURL));
      result.public.push(await probe('Electron net.fetch reused connection', net.fetch, safeURL));
      await session.defaultSession.netLog.stopLogging();
      result.nodeHTTPS = await new Promise(resolve => {
        const start = performance.now(), phases = {};
        const request = https.get(safeURL, response => { phases.headersMs = Math.round(performance.now() - start); phases.status = response.statusCode; response.resume(); response.on('end', () => resolve(phases)); });
        request.on('socket', socket => { socket.on('lookup', () => { phases.dnsMs = Math.round(performance.now() - start); }); socket.on('connect', () => { phases.connectMs = Math.round(performance.now() - start); }); socket.on('secureConnect', () => { phases.tlsMs = Math.round(performance.now() - start); phases.tlsAuthorized = socket.authorized; }); });
        request.setTimeout(20000, () => request.destroy(Object.assign(new Error('Deadline'), { code: 'TIMEOUT' })));
        request.on('error', e => resolve({ ...phases, code: e.code, totalMs: Math.round(performance.now() - start) }));
      });
      // Reproduce an OS/browser proxy route raw Node fetch cannot use. No VPN,
      // system configuration or user session is changed by this isolated test.
      await session.defaultSession.setProxy({ proxyRules: `http=127.0.0.1:${port}`, proxyBypassRules: '<-loopback>' });
      const controlled = 'http://nymora-transport-test.invalid/configured/path/stream/movie/nymora%3Atest.json';
      result.controlledProxy.push(await probe('Node fetch', fetch, controlled));
      result.controlledProxy.push(await probe('Electron net.fetch', net.fetch, controlled));
      await session.defaultSession.setProxy({ mode: 'system' });
      return result;
    }, { port: proxy.address().port, directory });
    const log = JSON.parse(fs.readFileSync(path.join(directory, 'safe-chromium-netlog.json')));
    const names = Object.fromEntries(Object.entries(log.constants.logEventTypes).map(([key, value]) => [value, key]));
    const starts = new Map(); evidence.chromiumPhases = [];
    for (const e of log.events) { const name = names[e.type]; if (!/^(TCP_CONNECT|SSL_CONNECT|HOST_RESOLVER_MANAGER_REQUEST|HTTP_TRANSACTION_READ_HEADERS|URL_REQUEST_REDIRECTED)$/.test(name)) continue; const key = `${e.source.id}:${name}`; if (e.phase === 1) starts.set(key, Number(e.time)); else if (e.phase === 2 && starts.has(key)) evidence.chromiumPhases.push({ phase: name, ms: Number(e.time) - starts.get(key), code: e.params?.net_error ?? 0 }); else if (name === 'URL_REQUEST_REDIRECTED') evidence.chromiumPhases.push({ phase: name }); }
    fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2)); console.log(`Evidence: ${directory}`);
  } finally { await app.close(); proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
