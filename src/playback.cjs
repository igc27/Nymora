'use strict';
const { isP2P, normalizeTorrent } = require('./torrent-source.cjs');
const { NOTICE } = require('./p2p-notice.cjs');
class Playback {
  constructor({ media, torrents, confirm, cacheLimit }) { this.media = media; this.torrents = torrents; this.confirm = confirm; this.cacheLimit = cacheLimit; this.pending = false; this.request = 0; this.awaitingConsent = false; }
  status() { return this.awaitingConsent ? { ...this.torrents.status(), phase: 'awaiting-consent', message: 'Waiting for your P2P confirmation…' } : this.torrents.status(); }
  async source(stream) {
    if (this.pending) throw new Error('A source is already being prepared. Cancel it before selecting another.');
    if (!isP2P(stream)) { await this.stop(); return this.media.source(stream); }
    // Parsing is pure. The only path to start() follows a fresh response from
    // the trusted native dialog. Renderer-supplied "consent" is never accepted.
    const source = normalizeTorrent(stream); const request = ++this.request; this.pending = true;
    try {
      this.awaitingConsent = true;
      const result = await this.confirm({ ...NOTICE, buttons: [...NOTICE.buttons] }); this.awaitingConsent = false;
      if (result.response !== 1 || request !== this.request) return { cancelled: true };
      this.media.stop(); return await this.torrents.start(source, this.cacheLimit());
    } finally { this.pending = false; this.awaitingConsent = false; }
  }
  async stop() { this.request++; this.media.stop(); await this.torrents.stop(); }
  async close() { await this.stop(); this.media.close(); }
}
module.exports = { Playback };
