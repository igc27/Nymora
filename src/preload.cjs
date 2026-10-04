'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nymora', {
  startup: { intro: process.argv.includes('--nymora-intro=1'), sound: process.argv.includes('--nymora-sound=1') },
  onClose(callback) { ipcRenderer.on('prepare-close', () => callback()); },
  onP2PNotice(callback) { ipcRenderer.on('p2p-notice', (_event, notice) => callback(notice)); },
  onP2PNoticeDismiss(callback) { ipcRenderer.on('p2p-notice-dismiss', (_event, nonce) => callback(nonce)); },
  onFullscreen(callback) { ipcRenderer.on('fullscreen-changed', (_event, enabled) => callback(enabled)); },
  async call(operation, payload) {
    const result = await ipcRenderer.invoke('nymora', operation, payload);
    if (result.error) throw new Error(result.error);
    return result.value;
  }
});
