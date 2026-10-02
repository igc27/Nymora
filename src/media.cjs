'use strict';
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { validURL, request } = require('./network.cjs');
function safeHeaders(value) {
  const headers = {};
  if (!value || typeof value !== 'object') return headers;
  for (const [key, item] of Object.entries(value)) {
    if (/^(user-agent|referer|origin|authorization|cookie|accept|accept-language)$/i.test(key) && typeof item === 'string' && item.length < 8192 && !/[\r\n]/.test(item)) headers[key] = item;
  }
  return headers;
}
async function createMediaProxy() {
  const sources = new Map();
  const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      const path = req.url.split('/');
      const source = sources.get(path[2]);
      if (path[1] !== 'media' || !source) { res.writeHead(404); res.end(); return; }
      const url = validURL(decodeURIComponent(path.slice(3).join('/')));
      const headers = { ...source.headers };
      if (new URL(url).origin !== source.origin) for (const key of Object.keys(headers)) if (/^(authorization|cookie)$/i.test(key)) delete headers[key];
      // Playback clients can request byte ranges, but cannot inject arbitrary headers.
      if (req.headers.range && /^bytes=\d*-\d*(,\d*-\d*)*$/.test(req.headers.range)) headers.Range = req.headers.range;
      const controller = new AbortController();
      req.on('aborted', () => controller.abort());
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      const upstream = await request(url, { headers, method: req.method, signal: controller.signal });
      const mime = upstream.headers.get('content-type') || '';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      if (/mpegurl/i.test(mime) || /\.m3u8(?:\?|$)/i.test(url)) {
        const body = await upstream.text();
        if (body.length > 4 * 1024 * 1024) throw new Error('HLS playlist too large.');
        const rewrite = uri => source.local(new URL(uri, url).href);
        const playlist = body.split('\n').map(line => line.startsWith('#') ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewrite(uri)}"`) : line.trim() ? rewrite(line.trim()) : line).join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.end(playlist); return;
      }
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const value = upstream.headers.get(key); if (value) res.setHeader(key, value); }
      res.writeHead(upstream.status);
      if (req.method === 'HEAD') res.end();
      else await pipeline(Readable.fromWeb(upstream.body), res);
    } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    source(stream) {
      if (!stream || !stream.url) throw new Error(stream?.infoHash ? 'Torrent sources require a streaming engine that is not included in Nymora 1.0.0. Choose an HTTP source.' : stream?.externalUrl ? 'This source opens an external service. Choose an in-app HTTP source.' : 'Unsupported stream. Choose a direct HTTP or HLS source.');
      const url = validURL(stream.url);
      const token = randomBytes(24).toString('hex');
      const local = remote => `http://127.0.0.1:${port}/media/${token}/${encodeURIComponent(validURL(remote))}`;
      sources.clear();
      sources.set(token, { headers: safeHeaders(stream.behaviorHints?.proxyHeaders?.request), local, origin: new URL(url).origin });
      return { url: local(url), hls: /\.m3u8(?:\?|$)/i.test(url) || /mpegurl/i.test(stream.mimeType || ''), token };
    },
    stop() { sources.clear(); },
    close() { server.closeAllConnections(); server.close(); }
  };
}
module.exports = { createMediaProxy, safeHeaders };
