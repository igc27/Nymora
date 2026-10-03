'use strict';
// Strict allowlist: exported text never contains raw engine logs, addon URLs,
// HTTP headers, native API credentials, playback tokens or cache paths.
function trackerURL(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${/^\/(announce(?:\.php)?|tracker)?\/?$/.test(url.pathname) ? url.pathname : '/[redacted]'}${url.search ? '?[redacted]' : ''}`;
  } catch { return '[invalid tracker]'; }
}
function filenameHint(value) {
  return String(value || '').replace(/(?:https?:\/\/|magnet:)[^\s]+/gi, '[redacted]').replace(/[a-z0-9_-]{32,}/gi, '[redacted]').replace(/[\0\r\n]/g, '').slice(0, 500);
}
function diagnostics(source, state) {
  return {
    infoHash: source?.infoHash || '', fileIdx: source?.fileIdx ?? null,
    filenameHint: filenameHint(source?.filename), videoSize: source?.videoSize ?? null,
    trackerCount: source?.trackers?.length || 0, trackerURLs: (source?.trackers || []).map(trackerURL),
    dhtEnabled: !!state.dhtEnabled, pexEnabled: !!state.pexEnabled, lsdEnabled: !!state.lsdEnabled,
    peerCount: state.peers || 0, metadataState: state.metadataState || 'not-started',
    elapsedDiscoveryMs: state.discoveryElapsedMs || 0,
    engineError: state.errorCode || null, cause: state.causeCode || null
  };
}
function causeCode(error) {
  const code = error?.cause?.code || error?.code || '';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DNS_FAILURE';
  if (/CERT|TLS|SSL|SELF_SIGNED/.test(code)) return 'TLS_FAILURE';
  if (['ECONNRESET','UND_ERR_SOCKET','EPIPE'].includes(code)) return 'CONNECTION_RESET';
  if (/TIMEOUT|ETIMEDOUT/.test(code) || ['TimeoutError','AbortError'].includes(error?.name)) return 'TIMEOUT';
  if (['EACCES','EPERM','ENETUNREACH','EHOSTUNREACH'].includes(code)) return 'NETWORK_UNREACHABLE';
  if (code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
  return 'NETWORK_FAILURE';
}
module.exports = { diagnostics, trackerURL, causeCode };
