'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const movie = { id: 'nymora:motion', type: 'movie', name: 'Nymora Motion Study', releaseInfo: '2026', runtime: '90 seconds', genres: ['Test media'], description: 'Developer-generated color, motion and tone study for legal playback testing. This is test media, not a commercial movie.' };
const series = { id: 'nymora:series', type: 'series', name: 'Nymora Test Series', releaseInfo: '2026', description: 'Two developer-controlled test episodes. Both use the original generated motion study.', videos: [{ id: 'nymora:series:1:1', season: 1, episode: 1, title: 'First Motion' }, { id: 'nymora:series:2:1', season: 2, episode: 1, title: 'Second Motion' }] };
const manifest = { id: 'org.nymora.legal-test', name: 'Nymora legal test addon', version: '1.0.0', description: 'Developer-controlled addon providing only generated test media and original English/Arabic subtitle cues.', types: ['movie', 'series'], idPrefixes: ['nymora:'], resources: ['catalog', 'meta', { name: 'stream', types: ['movie', 'series'], idPrefixes: ['nymora:'] }, { name: 'subtitles' }], catalogs: ['movie', 'series'].map(type => ({ type, id: `test-${type}`, name: 'Motion studies', extra: [{ name: 'search', isRequired: false }, { name: 'skip' }, { name: 'genre', options: ['Test media'], isRequired: false }] })), behaviorHints: { configurable: true } };
async function startFixture(directory = path.resolve('.qa/media'), options = {}) {
  const requests = []; let base;
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Access-Control-Allow-Origin', '*');
    function send(value) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/manifest.json') return send(manifest);
    if (url.pathname === '/invalid/manifest.json') return send({ name: 'Invalid addon' });
    if (url.pathname === '/broken/manifest.json') return send({ ...manifest, id: 'org.nymora.offline', name: 'Offline test addon', resources: ['stream'], catalogs: [] });
    if (url.pathname.startsWith('/broken/')) { res.writeHead(503); res.end(); return; }
    if (url.pathname === '/configure') { res.end('This developer test addon has no required configuration.'); return; }
    if (url.pathname.startsWith('/subtitle/')) {
      const ar = url.pathname.includes('ara');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`1\n00:00:00,000 --> 00:00:20,000\n${ar ? 'مرحباً بكم في نيمورا — اختبار الترجمة العربية' : 'Welcome to Nymora — English subtitle test'}\n\n2\n00:00:20,000 --> 00:01:30,000\n${ar ? 'هذه ترجمة عربية أصلية لاختبار الفيديو.' : 'Original subtitles for developer-generated video.'}\n`); return;
    }
    if (url.pathname.startsWith('/media/')) {
      const relative = decodeURIComponent(url.pathname.slice(7));
      if (!/^[\w.-]+$/.test(relative)) { res.writeHead(400); res.end(); return; }
      const file = path.join(directory, relative);
      if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      const size = fs.statSync(file).size;
      const types = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');
      const match = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (match) {
        const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (start >= size) { res.writeHead(416); res.end(); return; }
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else { res.setHeader('Content-Length', size); fs.createReadStream(file).pipe(res); }
      return;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const splitAddon = { 'catalog-addon': { id: 'catalog', resources: ['catalog', 'meta'] }, 'stream-addon': { id: 'stream', resources: ['stream'] }, 'subtitle-addon': { id: 'subtitle', resources: ['subtitles'] } }[parts[0]];
    if (splitAddon) {
      parts.shift();
      if (parts[0] === 'manifest.json') return send({ ...manifest, id: `org.nymora.legal-${splitAddon.id}`, name: `Nymora legal ${splitAddon.id} addon`, resources: splitAddon.resources, catalogs: splitAddon.id === 'catalog' ? manifest.catalogs : undefined });
      if (!splitAddon.resources.includes(parts[0])) { res.writeHead(404); res.end(); return; }
    }
    const resource = parts[0], type = parts[1], id = decodeURIComponent((parts[2] || '').replace(/\.json$/, ''));
    const extra = new URLSearchParams(decodeURIComponent((parts[3] || '').replace(/\.json$/, '')));
    if (resource === 'catalog') {
      const item = type === 'series' ? series : movie;
      return send({ metas: Number(extra.get('skip') || 0) > 0 || (extra.get('search') && !item.name.toLowerCase().includes(extra.get('search').toLowerCase())) ? [] : [item] });
    }
    if (resource === 'meta') return send({ meta: id === movie.id ? movie : id === series.id ? series : null });
    if (resource === 'stream' && options.streams) return send({ streams: options.streams });
    if (resource === 'stream') return send({ streams: [{ name: 'Generated MP4 · H.264 / AAC', title: 'Original 640 × 360 legal test video', url: `${base}/media/test.mp4`, behaviorHints: { filename: 'Nymora-Motion-Study.mp4', videoSize: fs.existsSync(path.join(directory, 'test.mp4')) ? fs.statSync(path.join(directory, 'test.mp4')).size : 0 } }, { name: 'Generated WebM · VP8 / Vorbis', url: `${base}/media/test.webm` }, { name: 'Generated HLS · H.264 / AAC', url: `${base}/media/test.m3u8` }] });
    if (resource === 'subtitles') return send({ subtitles: ['eng', 'ara'].map(lang => ({ id: `original-${lang}`, lang, label: lang === 'eng' ? 'English · original test' : 'Arabic · العربية · original test', url: `${base}/subtitle/${lang}.srt` })) });
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, manifest, movie, series, requests, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
if (require.main === module) startFixture().then(f => console.log(`Legal developer test addon: ${f.base}/manifest.json`));
module.exports = { startFixture, manifest, movie, series };
