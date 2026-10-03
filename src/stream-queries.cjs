'use strict';
const { randomUUID } = require('node:crypto');
const { aggregate } = require('./addons.cjs');
const { playableResults } = require('./stream-classification.cjs');
class StreamQueries {
  constructor() { this.jobs = new Map(); }
  start(descriptors, { type, id }) {
    this.cancelAll();
    const key = randomUUID(), job = { revision: 0, items: [], errors: [], notices: [], pending: 1, done: false, diagnostics: [] };
    this.jobs.set(key, job);
    aggregate(descriptors, 'stream', type, id, {}, {
      onCancelReady: cancel => { job.cancel = cancel; },
      onDiagnostic: value => { job.diagnostics[value.addonIndex] = { ...value }; },
      onUpdate: result => { Object.assign(job, playableResults(result)); job.revision++; }
    }).then(() => { job.done = true; job.revision++; }, () => { job.done = true; job.errors.push('Unable to query installed addons.'); job.revision++; });
    return key;
  }
  read(key) {
    const job = this.jobs.get(key);
    if (!job) throw new Error('Source request is no longer active.');
    return { revision: job.revision, items: job.items, errors: job.errors, notices: job.notices, pending: job.pending, done: job.done };
  }
  diagnostics(key) { const job = this.jobs.get(key); return { transport: 'Chromium / system networking', requests: (job?.diagnostics || []).filter(Boolean) }; }
  cancel(key) { const job = this.jobs.get(key); job?.cancel?.(); this.jobs.delete(key); }
  cancelAll() { for (const key of this.jobs.keys()) this.cancel(key); }
}
module.exports = { StreamQueries };
