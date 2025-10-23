/**
 * Electron Preload Script
 * Secure bridge between main and renderer processes
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose safe APIs to renderer process
 * Using contextBridge for security (context isolation)
 */

contextBridge.exposeInMainWorld('electron', {
  /**
   * Window controls
   */
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  /**
   * File system operations (secure)
   */
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

  /**
   * Platform detection
   */
  platform: process.platform,

  /**
   * Environment info
   */
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});

/**
 * AI Bridge WebSocket API
 * Exposed separately for clarity
 */

contextBridge.exposeInMainWorld('aiBridge', {
  /**
   * Connect to AI Bridge
   * @param {string} url - WebSocket URL (default: ws://localhost:65028)
   * @returns {Promise<WebSocket>} Connected WebSocket instance
   */
  connect: (url = 'ws://localhost:65028') => {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('[AI Bridge] Connected to', url);
          resolve(ws);
        };

        ws.onerror = (error) => {
          console.error('[AI Bridge] Connection error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Send message to AI Bridge
   * @param {WebSocket} ws - WebSocket instance
   * @param {Object} message - Message object
   */
  send: (ws, message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.error('[AI Bridge] WebSocket not connected');
    }
  },

  /**
   * Close AI Bridge connection
   * @param {WebSocket} ws - WebSocket instance
   */
  close: (ws) => {
    if (ws) {
      ws.close();
    }
  }
});

/**
 * Monaco Editor environment configuration
 * Required for Monaco to work in Electron
 */

contextBridge.exposeInMainWorld('MonacoEnvironment', {
  getWorkerUrl: function (workerId, label) {
    return `./monaco-editor/min/vs/base/worker/workerMain.js`;
  }
});

/**
 * Development utilities
 */

if (process.argv.includes('--dev')) {
  contextBridge.exposeInMainWorld('dev', {
    log: (...args) => console.log('[DEV]', ...args),
    error: (...args) => console.error('[DEV]', ...args),
    reload: () => location.reload()
  });
}

/**
 * Security: Log all contextBridge exposures
 */

console.log('[Preload] Context bridge initialized');
console.log('[Preload] Exposed APIs:', ['electron', 'aiBridge', 'MonacoEnvironment']);
