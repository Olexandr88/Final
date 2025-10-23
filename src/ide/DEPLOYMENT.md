# LLM Framework IDE - Deployment Guide

Complete guide for deploying the Visual Studio-inspired IDE with AI capabilities.

## Quick Start

```bash
# 1. Install dependencies
cd src/ide
npm install

# 2. Start AI Bridge (required for AI features)
cd ../..
npm run start:bridge

# 3. (Optional) Start in development mode
cd src/ide
npm run dev
```

## Prerequisites

### Required
- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **Git**: Latest version

### Optional (for AI features)
- **AI Bridge**: Running on `ws://localhost:65028`
- **Claude Agent**: For AI-powered completions
- **Ollama Agent**: For local LLM support

## Installation

### Step 1: Clone Repository

```bash
git clone https://github.com/Scarmonit/LLM.git
cd LLM
```

### Step 2: Install Root Dependencies

```bash
npm install
```

### Step 3: Install IDE Dependencies

```bash
cd src/ide
npm install
```

Expected output:
```
added 7 packages, and audited 8 packages in 11s
found 0 vulnerabilities
```

## AI Bridge Setup

The IDE requires the AI Bridge for intelligent features.

### Start AI Bridge

```bash
# From project root
npm run start:bridge
```

Expected output:
```
========================================
   AI Bridge Server v1.1.0
========================================
  WebSocket: ws://localhost:65028
  HTTP API:  http://localhost:65029

  Health:    http://localhost:65029/health
  Status:    http://localhost:65029/api/status
========================================

[Bridge] Waiting for agents to connect…
```

### Start Agents (Optional)

```bash
# Claude agent (recommended)
npm run agent:claude

# Ollama agent (local LLM)
npm run agent:ollama

# Code analyzer agent
npm run agent:analyzer
```

## Development Mode

### Option 1: Electron Development (Recommended)

```bash
cd src/ide
npm run dev
```

This starts the IDE in Electron with:
- Hot reloading
- DevTools enabled
- Source maps
- Debug mode

### Option 2: Web Development

```bash
cd src/ide
npm run build:react
npm run serve
```

Opens at `http://localhost:3000`

## Building for Production

### Step 1: Build Monaco Editor

```bash
cd src/ide
npm run build:monaco
```

Downloads and configures Monaco Editor (~15MB):
- Language workers (JS, TS, JSON, CSS, HTML)
- Editor core
- Themes
- IntelliSense providers

### Step 2: Build React Application

```bash
npm run build:react
```

Creates optimized production build:
- Minified JavaScript
- Optimized CSS
- Source maps
- Chunk splitting

### Step 3: Package Electron App

```bash
# Windows
npm run package

# macOS
npm run package:mac

# Linux
npm run package:linux

# All platforms
npm run package:all
```

## Build Outputs

### Development Build

```
src/ide/dist/
├── bundle.js        # Development bundle
├── bundle.js.map    # Source maps
└── index.html       # HTML entry point
```

### Production Build

```
src/ide/dist/
├── main.js          # Electron main process
├── preload.js       # Preload script
├── renderer.js      # React application (minified)
├── styles.css       # Compiled styles
├── monaco-editor/   # Monaco editor assets
└── assets/          # Images, fonts, etc.
```

### Electron Package

```
src/ide/release/
├── win-unpacked/           # Windows executable
│   └── LLM Framework IDE.exe
├── mac/                    # macOS app bundle
│   └── LLM Framework IDE.app
├── linux-unpacked/         # Linux executable
│   └── llm-framework-ide
└── installers/             # Platform installers
    ├── LLM-Framework-IDE-Setup-1.0.0.exe  # Windows installer
    ├── LLM-Framework-IDE-1.0.0.dmg         # macOS disk image
    └── LLM-Framework-IDE-1.0.0.AppImage    # Linux AppImage
```

## Configuration

### Environment Variables

Create `.env` file in `src/ide/`:

```bash
# AI Bridge Configuration
AI_BRIDGE_URL=ws://localhost:65028
AI_BRIDGE_TIMEOUT=30000

# Monaco Editor
MONACO_THEME=llm-dark
MONACO_FONT_SIZE=14
MONACO_TAB_SIZE=2

# Feature Flags
ENABLE_AI_COMPLETIONS=true
ENABLE_AI_DIAGNOSTICS=true
ENABLE_AI_REFACTORING=true
ENABLE_DOC_GENERATION=true

# Performance
COMPLETION_DEBOUNCE=300
CACHE_TTL=60000
MAX_CONCURRENT_REQUESTS=5
```

### package.json Configuration

Key fields in `src/ide/package.json`:

```json
{
  "name": "llm-framework-ide",
  "version": "1.0.0",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "dev": "electron . --dev",
    "start": "electron .",
    "build": "npm run build:monaco && npm run build:react",
    "package": "electron-builder --win --x64"
  },
  "dependencies": {
    "monaco-editor": "^0.45.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "electron": "^28.1.0",
    "electron-builder": "^24.9.1",
    "webpack": "^5.89.0"
  }
}
```

## Electron Configuration

### main.js

Create `src/ide/main.js`:

```javascript
import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Custom title bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('dist/index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

### preload.js

Create `src/ide/preload.js`:

```javascript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
});
```

## Testing

### Unit Tests

```bash
npm test
```

Runs Jest tests for:
- Monaco core functionality
- AI integration
- IntelliSense providers
- UI components

### Integration Tests

```bash
npm run test:integration
```

Tests end-to-end workflows:
- File opening and editing
- AI completion requests
- Theme switching
- Panel management

### E2E Tests

```bash
npm run test:e2e
```

Uses Playwright for browser automation:
- Full user workflows
- Performance benchmarks
- Screenshot comparisons

## Performance Optimization

### Monaco Editor

```javascript
// Lazy load Monaco
const monaco = await import('monaco-editor');

// Use web workers
window.MonacoEnvironment = {
  getWorkerUrl: (workerId, label) => {
    return `monaco-editor/min/vs/${label}.worker.js`;
  }
};
```

### AI Integration

```javascript
// Debounce completions
const COMPLETION_DEBOUNCE = 300; // ms

// Cache responses
const CACHE_TTL = 60000; // 1 minute

// Limit concurrent requests
const MAX_CONCURRENT = 5;
```

### Memory Management

```javascript
// Dispose unused editors
editor.dispose();

// Clear unused models
model.dispose();

// Limit undo history
editor.updateOptions({
  maxUndo: 50
});
```

## Troubleshooting

### Issue: Monaco Editor not loading

**Solution:**
```bash
# Rebuild Monaco
npm run build:monaco

# Clear cache
rm -rf node_modules/.cache

# Reinstall
npm ci
```

### Issue: AI Bridge connection failed

**Solution:**
```bash
# Check AI Bridge status
curl http://localhost:65029/health

# Restart AI Bridge
npm run start:bridge

# Check WebSocket port
netstat -ano | grep 65028
```

### Issue: Build fails

**Solution:**
```bash
# Clear build artifacts
rm -rf dist/

# Update dependencies
npm update

# Rebuild
npm run build
```

### Issue: Electron won't start

**Solution:**
```bash
# Check Electron version
npx electron --version

# Rebuild native modules
npm rebuild

# Clear Electron cache
rm -rf ~/.electron
```

## Security Considerations

### Electron Security

```javascript
// ✅ Context isolation enabled
contextIsolation: true

// ✅ Node integration disabled
nodeIntegration: false

// ✅ Use preload scripts
preload: path.join(__dirname, 'preload.js')

// ✅ Content Security Policy
<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
```

### AI Integration Security

```javascript
// ✅ Sanitize code before sending
const sanitized = sanitizeCode(userInput);

// ✅ Rate limiting
const limiter = new RateLimiter({ max: 100, window: 60000 });

// ✅ User consent for data sharing
if (await getUserConsent()) {
  sendToAI(code);
}
```

## Monitoring & Logging

### Application Logs

```bash
# View logs
tail -f logs/ide.log

# Electron logs (development)
# Automatically printed to console

# Production logs
# Windows: %APPDATA%/llm-framework-ide/logs
# macOS: ~/Library/Logs/llm-framework-ide
# Linux: ~/.config/llm-framework-ide/logs
```

### Performance Metrics

```javascript
// Collect metrics
const metrics = {
  editorLoadTime: performance.now(),
  aiResponseTime: await measureAIResponse(),
  memoryUsage: process.memoryUsage(),
  cpuUsage: process.cpuUsage()
};

// Send to analytics
analytics.track('ide-performance', metrics);
```

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] No console errors
- [ ] AI Bridge tested
- [ ] Performance benchmarks met
- [ ] Security audit complete
- [ ] Documentation updated

### Build

- [ ] Monaco editor built
- [ ] React application built
- [ ] Electron packaged
- [ ] Installers created

### Post-Deployment

- [ ] Install and test on clean machine
- [ ] Verify AI features work
- [ ] Check for memory leaks
- [ ] Monitor error logs
- [ ] User acceptance testing

## Support

### Documentation
- [Architecture](./ide-architecture.md)
- [README](./README.md)
- [Main Project](../../CLAUDE.md)

### Issues
- GitHub: https://github.com/Scarmonit/LLM/issues
- Email: scarmonit@gmail.com

### Community
- Discussions: https://github.com/Scarmonit/LLM/discussions

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
**Status**: Production Ready ✅
