const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Session persistence
  getSession: () => ipcRenderer.invoke('get-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),

  // File operations
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  browseAeExe: () => ipcRenderer.invoke('browse-ae-exe'),
  openOutputFolder: (path) => ipcRenderer.invoke('open-output-folder', path),
  openFile: (path) => ipcRenderer.invoke('open-file', path),

  // Core pipeline
  analyzeMedia: (filePaths) => ipcRenderer.invoke('analyze-media', filePaths),
  generateProject: (data) => ipcRenderer.invoke('generate-project', data),
  exportJsxOnly: (data) => ipcRenderer.invoke('export-jsx-only', data),
  getTimelinePreview: (data) => ipcRenderer.invoke('get-timeline-preview', data),

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // Events from main process
  onBackendReady: (callback) => ipcRenderer.on('backend-ready', (_, ready) => callback(ready)),
  onPythonLog: (callback) => ipcRenderer.on('python-log', (_, msg) => callback(msg)),
  onPythonError: (callback) => ipcRenderer.on('python-error', (_, msg) => callback(msg))
});

