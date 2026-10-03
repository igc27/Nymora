'use strict';
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { TorrentCache, DEFAULT_LIMIT } = require('./torrent-cache.cjs');
const { selectFile } = require('./torrent-source.cjs');
function range(header, length) {
  if (!header) return { start: 0, end: length - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid byte range.');
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= length) throw new Error('Unsatisfiable byte range.');
  return { start, end, partial: true };
}
class TorrentEngine {
  constructor({ cacheDirectory, clientClass = async () => (await import('webtorrent')).default, localOnly = false, metadataTimeout = 90000, bufferingTimeout = 60000 }) {
    this.cache = new TorrentCache(cacheDirectory); this.clientClass = clientClass; this.localOnly = localOnly;
    this.metadataTimeout = metadataTimeout; this.bufferingTimeout = bufferingTimeout;
    this.client = null; this.torrent = null; this.file = null; this.server = null; this.token = null; this.generation = 0;
    this.state = { phase: 'idle', message: '', startedSessions: 0 }; this.reads = new Set(); this.cancelWaits = new Set(); this.rangeRequests = 0; this.lastRangeStart = 0; this.stopping = Promise.resolve();
  }
  status() {
    return { ...this.state, peers: this.torrent?.numPeers || 0, downloaded: this.torrent?.downloaded || 0, uploaded: this.torrent?.uploaded || 0, downloadSpeed: this.torrent?.downloadSpeed || 0, uploadSpeed: this.torrent?.uploadSpeed || 0, fileSize: this.file?.length || 0, filename: this.file?.name || '', rangeRequests: this.rangeRequests, lastRangeStart: this.lastRangeStart };
  }
  phase(phase, message) { this.state = { ...this.state, phase, message }; }
  async start(source, limit = DEFAULT_LIMIT) {
    await this.stop(); const generation = this.generation;
    if (this.localOnly && source.trackers.some(value => !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname))) throw new Error('The isolated QA backend only accepts loopback trackers.');
    const Client = await this.clientClass();
    if (generation !== this.generation) throw new Error('P2P preparation was cancelled.');
    const PieceStore = this.cache.create(limit);
    this.phase('finding-peers', 'Finding peers…'); this.state.startedSessions++;
    this.rangeRequests = 0; this.lastRangeStart = 0;
    try {
      this.client = new Client({ dht: !this.localOnly, tracker: true, lsd: !this.localOnly, utPex: true, utp: false, natUpnp: false, natPmp: false, webSeeds: false, maxConns: 40 });
      this.client.on('error', error => this.fail(error, generation));
      const torrent = this.client.add(source.magnet, { store: PieceStore, storeCacheSlots: 4, deselect: true, strategy: 'sequential', announce: [], uploads: 4 });
      this.torrent = torrent;
      torrent.on('error', error => this.fail(error, generation));
      torrent.on('wire', () => { if (generation === this.generation && !torrent.metadata) this.phase('fetching-metadata', 'Fetching metadata…'); });
      torrent.on('metadata', () => { if (generation === this.generation) this.phase('buffering', 'Buffering…'); });
      for (const node of source.dhtNodes) this.client.dht?.addNode(node);
      await this.waitFor(torrent, 'ready', this.metadataTimeout, 'No torrent metadata arrived. Check the source availability and retry.', () => torrent.ready);
      if (generation !== this.generation) throw new Error('P2P preparation was cancelled.');
      if (torrent.files.length > 10000 || torrent.pieces.length > 100000 || torrent.pieceLength > 16 * 1024 ** 2) throw new Error('Torrent metadata exceeds the supported safety limits.');
      this.file = selectFile(torrent.files, source);
      if (!this.file.length || this.file.length + 2 * torrent.pieceLength > limit) throw new Error('Selected video exceeds the torrent cache limit. Increase the limit in Settings or choose a smaller file.');
      torrent.files.forEach(file => file.deselect()); this.file.select(0);
      this.phase('buffering', 'Buffering…');
      await this.buffer(this.file, generation);
      if (generation !== this.generation) throw new Error('P2P preparation was cancelled.');
      this.token = randomBytes(24).toString('hex');
      this.server = http.createServer((req, res) => this.serve(req, res));
      await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); });
      this.phase('ready', 'Buffered · ready to play');
      return { url: `http://127.0.0.1:${this.server.address().port}/torrent/${this.token}`, hls: false, p2p: true, token: this.token, filename: this.file.name, videoSize: this.file.length, fileIdx: torrent.files.indexOf(this.file) };
    } catch (error) {
      if (generation === this.generation) { await this.stop(); this.phase('error', error.message); }
      throw error;
    }
  }
  waitFor(torrent, event, timeout, message, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); torrent.removeListener(event, done); torrent.removeListener('error', fail); this.cancelWaits.delete(cancel); error ? reject(error) : resolve(); };
      const done = () => finish(); const fail = error => finish(error); const cancel = error => finish(error || new Error('P2P preparation was cancelled.'));
      const timer = setTimeout(() => finish(new Error(message)), timeout); timer.unref();
      this.cancelWaits.add(cancel); torrent.once(event, done); torrent.once('error', fail);
    });
  }
  async buffer(file, generation) {
    const stream = file.createReadStream({ start: 0, end: Math.min(file.length, 512 * 1024) - 1 }); this.reads.add(stream);
    const timer = setTimeout(() => stream.destroy(new Error('Not enough data arrived to start playback. Try another source.')), this.bufferingTimeout); timer.unref();
    let buffered = 0;
    try {
      for await (const chunk of stream) { buffered += chunk.length; if (generation !== this.generation) throw new Error('P2P preparation was cancelled.'); }
      if (!buffered) throw new Error('Torrent did not supply playable data.');
    }
    finally { clearTimeout(timer); this.reads.delete(stream); stream.destroy(); }
  }
  async serve(req, res) {
    const file = this.file;
    if (!file || req.url !== `/torrent/${this.token}` || req.headers.host !== `127.0.0.1:${this.server?.address()?.port}`) { res.writeHead(404); res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let selected;
    try { selected = range(req.headers.range, file.length); }
    catch { res.writeHead(416, { 'Content-Range': `bytes */${file.length}` }); res.end(); return; }
    const { start, end, partial } = selected;
    res.setHeader('Content-Type', file.type); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', 'null'); res.setHeader('Content-Length', end - start + 1);
    if (partial) res.setHeader('Content-Range', `bytes ${start}-${end}/${file.length}`);
    if (req.method === 'HEAD') { res.writeHead(partial ? 206 : 200); res.end(); return; }
    this.rangeRequests++; this.lastRangeStart = start;
    // WebTorrent's file stream gives these pieces high priority; destroying a
    // superseded range removes its stream selection. Seeking needs no full file.
    const stream = file.createReadStream({ start, end }); this.reads.add(stream);
    const timeout = setTimeout(() => stream.destroy(new Error('Torrent source stopped supplying data.')), 60000); timeout.unref();
    stream.on('data', () => timeout.refresh());
    res.on('close', () => stream.destroy());
    try { res.writeHead(partial ? 206 : 200); await pipeline(stream, res); }
    catch { if (!res.headersSent) res.writeHead(502); res.end(); }
    finally { clearTimeout(timeout); stream.destroy(); this.reads.delete(stream); }
  }
  fail(error, generation) {
    if (generation !== this.generation) return;
    const stopping = this.stop(error), stoppedGeneration = this.generation;
    stopping.then(() => { if (this.generation === stoppedGeneration) this.phase('error', error.message); }).catch(() => {});
  }
  stop(error) {
    this.generation++; this.cancelWaits.forEach(cancel => cancel(error)); this.cancelWaits.clear();
    this.reads.forEach(stream => stream.destroy()); this.reads.clear();
    const server = this.server; this.server = null; this.token = null;
    const client = this.client; this.client = null; this.torrent = null; this.file = null;
    this.phase('idle', '');
    this.stopping = this.stopping.then(async () => {
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      if (client && !client.destroyed) await new Promise(resolve => client.destroy(() => resolve()));
      this.cache.release();
    });
    return this.stopping;
  }
}
module.exports = { TorrentEngine, range };
