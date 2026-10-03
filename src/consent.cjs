'use strict';
const { randomUUID } = require('node:crypto');
// Only main owns acceptance. A fresh, pending challenge is required to save it;
// source payloads and generic settings cannot grant P2P consent.
class P2PConsent {
  constructor({ store, show, dismiss }) { Object.assign(this, { store, show, dismiss }); this.pending = null; }
  confirm(notice) {
    if (this.store.data.p2pNoticeAccepted === true) return Promise.resolve({ response: 1 });
    this.cancel();
    return new Promise(resolve => {
      const nonce = randomUUID(); this.pending = { nonce, resolve };
      this.show({ nonce, title: notice.title, message: notice.message, detail: notice.detail });
    });
  }
  answer({ nonce, accepted }) {
    const pending = this.pending;
    if (!pending || nonce !== pending.nonce || typeof accepted !== 'boolean') throw new Error('No matching P2P notice is pending.');
    if (accepted) {
      this.store.data.p2pNoticeAccepted = true;
      try { this.store.save(); } catch (error) { this.store.data.p2pNoticeAccepted = false; throw error; }
    }
    this.pending = null; this.dismiss(pending.nonce); pending.resolve({ response: accepted ? 1 : 0 });
  }
  cancel() { if (this.pending) { const pending = this.pending; this.pending = null; this.dismiss(pending.nonce); pending.resolve({ response: 0 }); } }
  reset() { this.cancel(); this.store.data.p2pNoticeAccepted = false; this.store.save(); }
}
module.exports = { P2PConsent };
