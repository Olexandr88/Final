/**
 * Marketplace Electron Window
 * Creates and manages the marketplace UI window
 * @module marketplace/ui/marketplace-window
 */

import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let marketplaceWindow = null;

/**
 * Create marketplace window
 * @returns {BrowserWindow} Marketplace window instance
 */
export function createMarketplaceWindow() {
  if (marketplaceWindow && !marketplaceWindow.isDestroyed()) {
    marketplaceWindow.focus();
    return marketplaceWindow;
  }

  marketplaceWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'LLM Marketplace',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#ffffff',
    show: false, // Show after ready-to-show
  });

  // Load marketplace UI
  const marketplaceUrl = process.env.MARKETPLACE_UI_URL || 'http://localhost:65030';
  marketplaceWindow.loadURL(marketplaceUrl);

  // Show window when ready
  marketplaceWindow.once('ready-to-show', () => {
    marketplaceWindow.show();
    logger.info('Marketplace window shown');
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    marketplaceWindow.webContents.openDevTools();
  }

  // Handle window close
  marketplaceWindow.on('closed', () => {
    logger.info('Marketplace window closed');
    marketplaceWindow = null;
  });

  logger.info('Marketplace window created', { url: marketplaceUrl });

  return marketplaceWindow;
}

/**
 * Get marketplace window instance
 * @returns {BrowserWindow|null} Marketplace window or null
 */
export function getMarketplaceWindow() {
  return marketplaceWindow;
}

/**
 * Close marketplace window
 */
export function closeMarketplaceWindow() {
  if (marketplaceWindow && !marketplaceWindow.isDestroyed()) {
    marketplaceWindow.close();
  }
}

/**
 * Send message to marketplace window
 * @param {string} channel - IPC channel
 * @param {any} data - Data to send
 */
export function sendToMarketplace(channel, data) {
  if (marketplaceWindow && !marketplaceWindow.isDestroyed()) {
    marketplaceWindow.webContents.send(channel, data);
  }
}
