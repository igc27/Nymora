'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const DEFAULT_LIMIT = 2 * 1024 ** 3;
class TorrentCache {
  constructor(directory) { this.directory = path.resolve(directory); this.active = null; }
  ensure() {
    if (fs.existsSync(this.directory)) {
      const stat = fs.lstatSync(this.directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Torrent cache directory must be a local directory.');
      const marker = path.join(this.directory, '.nymora-cache');
      if (!fs.existsSync(marker) || !fs.lstatSync(marker).isFile() || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== 'Nymora torrent cache v1\n') throw new Error('Unrecognized cache folder; no existing files were changed.');
    } else {
      fs.mkdirSync(this.directory, { recursive: true }); fs.writeFileSync(path.join(this.directory, '.nymora-cache'), 'Nymora torrent cache v1\n', { flag: 'wx' });
    }
  }
  sessions() {
    this.ensure();
    return fs.readdirSync(this.directory).filter(name => /^session-[a-f0-9-]{36}$/.test(name)).map(name => path.join(this.directory, name)).filter(dir => {
      const stat = fs.lstatSync(dir); const marker = path.join(dir, '.nymora-session');
      return stat.isDirectory() && !stat.isSymbolicLink() && fs.existsSync(marker) && fs.lstatSync(marker).isFile() && !fs.lstatSync(marker).isSymbolicLink() && fs.readFileSync(marker, 'utf8') === 'Nymora owned pieces v1\n';
    });
  }
  pieceFiles(dir) {
    if (path.dirname(path.resolve(dir)) !== this.directory) throw new Error('Cache path escaped its root.');
    return fs.readdirSync(dir).filter(name => /^\d+\.piece$/.test(name)).map(name => path.join(dir, name)).filter(file => { const stat = fs.lstatSync(file); return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1; });
  }
  size() { return this.sessions().reduce((sum, dir) => sum + this.pieceFiles(dir).reduce((bytes, file) => bytes + fs.statSync(file).size, 0), 0); }
  clear() {
    if (this.active) throw new Error('Stop P2P playback before clearing its cache.');
    let removedBytes = 0;
    for (const dir of this.sessions()) {
      for (const file of this.pieceFiles(dir)) { removedBytes += fs.statSync(file).size; fs.unlinkSync(file); }
      // Unknown files and links stay untouched, even inside a marked session.
      if (fs.readdirSync(dir).length === 1) { fs.unlinkSync(path.join(dir, '.nymora-session')); fs.rmdirSync(dir); }
    }
    return removedBytes;
  }
  create(limit = DEFAULT_LIMIT) {
    this.clear(); const directory = path.join(this.directory, `session-${randomUUID()}`);
    fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, '.nymora-session'), 'Nymora owned pieces v1\n'); this.active = directory;
    const cache = this;
    return class BoundedPieceStore {
      constructor(chunkLength, opts = {}) {
        this.chunkLength = chunkLength; this.length = opts.length; this.bytes = 0; this.closed = false; this.writes = new Map(); this.pending = 0; this.closers = [];
      }
      file(index) {
        if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(this.length / this.chunkLength)) throw new Error('Invalid torrent piece index.');
        return path.join(directory, `${index}.piece`);
      }
      put(index, bytes, callback) {
        try {
          if (this.closed) throw new Error('Torrent storage is closed.');
          const file = this.file(index); const expected = Math.min(this.chunkLength, this.length - index * this.chunkLength);
          if (!Number.isSafeInteger(this.chunkLength) || this.chunkLength <= 0 || this.chunkLength > 16 * 1024 ** 2) throw new Error('Unsupported torrent piece size.');
          if (bytes.length !== expected) throw new Error('Invalid torrent piece length.');
          if (!this.writes.has(index) && this.bytes + bytes.length > limit) throw new Error('Torrent cache limit reached. Stop playback or increase the cache limit.');
          if (!this.writes.has(index)) { this.bytes += bytes.length; this.writes.set(index, bytes.length); }
          if (fs.existsSync(file)) { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe piece cache file.'); }
          this.pending++;
          fs.writeFile(file, bytes, error => { this.pending--; callback(error); this.finishClose(); });
        } catch (error) { queueMicrotask(() => callback(error)); }
      }
      get(index, opts, callback) {
        if (typeof opts === 'function') { callback = opts; opts = {}; }
        try {
          if (this.closed) throw new Error('Torrent storage is closed.');
          const file = this.file(index);
          if (fs.existsSync(file)) { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe piece cache file.'); }
          fs.readFile(file, (error, bytes) => callback(error, error ? undefined : bytes.subarray(opts?.offset || 0, (opts?.offset || 0) + (opts?.length ?? bytes.length))));
        } catch (error) { queueMicrotask(() => callback(error)); }
      }
      finishClose() { if (this.closed && !this.pending) { cache.active = null; this.closers.splice(0).forEach(callback => queueMicrotask(() => callback?.())); } }
      close(callback) { this.closed = true; this.closers.push(callback); this.finishClose(); }
      destroy(callback) { this.close(() => { try { cache.clear(); callback?.(); } catch (error) { callback?.(error); } }); }
    };
  }
  release() { this.active = null; }
}
module.exports = { TorrentCache, DEFAULT_LIMIT };
