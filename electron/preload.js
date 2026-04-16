const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  restartAndInstall: () => ipcRenderer.send('restart-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});