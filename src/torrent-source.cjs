'use strict';
const VIDEO = /\.(mp4|m4v|webm|mkv|mov|avi|ogv|ogg|ts)$/i;
function isP2P(stream) {
  if (!stream || typeof stream !== 'object') return false;
  return Object.hasOwn(stream, 'infoHash') || Object.hasOwn(stream, 'magnet') || Object.hasOwn(stream, 'magnetUri') || /^magnet:/i.test(stream.url || '') || /^(bittorrent|torrent|p2p)$/i.test(stream.backend || stream.type || '') || stream.behaviorHints?.p2p === true || stream.behaviorHints?.torrent === true;
}
function hash(value) {
  if (typeof value !== 'string') throw new Error('A valid BitTorrent v1 infoHash is required.');
  if (/^[a-f0-9]{40}$/i.test(value)) return value.toLowerCase();
  if (/^[a-z2-7]{32}$/i.test(value)) {
    let bits = 0, accumulator = 0; const bytes = [];
    for (const c of value.toUpperCase()) {
      accumulator = (accumulator << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c); bits += 5;
      if (bits >= 8) { bits -= 8; bytes.push((accumulator >>> bits) & 255); }
    }
    return Buffer.from(bytes).toString('hex');
  }
  throw new Error('Invalid BitTorrent v1 infoHash.');
}
function tracker(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid tracker hint.');
  const url = new URL(value);
  if (!['http:', 'https:', 'udp:', 'ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) throw new Error('Unsupported tracker URL.');
  if (url.protocol === 'udp:' && !url.port) throw new Error('UDP tracker requires a port.');
  return url.href;
}
function normalizeTorrent(stream) {
  if (!isP2P(stream)) throw new Error('This is not a P2P source.');
  const hints = stream.behaviorHints || {};
  let infoHash, displayName = '', trackers = [];
  const raw = stream.magnetUri || stream.magnet || (/^magnet:/i.test(stream.url || '') ? stream.url : '');
  if (raw) {
    if (typeof raw !== 'string' || raw.length > 32768) throw new Error('Invalid magnet URI.');
    const magnet = new URL(raw);
    if (magnet.protocol !== 'magnet:') throw new Error('Invalid magnet URI.');
    const xt = magnet.searchParams.getAll('xt').find(v => /^urn:btih:/i.test(v));
    if (!xt) throw new Error('Magnet must include a BitTorrent v1 infoHash.');
    infoHash = hash(xt.slice(9)); displayName = (magnet.searchParams.get('dn') || '').slice(0, 500);
    trackers = magnet.searchParams.getAll('tr');
  }
  if (stream.infoHash !== undefined) {
    const supplied = hash(stream.infoHash);
    if (infoHash && infoHash !== supplied) throw new Error('Magnet and infoHash refer to different torrents.');
    infoHash = supplied;
  }
  if (!infoHash) throw new Error('The P2P source did not supply an infoHash or magnet URI.');
  for (const list of [stream.trackers, stream.announce, hints.trackers]) {
    if (list !== undefined && !Array.isArray(list)) throw new Error('Invalid tracker list.');
    if (list) trackers.push(...list);
  }
  if (stream.sources !== undefined && !Array.isArray(stream.sources)) throw new Error('Invalid torrent source hints.');
  const dhtNodes = [];
  for (const source of stream.sources || []) {
    if (typeof source !== 'string') throw new Error('Invalid torrent source hint.');
    if (source.startsWith('tracker:')) trackers.push(source.slice(8));
    else if (/^dht:/.test(source)) {
      const match = source.match(/^dht:([a-z0-9.-]{1,253}):(\d{1,5})$/i);
      if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) throw new Error('Invalid DHT node hint.');
      dhtNodes.push({ host: match[1], port: Number(match[2]) });
    }
  }
  if (trackers.length > 64 || dhtNodes.length > 32) throw new Error('Too many torrent discovery hints.');
  trackers = [...new Set(trackers.map(tracker))];
  const fileIdx = stream.fileIdx;
  if (fileIdx !== undefined && fileIdx !== null && (!Number.isInteger(fileIdx) || fileIdx < 0 || fileIdx > 100000)) throw new Error('Invalid torrent file index.');
  const filename = stream.filename ?? hints.filename ?? '';
  if (typeof filename !== 'string' || filename.length > 2000 || /[\0\r\n]/.test(filename)) throw new Error('Invalid filename hint.');
  const videoSize = stream.videoSize ?? hints.videoSize;
  if (videoSize !== undefined && (!Number.isSafeInteger(videoSize) || videoSize < 0)) throw new Error('Invalid video size hint.');
  // Reconstruct a minimal URI: xs/as/ws and arbitrary magnet parameters never
  // become file reads, shell input or unaudited metadata/web-seed fetches.
  const params = new URLSearchParams();
  if (displayName) params.set('dn', displayName);
  trackers.forEach(value => params.append('tr', value));
  return { infoHash, magnet: `magnet:?xt=urn:btih:${infoHash}${params.size ? '&' + params : ''}`, trackers, dhtNodes, fileIdx, filename, videoSize, displayName };
}
function selectFile(files, source) {
  if (source.fileIdx !== undefined && source.fileIdx !== null) {
    if (!files[source.fileIdx]) throw new Error('Requested torrent file index is not present.');
    if (!VIDEO.test(files[source.fileIdx].name)) throw new Error('The requested torrent file is not a supported video container.');
    return files[source.fileIdx];
  }
  const video = files.filter(file => VIDEO.test(file.name) && file.length > 0);
  if (source.filename) {
    const name = source.filename.replaceAll('\\', '/');
    const matching = video.filter(file => file.path === name || file.name === name || file.name === name.split('/').pop());
    const sized = matching.filter(file => file.length === source.videoSize);
    if (sized.length === 1) return sized[0];
    if (matching.length === 1) return matching[0];
    if (!matching.length) throw new Error('The filename hint does not match a video in this torrent.');
  }
  const sized = video.filter(file => file.length === source.videoSize);
  if (sized.length === 1) return sized[0];
  if (!video.length) throw new Error('This torrent contains no supported video file.');
  // Preserve an explicit index/name/size selection, but avoid preview samples
  // when choosing a default from real torrent metadata.
  const mainVideos = video.filter(file => !/(^|[\/\\._\s-])samples?(?=$|[\/\\._\s-])/i.test(file.path || file.name));
  return (mainVideos.length ? mainVideos : video).sort((a, b) => b.length - a.length)[0];
}
module.exports = { isP2P, normalizeTorrent, selectFile, hash, tracker };
