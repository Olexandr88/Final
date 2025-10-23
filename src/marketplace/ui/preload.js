/**
 * Marketplace Preload Script
 * Exposes safe APIs to marketplace renderer process
 * @module marketplace/ui/preload
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose marketplace API to renderer
contextBridge.exposeInMainWorld('marketplace', {
  // Search packages
  search: (query, filters) => ipcRenderer.invoke('marketplace:search', query, filters),

  // Get package details
  getPackage: (id) => ipcRenderer.invoke('marketplace:get-package', id),

  // Get featured packages
  getFeatured: () => ipcRenderer.invoke('marketplace:get-featured'),

  // Get recent packages
  getRecent: () => ipcRenderer.invoke('marketplace:get-recent'),

  // Get installed packages
  getInstalled: () => ipcRenderer.invoke('marketplace:get-installed'),

  // Install package
  install: (packageId, version, config) =>
    ipcRenderer.invoke('marketplace:install', packageId, version, config),

  // Uninstall package
  uninstall: (packageId) => ipcRenderer.invoke('marketplace:uninstall', packageId),

  // Rate package
  rate: (packageId, userId, rating, review) =>
    ipcRenderer.invoke('marketplace:rate', packageId, userId, rating, review),

  // Get package stats
  getStats: (packageId) => ipcRenderer.invoke('marketplace:get-stats', packageId),

  // Event listeners
  on: (channel, callback) => {
    const validChannels = [
      'package-installed',
      'package-uninstalled',
      'installation-progress',
      'installation-error',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  // Remove event listener
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});

// Expose system info
contextBridge.exposeInMainWorld('system', {
  platform: process.platform,
  arch: process.arch,
  version: process.version,
});
