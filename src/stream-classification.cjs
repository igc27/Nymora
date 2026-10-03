'use strict';
const { validURL } = require('./network.cjs');
const { isP2P, normalizeTorrent } = require('./torrent-source.cjs');
function classify(stream) {
  if (!stream || typeof stream !== 'object') return 'unsupported';
  // AIOStreams publishes statistics/errors as external actions. Do not turn
  // these into playback choices, even when an addon attaches a placeholder URL.
  if (['statistic', 'statistics', 'error', 'info', 'information', 'warning'].includes(stream.streamData?.type)) return 'information';
  const label = [stream.name, stream.title].filter(v => typeof v === 'string').join(' ').replace(/^[^\p{L}\p{N}]+/u, '');
  if (/^(Removal Reasons|Included Reasons|Excluded Resolutions?|Disabled Stream Types|Configuration (Warning|Required))\b/i.test(label)) return 'information';
  if (isP2P(stream)) { try { normalizeTorrent(stream); return 'p2p'; } catch { return 'unsupported'; } }
  if (typeof stream.url === 'string') { try { validURL(stream.url); return 'http'; } catch {} }
  if (stream.externalUrl || stream.description || stream.name || stream.title) return 'information';
  return 'unsupported';
}
function playableResults(result) {
  const items = [], notices = new Set();
  for (const stream of result.items) {
    const kind = classify(stream);
    if (['http', 'p2p'].includes(kind)) items.push({ ...stream, nymoraP2P: kind === 'p2p' });
    else notices.add(`${stream.addonName || 'Addon'}: ${kind === 'information' ? 'Some sources were filtered or informational.' : 'Some sources use an unsupported format.'}`);
  }
  return { ...result, items, notices: [...notices] };
}
module.exports = { classify, playableResults };
