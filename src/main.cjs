'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
const addons = require('./addons.cjs');
const { validURL, boundedText } = require('./network.cjs');
const { parseSubtitles } = require('./subtitles.cjs');
const { createMediaProxy } = require('./media.cjs');
const { TorrentEngine } = require('./torrent-engine.cjs');
const { Playback } = require('./playback.cjs');
const { isP2P } = require('./torrent-source.cjs');
let store, media, playback, torrents, window, allowClose = false, quitting = false;
if (process.env.NYMORA_DATA_DIR) app.setPath('userData', path.resolve(process.env.NYMORA_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
function snapshot() { return { ...store.data, warning: store.warning, appVersion: app.getVersion(), dataDirectory: app.getPath('userData') }; }
const operations = {
  state: () => snapshot(),
  async install({ url }) {
    const descriptor = await addons.install(url);
    store.data.addons = store.data.addons.filter(d => d.manifest.id !== descriptor.manifest.id);
    store.data.addons.push(descriptor); store.save(); return snapshot();
  },
  remove({ transportUrl }) { store.data.addons = store.data.addons.filter(d => d.transportUrl !== transportUrl); store.save(); return snapshot(); },
  catalogs: () => addons.catalogs(store.data.addons),
  catalog: query => addons.catalog(store.data.addons, query),
  search: ({ term }) => { if (typeof term !== 'string' || term.length > 500) throw new Error('Search text is too long.'); return addons.search(store.data.addons, term); },
  meta: ({ type, id }) => addons.aggregate(store.data.addons, 'meta', type, id),
  async streams({ type, id }) { const result = await addons.aggregate(store.data.addons, 'stream', type, id); result.items = result.items.map(stream => ({ ...stream, nymoraP2P: isP2P(stream) })); return result; },
  subtitles: ({ type, id, extra }) => addons.aggregate(store.data.addons, 'subtitles', type, id, extra || {}),
  subtitleFile: async ({ url }) => parseSubtitles(await boundedText(validURL(url), 4 * 1024 * 1024)),
  async localSubtitle() {
    const selected = await dialog.showOpenDialog(window, { title: 'Open subtitle file', properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] }] });
    if (selected.canceled) return null;
    const file = selected.filePaths[0];
    if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('Subtitle file is too large.');
    return { name: path.basename(file), cues: parseSubtitles(fs.readFileSync(file, 'utf8')) };
  },
  source: stream => playback.source(stream),
  stop: () => playback.stop(),
  playbackStatus: () => playback.status(),
  cacheSummary: () => ({ bytes: torrents.cache.size(), limitMB: store.data.settings.torrentCacheMB, active: !!torrents.client }),
  clearTorrentCache: () => { const removedBytes = torrents.cache.clear(); return { removedBytes, bytes: torrents.cache.size() }; },
  quitReady: () => { allowClose = true; setImmediate(() => window.close()); },
  progress: entry => { store.progress(entry); return snapshot(); },
  watched({ type, id, mediaId, name, poster, watched }) {
    const key = `${type}:${id}`;
    const existing = store.data.progress[key];
    store.data.progress[key] = existing ? { ...existing, watched: !!watched, updatedAt: new Date().toISOString() } : { id, mediaId, type, name, poster, position: 0, duration: 0, watched: !!watched, updatedAt: new Date().toISOString() };
    store.save(); return snapshot();
  },
  library(meta) {
    if (!meta || typeof meta.id !== 'string' || typeof meta.type !== 'string') throw new Error('Invalid title.');
    const exists = store.data.library.some(m => m.id === meta.id && m.type === meta.type);
    store.data.library = exists ? store.data.library.filter(m => m.id !== meta.id || m.type !== meta.type) : [...store.data.library, { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, description: meta.description }];
    store.save(); return snapshot();
  },
  settings(value) {
    const next = {};
    if (typeof value.subtitleLanguage === 'string' && value.subtitleLanguage.length < 30) next.subtitleLanguage = value.subtitleLanguage;
    for (const [key, min, max] of [['subtitleSize', 16, 72], ['subtitleDelay', -120, 120], ['volume', 0, 1]]) if (Number.isFinite(value[key])) next[key] = Math.max(min, Math.min(max, value[key]));
    if (value.torrentCacheMB !== undefined) {
      if (!Number.isInteger(value.torrentCacheMB) || value.torrentCacheMB < 256 || value.torrentCacheMB > 16384) throw new Error('Torrent cache limit must be between 256 and 16384 MB.');
      if (torrents.client) throw new Error('Stop P2P playback before changing its cache limit.');
      if (torrents.cache.size() > value.torrentCacheMB * 1024 ** 2) torrents.cache.clear();
      next.torrentCacheMB = value.torrentCacheMB;
    }
    store.data.settings = { ...store.data.settings, ...next }; store.save(); return snapshot();
  },
  async external({ url }) { await shell.openExternal(validURL(url)); },
  fullscreen: ({ enabled } = {}) => { window.setFullScreen(typeof enabled === 'boolean' ? enabled : !window.isFullScreen()); return window.isFullScreen(); },
  async notices() { return fs.readFileSync(path.join(app.getAppPath(), 'THIRD_PARTY_NOTICES.md'), 'utf8'); }
};
app.whenReady().then(async () => {
  store = new Store(app.getPath('userData')); media = await createMediaProxy();
  torrents = new TorrentEngine({ cacheDirectory: path.join(app.getPath('userData'), 'torrent-cache-v1'), localOnly: process.env.NYMORA_P2P_TEST_MODE === 'local-only' });
  playback = new Playback({ media, torrents, confirm: options => dialog.showMessageBox(window, options), cacheLimit: () => store.data.settings.torrentCacheMB * 1024 ** 2 });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Block remote attempts to navigate to local files or execute special protocols.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const scheme = new URL(details.url).protocol;
    let allowed = ['http:', 'https:', 'data:', 'blob:'].includes(scheme);
    if (scheme === 'file:') {
      try { const file = require('node:url').fileURLToPath(details.url); const relative = path.relative(path.join(app.getAppPath(), 'dist'), file); allowed = !relative.startsWith('..') && !path.isAbsolute(relative); } catch { allowed = false; }
    }
    callback({ cancel: !allowed });
  });
  window = new BrowserWindow({ title: 'Nymora', width: 1320, height: 860, minWidth: 940, minHeight: 640, backgroundColor: '#0c0e16', icon: path.join(app.getAppPath(), 'assets/icon.ico'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    window.webContents.send('prepare-close');
    setTimeout(() => { if (!window.isDestroyed()) { allowClose = true; window.close(); } }, 4000).unref();
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('nymora', async (event, operation, payload = {}) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !Object.hasOwn(operations, operation) || typeof operations[operation] !== 'function') return { error: 'Operation is not permitted.' };
    try {
      if (JSON.stringify(payload).length > 1024 * 1024) throw new Error('Request too large.');
      return { value: await operations[operation](payload) };
    } catch (error) { return { error: error.message || 'Something went wrong. Please retry.' }; }
  });
  window.webContents.on('render-process-gone', () => { dialog.showMessageBox({ type: 'error', title: 'Nymora', message: 'The interface stopped unexpectedly. Restart Nymora. Your saved data remains in the local data folder.' }); });
  await window.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
}).catch(error => { dialog.showErrorBox('Nymora startup failed', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting || !playback) return;
  event.preventDefault(); quitting = true;
  playback.close().finally(() => app.quit());
});
