'use strict';
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { NativeTorrentCache } = require('./native-torrent-cache.cjs');
const { DEFAULT_LIMIT } = require('./torrent-cache.cjs');
const { TorrentHelper } = require('./torrent-helper.cjs');
const { diagnostics } = require('./p2p-diagnostics.cjs');
const { selectFile } = require('./torrent-source.cjs');
const { range } = require('./torrent-range.cjs');
const ERRORS = {
  ENGINE_STARTUP_FAILURE: 'The bundled P2P engine could not start.', ENGINE_CRASH: 'The P2P engine stopped unexpectedly. Select the source again to retry.',
  NO_PEERS: 'No peers were found for this torrent.', TRACKER_UNREACHABLE: 'Trackers could not be reached and no peers were found.', DHT_UNAVAILABLE: 'DHT is unavailable and no peers were found.',
  METADATA_TIMEOUT: 'Peers were found, but torrent metadata exchange timed out.', METADATA_FAILURE: 'Torrent metadata exchange failed.', INVALID_METADATA: 'Torrent metadata exceeds the supported safety limits.',
  INVALID_FILE_INDEX: 'The requested file index is not present.', MISSING_FILE: 'The requested filename is not present.', NO_VIDEO: 'No playable video file was found.',
  CACHE_LIMIT: 'Selected video exceeds the torrent cache limit. Choose a smaller file or increase the limit in Settings.', BUFFER_TIMEOUT: 'Peers did not supply enough video data to start playback.', NETWORK_BLOCKED: 'The network refused or blocked the P2P connection.'
};
class TorrentEngine {
  constructor({ cacheDirectory, helperPath, localOnly = false, metadataTimeout = 90000, bufferingTimeout = 60000 }) {
    this.cache = new NativeTorrentCache(cacheDirectory); this.helper = new TorrentHelper(helperPath); this.localOnly = localOnly;
    this.metadataTimeout = metadataTimeout; this.bufferingTimeout = bufferingTimeout; this.client = null; this.torrent = null; this.file = null;
    this.server = null; this.token = null; this.generation = 0; this.stopping = Promise.resolve(); this.requests = new Set();
    this.state = { phase: 'idle', message: '', startedSessions: 0, peers: 0, downloaded: 0, uploaded: 0, downloadSpeed: 0, uploadSpeed: 0 };
    this.source = null; this.startedAt = 0; this.discoveryEnd = 0; this.rangeRequests = 0; this.lastRangeStart = 0;
    this.helper.on('log', value => this.log(value));
    this.restarts = 0;
    this.helper.on('failure', code => {
      const active = !!this.client; if (active) this.error(code);
      if (this.restarts++ < 3) {
        const stopped = active ? this.stop(true) : this.helper.close();
        stopped.then(() => this.helper.boot()).catch(() => {});
      }
    });
  }
  initialize() { return this.helper.boot(); }
  phase(phase, message) { this.state = { ...this.state, phase, message }; }
  status() { return { ...this.state, discoveryElapsedMs: this.startedAt ? (this.discoveryEnd || Date.now()) - this.startedAt : 0, filename: this.file?.name || '', fileSize: this.file?.length || 0, rangeRequests: this.rangeRequests, lastRangeStart: this.lastRangeStart }; }
  diagnostics() { return diagnostics(this.source, this.status()); }
  selected(source) { this.source = source; this.discoveryPeers = new Set(); this.startedAt = 0; this.discoveryEnd = 0; this.state = { ...this.state, dhtEnabled: !this.localOnly, pexEnabled: true, lsdEnabled: !this.localOnly, metadataState: 'not-started', errorCode: null, causeCode: null, peers: 0, trackerWarnings: 0, dhtWarning: false }; }
  error(code) { this.state.errorCode = code; this.phase('error', ERRORS[code] || ERRORS.METADATA_FAILURE); }
  log(value) {
    const message = String(value.fields?.message || ''); const target = String(value.target || '');
    // Raw strings are only inspected on the private pipe, never retained/exported.
    if (this.state.metadataState === 'resolving' && /connected over TCP|connected over uTP|connected through SOCKS5/i.test(message) && value.fields?.addr) { this.discoveryPeers.add(value.fields.addr); this.state.peers = this.discoveryPeers.size; }
    if (/tracker/i.test(target) && /warn|error/i.test(value.level || '')) { this.state.trackerWarnings++; this.state.causeCode = /dns|resolve|lookup/i.test(message) ? 'DNS_FAILURE' : /timeout/i.test(message) ? 'TIMEOUT' : 'TRACKER_UNREACHABLE'; }
    if (/bootstrap/i.test(message) && /error/i.test(message)) this.state.dhtWarning = true;
    if (/os error (10013|10051|10065)/i.test(message)) this.state.causeCode = 'NETWORK_UNREACHABLE';
  }
  async poll(generation) {
    try {
      const [stats, dht] = await Promise.all([this.helper.request('/stats'), this.localOnly ? null : this.helper.request('/dht/stats').catch(() => null)]);
      if (generation !== this.generation) return;
      this.state.dhtNodes = dht?.routing_table_size ?? dht?.size ?? 0; this.state.dhtStatus = this.localOnly ? 'disabled' : dht ? 'searching' : 'unavailable';
      const p = stats.peers || {}; this.state.peers = Math.max(this.state.metadataState === 'received' ? 0 : this.state.peers, (p.live_tcp || 0) + (p.live_utp || 0) + (p.live_socks || 0));
      this.state.downloaded = stats.counters?.fetched_bytes || 0; this.state.uploaded = stats.counters?.uploaded_bytes || 0;
      this.state.downloadSpeed = (stats.download_speed?.mbps || 0) * 1024 ** 2; this.state.uploadSpeed = (stats.upload_speed?.mbps || 0) * 1024 ** 2;
      if (this.torrent) { const torrent = await this.helper.request(`/torrents/${this.torrent.id}/stats/v1`); if (generation !== this.generation) return; this.torrent.files.forEach((file, i) => { file.downloaded = torrent.file_progress?.[i] || 0; }); if (torrent.state === 'error') { this.error('METADATA_FAILURE'); await this.stop(true); } }
    } catch { if (generation === this.generation && this.client && !this.helper.child) this.error('ENGINE_CRASH'); }
  }
  async start(source, limit = DEFAULT_LIMIT) {
    await this.stop(); const generation = this.generation; this.selected(source);
    if (this.localOnly && source.trackers.some(value => !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname))) throw new Error('The isolated QA backend only accepts loopback trackers.');
    this.startedAt = Date.now(); this.state.startedSessions++; this.rangeRequests = 0; this.lastRangeStart = 0; this.phase('connecting-engine', 'Connecting to P2P engine…'); let stage = 'startup';
    try {
      const directory = this.cache.createSession(); this.client = this.helper; await this.helper.start(directory, source, this.localOnly);
      if (generation !== this.generation) throw new Error(this.state.errorCode ? ERRORS[this.state.errorCode] : 'P2P preparation was cancelled.');
      this.state.metadataState = 'resolving'; this.phase('fetching-metadata', 'Resolving metadata · DHT and trackers searching…'); stage = 'metadata';
      this.pollTimer = setInterval(() => { if (!this.polling) { this.polling = true; this.poll(generation).finally(() => { this.polling = false; }); } }, 500);
      const resolved = await this.helper.resolve(source, this.metadataTimeout); this.discoveryEnd = Date.now(); this.state.metadataState = 'received'; this.state.peers = this.discoveryPeers.size;
      const bytes = Buffer.from(resolved.bytes, 'base64'); const parsed = await (await import('parse-torrent')).default(bytes);
      if (parsed.infoHash !== source.infoHash || bytes.length > 8 * 1024 ** 2 || parsed.files.length > 10000 || parsed.pieces.length > 100000 || parsed.pieceLength > 16 * 1024 ** 2) throw new Error(ERRORS.INVALID_METADATA);
      if (parsed.private) { this.state.dhtEnabled = false; this.state.pexEnabled = false; this.state.lsdEnabled = false; }
      this.phase('selecting-file', 'Metadata received · selecting video…'); stage = 'file';
      const files = parsed.files.map(file => ({ ...file, path: file.path.replaceAll('\\', '/'), downloaded: 0 })); this.file = selectFile(files, source);
      if (this.file.length + 2 * parsed.pieceLength > limit) throw new Error(ERRORS.CACHE_LIMIT);
      const root = parsed.name + '/'; files.forEach(file => { file.path = file.path.startsWith(root) ? file.path.slice(root.length) : file.path; }); this.cache.register(files);
      const index = files.indexOf(this.file);
      const added = await this.helper.request(`/torrents?is_url=false&only_files=${index}&output_folder=${encodeURIComponent(directory)}&initial_peers=${encodeURIComponent(resolved.peers.join(','))}`, { method: 'POST', body: bytes });
      this.torrent = { id: added.id, files }; this.fileIdx = index; this.phase('buffering', 'Buffering video from peers…'); stage = 'buffer';
      const first = await this.helper.request(`/torrents/${added.id}/stream/${index}`, { headers: { Range: `bytes=0-${Math.min(this.file.length, 512 * 1024) - 1}` }, signal: AbortSignal.timeout(this.bufferingTimeout) }, true); await first.arrayBuffer();
      if (generation !== this.generation) throw new Error(this.state.errorCode ? ERRORS[this.state.errorCode] : 'P2P preparation was cancelled.');
      this.token = randomBytes(24).toString('hex'); this.server = http.createServer((req, res) => this.serve(req, res));
      await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); }); this.phase('ready', 'Buffered · ready to play');
      return { url: `http://127.0.0.1:${this.server.address().port}/torrent/${this.token}`, hls: false, p2p: true, token: this.token, filename: this.file.name, videoSize: this.file.length, fileIdx: index };
    } catch (error) {
      if (generation !== this.generation) throw new Error('P2P preparation was cancelled.');
      const fileCode = source.fileIdx != null ? 'INVALID_FILE_INDEX' : source.filename ? 'MISSING_FILE' : 'NO_VIDEO';
      const code = this.state.errorCode || Object.keys(ERRORS).find(key => ERRORS[key] === error.message) || (stage === 'startup' ? 'ENGINE_STARTUP_FAILURE' : stage === 'file' ? fileCode : stage === 'buffer' ? 'BUFFER_TIMEOUT' : this.state.causeCode === 'NETWORK_UNREACHABLE' ? 'NETWORK_BLOCKED' : this.state.peers ? 'METADATA_TIMEOUT' : this.state.trackerWarnings ? 'TRACKER_UNREACHABLE' : this.state.dhtStatus === 'unavailable' ? 'DHT_UNAVAILABLE' : 'NO_PEERS');
      this.error(code); this.state.metadataState = this.state.metadataState === 'received' ? 'received' : 'failed'; this.discoveryEnd = Date.now(); await this.stop(true); throw new Error(this.state.message);
    }
  }
  async serve(req, res) {
    const file = this.file;
    if (!file || req.url !== `/torrent/${this.token}` || req.headers.host !== `127.0.0.1:${this.server?.address()?.port}`) { res.writeHead(404); res.end(); return; }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let selected; try { selected = range(req.headers.range, file.length); } catch { res.writeHead(416, { 'Content-Range': `bytes */${file.length}` }); res.end(); return; }
    const { start, end, partial } = selected;
    res.setHeader('Content-Type', /\.webm$/i.test(file.name) ? 'video/webm' : /\.(mp4|m4v)$/i.test(file.name) ? 'video/mp4' : 'application/octet-stream'); res.setHeader('Accept-Ranges','bytes'); res.setHeader('Cache-Control','no-store'); res.setHeader('Access-Control-Allow-Origin','null'); res.setHeader('Content-Length', end - start + 1);
    if (partial) res.setHeader('Content-Range', `bytes ${start}-${end}/${file.length}`); if (req.method === 'HEAD') { res.writeHead(partial ? 206 : 200); res.end(); return; }
    this.rangeRequests++; this.lastRangeStart = start; const controller = new AbortController(); this.requests.add(controller); res.on('close', () => controller.abort()); const timeout = setTimeout(() => controller.abort(), 60000); timeout.unref();
    try { const upstream = await this.helper.request(`/torrents/${this.torrent.id}/stream/${this.fileIdx}`, { headers: { Range: `bytes=${start}-${end}` }, signal: controller.signal }, true); const stream = Readable.fromWeb(upstream.body); stream.on('data', () => timeout.refresh()); res.writeHead(partial ? 206 : 200); await pipeline(stream, res); }
    catch { if (!res.headersSent) res.writeHead(502); res.end(); } finally { clearTimeout(timeout); this.requests.delete(controller); }
  }
  stop(preserve = false) {
    this.generation++; clearInterval(this.pollTimer); this.requests.forEach(controller => controller.abort()); this.requests.clear(); const server = this.server; this.server = null; this.token = null; this.client = null; this.file = null; this.torrent = null; if (!preserve) this.phase('idle','');
    this.stopping = this.stopping.then(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await this.helper.close(); this.cache.release(); }); return this.stopping;
  }
}
module.exports = { TorrentEngine, range };
