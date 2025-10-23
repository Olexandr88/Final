/**
 * Electron Main Process
 * LLM Framework IDE - Main Window Manager
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

/**
 * Create the main IDE window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Custom title bar
    backgroundColor: '#1E1E1E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    },
    show: false // Show after ready-to-show
  });

  // Load the IDE
  const isDev = process.argv.includes('--dev');

  if (isDev) {
    // Development mode - load from webpack dev server if available
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window events
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Development error handling
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

/**
 * App lifecycle events
 */

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, recreate window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC Handlers - Window Controls
 */

ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

/**
 * IPC Handlers - File System (secure)
 */

ipcMain.handle('read-file', async (event, filePath) => {
  // TODO: Implement secure file reading with user permission
  console.log('File read requested:', filePath);
  return { error: 'Not implemented yet' };
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  // TODO: Implement secure file writing with user permission
  console.log('File write requested:', filePath);
  return { error: 'Not implemented yet' };
});

/**
 * Error handling
 */

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

/**
 * Security
 */

app.on('web-contents-created', (event, contents) => {
  // Prevent navigation to external URLs
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    // Allow file:// protocol only
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      console.warn('Navigation blocked:', navigationUrl);
    }
  });

  // Prevent opening new windows
  contents.setWindowOpenHandler(({ url }) => {
    console.warn('New window blocked:', url);
    return { action: 'deny' };
  });
});
