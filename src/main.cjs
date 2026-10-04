'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, session, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
const addons = require('./addons.cjs');
const { validURL, boundedText, configureTransport } = require('./network.cjs');
const { chromiumTransport } = require('./chromium-http.cjs');
const { parseSubtitles } = require('./subtitles.cjs');
const { createMediaProxy } = require('./media.cjs');
const { TorrentEngine } = require('./torrent-engine.cjs');
const { Playback } = require('./playback.cjs');
const { P2PConsent } = require('./consent.cjs');
const { playableResults, classify } = require('./stream-classification.cjs');
const { StreamQueries } = require('./stream-queries.cjs');
const streamQueries = new StreamQueries();
let store, media, playback, torrents, consent, window, allowClose = false, quitting = false, requestedFullscreen = false;
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
  async streams({ type, id }) { return playableResults(await addons.aggregate(store.data.addons, 'stream', type, id)); },
  streamsStart: query => streamQueries.start(store.data.addons, query),
  streamsState: ({ key }) => streamQueries.read(key),
  streamsCancel: ({ key }) => streamQueries.cancel(key),
  copyAddonDiagnostics: ({ key }) => { const value = streamQueries.diagnostics(key); clipboard.writeText(JSON.stringify(value, null, 2)); return value; },
  subtitles: ({ type, id, extra }) => addons.aggregate(store.data.addons, 'subtitles', type, id, extra || {}),
  subtitleFile: async ({ url }) => parseSubtitles(await boundedText(validURL(url), 4 * 1024 * 1024)),
  async localSubtitle() {
    const selected = await dialog.showOpenDialog(window, { title: 'Open subtitle file', properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] }] });
    if (selected.canceled) return null;
    const file = selected.filePaths[0];
    if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('Subtitle file is too large.');
    return { name: path.basename(file), cues: parseSubtitles(fs.readFileSync(file, 'utf8')) };
  },
  source: stream => { if (!['http', 'p2p'].includes(classify(stream))) throw new Error('This addon entry is informational or unsupported. Choose a playable source.'); return playback.source(stream); },
  stop: () => { consent.cancel(); return playback.stop(); },
  p2pNoticeAnswer: answer => consent.answer(answer),
  resetP2PNotice: () => { consent.reset(); return snapshot(); },
  playbackStatus: () => playback.status(),
  copyP2PDiagnostics: () => { const value = torrents.diagnostics(); clipboard.writeText(JSON.stringify(value, null, 2)); return value; },
  cacheSummary: () => ({ bytes: torrents.cache.size(), limitMB: store.data.settings.torrentCacheMB, active: !!torrents.client }),
  clearTorrentCache: () => { const removedBytes = torrents.cache.clearInactive(); return { removedBytes, bytes: torrents.cache.size() }; },
  recentSearch({ term, remove, clear } = {}) {
    let history = Array.isArray(store.data.searchHistory) ? store.data.searchHistory : [];
    if (clear === true) history = [];
    else if (typeof term === 'string' && term.trim().length <= 500) {
      const query = term.trim(); history = history.filter(s => s.toLocaleLowerCase() !== query.toLocaleLowerCase());
      if (query && remove !== true) history.unshift(query);
    }
    store.data.searchHistory = history.slice(0, 20); store.save(); return snapshot();
  },
  dismissContinuing({ key, undo, reset } = {}) {
    const keys = Array.isArray(store.data.dismissedContinuing) ? store.data.dismissedContinuing : [];
    if (reset === true) store.data.dismissedContinuing = [];
    else {
      if (typeof key !== 'string' || !Object.hasOwn(store.data.progress, key)) throw new Error('Unknown playback entry.');
      store.data.dismissedContinuing = undo === true ? keys.filter(k => k !== key) : [...new Set([...keys, key])].slice(-2000);
    }
    store.save(); return snapshot();
  },
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
    store.data.library = exists ? store.data.library.filter(m => m.id !== meta.id || m.type !== meta.type) : [...store.data.library, { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background || meta.backdrop, runtime: meta.runtime, releaseInfo: meta.releaseInfo || meta.year, imdbRating: meta.imdbRating, genres: meta.genres, description: meta.description }];
    store.save(); return snapshot();
  },
  settings(value) {
    const next = {};
    for (const [key, options] of Object.entries({ posterStyle: ['portrait', 'landscape'], interfaceStyle: ['classic', 'glass'], subtitleAppearance: ['shadow', 'outline', 'box'], p2pWaitMode: ['patient', '5m', '10m', 'none'] })) {
      if (value[key] !== undefined) { if (!options.includes(value[key])) throw new Error('Invalid preference.'); next[key] = value[key]; }
    }
    for (const key of ['startupIntro', 'startupSound']) if (typeof value[key] === 'boolean') next[key] = value[key];
    if (typeof value.audioLanguage === 'string' && /^[a-z-]{0,20}$/i.test(value.audioLanguage)) next.audioLanguage = value.audioLanguage;
    if (typeof value.blurEpisodeThumbnails === 'boolean') next.blurEpisodeThumbnails = value.blurEpisodeThumbnails;
    for (const key of ['homeCatalogOrder', 'hiddenCatalogs']) {
      if (value[key] !== undefined) {
        if (!Array.isArray(value[key]) || value[key].length > 2000 || value[key].some(v => typeof v !== 'string' || v.length > 1000)) throw new Error('Invalid catalog layout.');
        next[key] = [...new Set(value[key])];
      }
    }
    if (typeof value.subtitleLanguage === 'string' && value.subtitleLanguage.length < 30) next.subtitleLanguage = value.subtitleLanguage;
    for (const [key, min, max] of [['subtitleSize', 16, 72], ['subtitleDelay', -120, 120], ['volume', 0, 1]]) if (Number.isFinite(value[key])) next[key] = Math.max(min, Math.min(max, value[key]));
    if (value.torrentCacheMB !== undefined) {
      if (!Number.isInteger(value.torrentCacheMB) || value.torrentCacheMB < 256 || value.torrentCacheMB > 16384) throw new Error('Torrent cache limit must be between 256 and 16384 MB.');
      if (torrents.client) throw new Error('Stop P2P playback before changing its cache limit.');
      torrents.cache.enforce(value.torrentCacheMB * 1024 ** 2);
      next.torrentCacheMB = value.torrentCacheMB;
    }
    store.data.settings = { ...store.data.settings, ...next }; store.save(); return snapshot();
  },
  async external({ url }) { await shell.openExternal(validURL(url)); },
  fullscreen: ({ enabled } = {}) => { requestedFullscreen = typeof enabled === 'boolean' ? enabled : !requestedFullscreen; window.setFullScreen(requestedFullscreen); return requestedFullscreen; },
  windowControl({ action }) { if (action === 'minimize') window.minimize(); else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize(); else if (action === 'close') window.close(); },
  async notices() { return fs.readFileSync(path.join(app.getAppPath(), 'THIRD_PARTY_NOTICES.md'), 'utf8'); }
};
app.whenReady().then(async () => {
  const addonSession = session.fromPartition('nymora-addon-http', { cache: false });
  configureTransport(chromiumTransport(addonSession));
  store = new Store(app.getPath('userData')); media = await createMediaProxy();
  torrents = new TorrentEngine({ cacheDirectory: path.join(app.getPath('userData'), 'torrent-cache-v1'), helperPath: app.isPackaged ? path.join(process.resourcesPath, 'torrent-engine', 'nymora-torrent-helper.exe') : undefined, localOnly: process.env.NYMORA_P2P_TEST_MODE === 'local-only' });
  torrents.waitPolicy = () => store.data.settings.p2pWaitMode;
  torrents.cache.enforce(store.data.settings.torrentCacheMB * 1024 ** 2);
  await torrents.initialize().catch(() => {});
  consent = new P2PConsent({ store, show: notice => window.webContents.send('p2p-notice', notice), dismiss: nonce => window.webContents.send('p2p-notice-dismiss', nonce) });
  playback = new Playback({ media, torrents, confirm: options => consent.confirm(options), cacheLimit: () => store.data.settings.torrentCacheMB * 1024 ** 2 });
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
  window = new BrowserWindow({ title: 'Nymora', frame: false, fullscreenable: true, width: 1320, height: 860, minWidth: 940, minHeight: 640, backgroundColor: '#0c0e16', icon: path.join(app.getAppPath(), 'assets/icon.ico'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && (requestedFullscreen || window.isFullScreen())) { requestedFullscreen = false; window.setFullScreen(false); }
  });
  window.on('enter-full-screen', () => {
    window.webContents.send('fullscreen-changed', true);
    // Windows may defer entering fullscreen. Honor Escape received during it.
    if (!requestedFullscreen) setImmediate(() => { if (!window.isDestroyed()) window.setFullScreen(false); });
  });
  window.on('leave-full-screen', () => { requestedFullscreen = false; window.webContents.send('fullscreen-changed', false); });
  window.on('close', event => {
    consent.cancel();
    streamQueries.cancelAll();
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
  window.webContents.on('render-process-gone', () => { consent.cancel(); playback.stop().catch(() => {}); dialog.showMessageBox({ type: 'error', title: 'Nymora', message: 'The interface stopped unexpectedly. Restart Nymora. Your saved data remains in the local data folder.' }); });
  await window.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
}).catch(error => { dialog.showErrorBox('Nymora startup failed', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting || !playback) return;
  event.preventDefault(); quitting = true;
  consent.cancel();
  playback.close().finally(() => app.quit());
});
