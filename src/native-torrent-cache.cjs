'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { TorrentCache } = require('./torrent-cache.cjs');
class NativeTorrentCache extends TorrentCache {
  // Native storage uses files rather than pieces. A separately marked manifest
  // records every owned path before librqbit creates anything.
  manifests() {
    return this.sessions().flatMap(directory => {
      const file = path.join(directory, '.nymora-files.json');
      if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || fs.lstatSync(file).nlink !== 1) return [];
      try { const names = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(names) || names.some(name => !this.safe(name))) return []; return [{ directory, names }]; } catch { return []; }
    });
  }
  safe(name) {
    return typeof name === 'string' && name.length < 2000 && name.split('/').every(part => part && !/[\\:\0]/.test(part) && !['.','..'].includes(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) && !path.isAbsolute(name);
  }
  checked(directory, name) {
    const parts = name.split('/'); let current = directory;
    for (const part of parts) { current = path.join(current, part); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return null; }
    const stat = fs.existsSync(current) && fs.lstatSync(current);
    return stat && stat.isFile() && stat.nlink === 1 ? current : null;
  }
  size() { return super.size() + this.manifests().reduce((sum, entry) => sum + entry.names.reduce((n, name) => { const file = this.checked(entry.directory, name); return n + (file ? fs.statSync(file).size : 0); }, 0), 0); }
  clear() {
    if (this.active) throw new Error('Stop P2P playback before clearing its cache.');
    return this.clearInactive();
  }
  removeSession(directory) {
    if (directory === this.active || !this.sessions().includes(directory)) return 0;
    let bytes = 0;
    for (const { names } of this.manifests().filter(entry => entry.directory === directory)) {
      const folders = new Set();
      for (const name of names) { const file = this.checked(directory, name); if (file) { bytes += fs.statSync(file).size; fs.unlinkSync(file); let parent = path.dirname(file); while (parent !== directory) { folders.add(parent); parent = path.dirname(parent); } } }
      for (const folder of [...folders].sort((a, b) => b.length - a.length)) if (fs.existsSync(folder) && !fs.readdirSync(folder).length) fs.rmdirSync(folder);
      fs.unlinkSync(path.join(directory, '.nymora-files.json'));
    }
    for (const file of this.pieceFiles(directory)) { bytes += fs.statSync(file).size; fs.unlinkSync(file); }
    if (fs.readdirSync(directory).length === 1) { fs.unlinkSync(path.join(directory, '.nymora-session')); fs.rmdirSync(directory); }
    return bytes;
  }
  clearInactive() { return this.sessions().filter(directory => directory !== this.active).reduce((bytes, directory) => bytes + this.removeSession(directory), 0); }
  enforce(limit, reserve = 0) {
    if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(reserve) || reserve < 0) throw new Error('Invalid cache budget.');
    const activeEntry = this.manifests().find(entry => entry.directory === this.active);
    const activeBytes = activeEntry ? activeEntry.names.reduce((sum, name) => { const file = this.checked(this.active, name); return sum + (file ? fs.statSync(file).size : 0); }, 0) : 0;
    // Reserve the selected file and boundary pieces before starting native writes.
    let projected = this.size() - activeBytes + Math.max(activeBytes, reserve);
    const candidates = this.sessions().filter(directory => directory !== this.active).sort((a, b) => fs.statSync(path.join(a, '.nymora-session')).mtimeMs - fs.statSync(path.join(b, '.nymora-session')).mtimeMs);
    let retained = candidates.length;
    for (const directory of candidates) { if (projected <= limit && retained <= 64) break; projected -= this.removeSession(directory); retained--; }
    return projected;
  }
  createSession() {
    this.ensure(); if (this.active) throw new Error('A torrent cache session is already active.');
    const directory = path.join(this.directory, `session-${randomUUID()}`);
    fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, '.nymora-session'), 'Nymora owned pieces v1\n'); this.active = directory; return directory;
  }
  register(files) {
    if (!this.active || files.some(file => !this.safe(file.path) || file.attributes?.symlink)) throw new Error('Torrent contains an unsafe file path.');
    const names = files.map(file => file.path);
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('Torrent contains conflicting file paths.');
    fs.writeFileSync(path.join(this.active, '.nymora-files.json'), JSON.stringify(names));
  }
  release() { if (this.active && this.sessions().includes(this.active)) { const now = new Date(); fs.utimesSync(path.join(this.active, '.nymora-session'), now, now); } super.release(); }
}
module.exports = { NativeTorrentCache };
