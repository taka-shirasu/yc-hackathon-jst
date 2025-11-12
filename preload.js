const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getMicrophonePermission: () => ipcRenderer.invoke('get-microphone-permission'),
});

