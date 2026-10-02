'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nymora', {
  onClose(callback) { ipcRenderer.on('prepare-close', () => callback()); },
  async call(operation, payload) {
    const result = await ipcRenderer.invoke('nymora', operation, payload);
    if (result.error) throw new Error(result.error);
    return result.value;
  }
});
