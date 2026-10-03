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
      if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) return [];
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
    let bytes = 0;
    for (const { directory, names } of this.manifests()) {
      const folders = new Set();
      for (const name of names) { const file = this.checked(directory, name); if (file) { bytes += fs.statSync(file).size; fs.unlinkSync(file); let parent = path.dirname(file); while (parent !== directory) { folders.add(parent); parent = path.dirname(parent); } } }
      for (const folder of [...folders].sort((a, b) => b.length - a.length)) if (fs.existsSync(folder) && !fs.readdirSync(folder).length) fs.rmdirSync(folder);
      fs.unlinkSync(path.join(directory, '.nymora-files.json'));
    }
    return bytes + super.clear();
  }
  createSession() {
    this.clear(); const directory = path.join(this.directory, `session-${randomUUID()}`);
    fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, '.nymora-session'), 'Nymora owned pieces v1\n'); this.active = directory; return directory;
  }
  register(files) {
    if (!this.active || files.some(file => !this.safe(file.path) || file.attributes?.symlink)) throw new Error('Torrent contains an unsafe file path.');
    const names = files.map(file => file.path);
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('Torrent contains conflicting file paths.');
    fs.writeFileSync(path.join(this.active, '.nymora-files.json'), JSON.stringify(names));
  }
}
module.exports = { NativeTorrentCache };
