'use strict';
const fs = require('node:fs');
const path = require('node:path');
const defaults = () => ({ version: 1, addons: [], library: [], progress: {}, searchHistory: [], dismissedContinuing: [], p2pNoticeAccepted: false, settings: { subtitleLanguage: 'eng', subtitleSize: 32, subtitleDelay: 0, subtitleAppearance: 'shadow', audioLanguage: '', volume: 0.8, torrentCacheMB: 2048, p2pWaitMode: 'patient', posterStyle: 'portrait', interfaceStyle: 'classic', startupIntro: true, startupSound: false, blurEpisodeThumbnails: false, homeCatalogOrder: [], hiddenCatalogs: [], videoFit: 'fit', startFullscreen: false, skipInterval: 10, controlsHideSeconds: 3, holdSpace2x: true, defaultPlaybackSpeed: 1, autoplayNextEpisode: false, resumePlayback: 'ask', showP2PStats: true } });
class Store {
  constructor(directory) {
    this.file = path.join(directory, 'nymora.json');
    fs.mkdirSync(directory, { recursive: true });
    this.data = defaults(); this.warning = '';
    try {
      if (fs.existsSync(this.file)) {
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (saved.version !== 1 || !Array.isArray(saved.addons) || !Array.isArray(saved.library) || !saved.progress || typeof saved.progress !== 'object') throw new Error('Invalid storage schema');
        this.data = { ...this.data, ...saved, settings: { ...this.data.settings, ...saved.settings } };
        if (!Number.isInteger(this.data.settings.torrentCacheMB) || this.data.settings.torrentCacheMB < 256 || this.data.settings.torrentCacheMB > 16384) this.data.settings.torrentCacheMB = 2048;
      }
    } catch {
      fs.copyFileSync(this.file, `${this.file}.recovery-${Date.now()}`);
      this.warning = 'Saved data could not be read. A recovery copy was preserved in your data folder.';
    }
  }
  save() {
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
    return this.data;
  }
  progress(entry) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.mediaId !== 'string' || typeof entry.type !== 'string' || !Number.isFinite(entry.position) || !Number.isFinite(entry.duration) || entry.duration <= 0) return this.data;
    const position = Math.max(0, Math.min(entry.position, entry.duration));
    const key = `${entry.type}:${entry.id}`;
    this.data.progress[key] = { id: entry.id, mediaId: entry.mediaId, type: entry.type, name: String(entry.name || ''), episodeName: String(entry.episodeName || ''), poster: entry.poster || '', position, duration: entry.duration, updatedAt: new Date().toISOString(), watched: entry.watched === true || position / entry.duration >= 0.95 };
    return this.save();
  }
}
module.exports = { Store, defaults };
