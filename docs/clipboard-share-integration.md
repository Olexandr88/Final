# Clipboard and Share Integration - User Guide

## Overview

The Clipboard and Share Integration provides universal clipboard operations and content sharing capabilities across browser, Electron, and Node.js environments. This integration implements modern web APIs (Async Clipboard API and Web Share API) with comprehensive fallbacks and native Electron support.

## Features

### Clipboard Manager

- **Cross-platform clipboard operations**: Works in browser, Electron desktop app, and Node.js
- **Text operations**: Copy/paste plain text with history tracking
- **Rich content**: Support for HTML and image data
- **History tracking**: Maintains last 10 clipboard operations
- **Multiple API support**: Async Clipboard API, Electron native clipboard, execCommand fallback
- **Silent mode**: Suppress logging for sensitive operations

### Share Manager

- **Web Share API integration**: Native sharing on supported platforms
- **Fallback mechanisms**: Automatic clipboard fallback when sharing unavailable
- **Multiple content types**: Share text, URLs, and files
- **Report export**: Format and share structured reports (text, HTML, JSON)
- **Specialized sharing**: Pre-built methods for training recommendations, code analysis, session summaries

### Electron Integration

- **Native clipboard access**: Direct access to system clipboard via Electron
- **Clipboard monitoring**: Real-time clipboard change detection
- **Multi-format support**: Text, HTML, RTF, images, bookmarks (macOS)
- **IPC bridge**: Secure communication between renderer and main process

---

## Quick Start

### Basic Usage (Browser/Node.js)

```javascript
import clipboardManager from './src/utils/clipboard-manager.js';
import shareManager from './src/utils/share-manager.js';

// Copy text
await clipboardManager.copy('Hello, World!');

// Paste text
const text = await clipboardManager.paste();

// Share content
await shareManager.shareText('Check this out!', 'My Title');
```

### Electron Usage

```javascript
// In Electron renderer process
const { electronAPI } = window;

// Copy via Electron API
await electronAPI.clipboard.writeText('Hello from Electron!');

// Read from clipboard
const result = await electronAPI.clipboard.readText();
console.log(result.data);

// Monitor clipboard changes
const unsubscribe = electronAPI.clipboard.onClipboardChange((data) => {
  console.log('Clipboard changed:', data.text);
});
```

---

## Installation

### 1. Copy Files

All files are already in place:
- `src/utils/clipboard-manager.js` - Core clipboard manager
- `src/utils/share-manager.js` - Share manager
- `electron/utils/electron-clipboard.js` - Electron native clipboard
- `electron/preload/clipboard-preload.js` - Electron preload bridge
- `electron/main/clipboard-handlers.js` - IPC handlers

### 2. Register Electron Handlers

In your Electron main process file (e.g., `electron/main.js`):

```javascript
const { app, BrowserWindow } = require('electron');
const { registerClipboardHandlers, cleanupClipboardHandlers } = require('./main/clipboard-handlers');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'clipboard-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Register clipboard IPC handlers
  registerClipboardHandlers(mainWindow);

  mainWindow.loadFile('index.html');
}

app.on('ready', createWindow);

app.on('will-quit', () => {
  cleanupClipboardHandlers();
});
```

### 3. No Dependencies Required

The clipboard and share managers use only native browser/Electron APIs with no external dependencies.

---

## API Reference

### ClipboardManager

#### `copy(text, options)`

Copy text to clipboard.

**Parameters:**
- `text` (string, required): Text to copy
- `options` (object, optional):
  - `silent` (boolean): Suppress logging (default: false)

**Returns:** `Promise<boolean>` - True if successful

**Example:**
```javascript
await clipboardManager.copy('Hello, World!');
await clipboardManager.copy('Secret data', { silent: true });
```

---

#### `copyHTML(html, plainText)`

Copy HTML content to clipboard with plain text fallback.

**Parameters:**
- `html` (string, required): HTML content
- `plainText` (string, optional): Plain text fallback

**Returns:** `Promise<boolean>` - True if successful

**Example:**
```javascript
await clipboardManager.copyHTML(
  '<p>Hello <strong>World</strong>!</p>',
  'Hello World!'
);
```

---

#### `copyImage(imageData)`

Copy image to clipboard.

**Parameters:**
- `imageData` (Blob | string, required): Image blob or base64 data URI

**Returns:** `Promise<boolean>` - True if successful

**Example:**
```javascript
// From data URI
await clipboardManager.copyImage('data:image/png;base64,iVBORw0KG...');

// From Blob
const response = await fetch('/image.png');
const blob = await response.blob();
await clipboardManager.copyImage(blob);
```

---

#### `paste()`

Paste text from clipboard.

**Returns:** `Promise<string>` - Clipboard text content

**Example:**
```javascript
const text = await clipboardManager.paste();
console.log('Pasted:', text);
```

---

#### `pasteHTML()`

Paste HTML content from clipboard.

**Returns:** `Promise<string>` - Clipboard HTML content

**Example:**
```javascript
const html = await clipboardManager.pasteHTML();
console.log('Pasted HTML:', html);
```

---

#### `getHistory(limit)`

Get clipboard history.

**Parameters:**
- `limit` (number, optional): Maximum items to return (default: 10)

**Returns:** `Array<Object>` - History entries with type, data, timestamp

**Example:**
```javascript
const history = clipboardManager.getHistory(5);
history.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.type} - ${entry.data.slice(0, 50)}`);
});
```

---

#### `clear()`

Clear clipboard.

**Returns:** `Promise<boolean>` - True if successful

**Example:**
```javascript
await clipboardManager.clear();
```

---

#### `clearHistory()`

Clear clipboard history.

**Example:**
```javascript
clipboardManager.clearHistory();
```

---

#### `isAvailable()`

Check if clipboard API is available.

**Returns:** `boolean` - True if available

**Example:**
```javascript
if (clipboardManager.isAvailable()) {
  await clipboardManager.copy('Available!');
}
```

---

#### `getCapabilities()`

Get clipboard capabilities.

**Returns:** `Object` - Capabilities object

**Example:**
```javascript
const caps = clipboardManager.getCapabilities();
console.log('Can copy HTML:', caps.copyHTML);
console.log('Can copy images:', caps.copyImage);
console.log('Is Electron:', caps.isElectron);
```

---

### ShareManager

#### `share(data)`

Share content using Web Share API or fallback.

**Parameters:**
- `data` (object, required):
  - `title` (string, optional): Title
  - `text` (string, optional): Text content
  - `url` (string, optional): URL to share
  - `files` (Array<File>, optional): Files to share

**Returns:** `Promise<Object>` - Share result with success, method, message

**Example:**
```javascript
const result = await shareManager.share({
  title: 'Check this out',
  text: 'Amazing content!',
  url: 'https://example.com'
});

if (result.success) {
  console.log(`Shared via ${result.method}`);
}
```

---

#### `canShare(data)`

Check if content can be shared.

**Parameters:**
- `data` (object, optional): Data to check

**Returns:** `boolean` - True if can share

**Example:**
```javascript
if (shareManager.canShare({ text: 'test' })) {
  await shareManager.shareText('test');
}
```

---

#### `shareText(text, title)`

Share plain text.

**Parameters:**
- `text` (string, required): Text to share
- `title` (string, optional): Title

**Returns:** `Promise<Object>` - Share result

**Example:**
```javascript
await shareManager.shareText('Hello, World!', 'Greeting');
```

---

#### `shareURL(url, title, text)`

Share URL.

**Parameters:**
- `url` (string, required): URL to share
- `title` (string, optional): Title
- `text` (string, optional): Description

**Returns:** `Promise<Object>` - Share result

**Example:**
```javascript
await shareManager.shareURL(
  'https://example.com',
  'Example Site',
  'Check out this website'
);
```

---

#### `shareFile(files, title, text)`

Share file(s).

**Parameters:**
- `files` (File | Array<File>, required): File(s) to share
- `title` (string, optional): Title
- `text` (string, optional): Description

**Returns:** `Promise<Object>` - Share result

**Example:**
```javascript
const file = new File(['content'], 'document.txt', { type: 'text/plain' });
await shareManager.shareFile(file, 'My Document');
```

---

#### `exportReport(reportData)`

Export formatted report.

**Parameters:**
- `reportData` (object, required):
  - `title` (string, required): Report title
  - `sections` (object, required): Report sections
  - `format` (string, optional): 'text', 'html', or 'json' (default: 'text')

**Returns:** `Promise<Object>` - Share result

**Example:**
```javascript
await shareManager.exportReport({
  title: 'Analysis Report',
  sections: {
    'Summary': 'All systems operational',
    'Metrics': { uptime: '99.9%', errors: 0 },
    'Recommendations': 'Continue monitoring'
  },
  format: 'html'
});
```

---

#### `shareTrainingRecommendations(recommendations, format)`

Share training recommendations from Microsoft Learn catalog.

**Parameters:**
- `recommendations` (Array<Object>, required): Training modules
- `format` (string, optional): Export format (default: 'text')

**Returns:** `Promise<Object>` - Share result

**Example:**
```javascript
const recommendations = [
  { title: 'Azure Basics', level: 'beginner', duration_minutes: 60, url: '...' },
  { title: 'Advanced AI', level: 'advanced', duration_minutes: 120, url: '...' }
];

await shareManager.shareTrainingRecommendations(recommendations, 'html');
```

---

#### `shareCodeAnalysis(analysis, format)`

Share code analysis results.

**Parameters:**
- `analysis` (object, required): Analysis results
- `format` (string, optional): Export format (default: 'text')

**Returns:** `Promise<Object>` - Share result

**Example:**
```javascript
const analysis = {
  summary: 'Code quality: Good',
  metrics: { complexity: 5, maintainability: 85 },
  issues: ['Consider adding more tests'],
  recommendations: ['Refactor function X']
};

await shareManager.shareCodeAnalysis(analysis);
```

---

#### `shareSessionSummary(session, format)`

Share AI session summary.

**Parameters:**
- `session` (object, required): Session data
- `format` (string, optional): Export format (default: 'text')

**Returns:** `Promise<Object>` - Share result

**Example:**
```javascript
const session = {
  id: 'session-123',
  title: 'Code Review Session',
  startTime: '2025-01-15T10:00:00Z',
  duration: '45 minutes',
  messages: [...],
  activities: ['Code reviewed', 'Tests written'],
  outcomes: ['All tests passing']
};

await shareManager.shareSessionSummary(session, 'json');
```

---

#### `getCapabilities()`

Get share capabilities.

**Returns:** `Object` - Capabilities object

**Example:**
```javascript
const caps = shareManager.getCapabilities();
console.log('Web Share API supported:', caps.webShareAPI);
console.log('Can share files:', caps.canShareFiles);
console.log('Fallback method:', caps.fallbackMethod);
```

---

## Electron API Reference

### Available via `window.electronAPI.clipboard`

All methods return `Promise<{ success: boolean, data?: any, error?: string }>`

- `writeText(text)` - Write text
- `readText()` - Read text
- `writeHTML(html)` - Write HTML
- `readHTML()` - Read HTML
- `writeImage(imageData)` - Write image (data URI or path)
- `readImage()` - Read image as data URI
- `writeRTF(rtf)` - Write RTF
- `readRTF()` - Read RTF
- `writeBookmark(title, url)` - Write bookmark (macOS only)
- `readBookmark()` - Read bookmark (macOS only)
- `clear()` - Clear clipboard
- `availableFormats()` - Get available formats
- `has(format)` - Check for specific format
- `getStats()` - Get clipboard statistics
- `writeMultiFormat(data)` - Write multiple formats
- `startWatching(interval)` - Start monitoring clipboard
- `stopWatching()` - Stop monitoring
- `onClipboardChange(callback)` - Listen for clipboard changes

---

## Usage Examples

### Example 1: Copy LLM Response

```javascript
import clipboardManager from './src/utils/clipboard-manager.js';

async function copyLLMResponse(response) {
  try {
    // Copy as HTML with plain text fallback
    const html = `<div class="llm-response">
      <h3>${response.title}</h3>
      <p>${response.content}</p>
      <footer>Generated by ${response.model}</footer>
    </div>`;

    const plainText = `${response.title}\n\n${response.content}\n\nGenerated by ${response.model}`;

    await clipboardManager.copyHTML(html, plainText);
    console.log('Response copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}
```

---

### Example 2: Share Training Progress

```javascript
import shareManager from './src/utils/share-manager.js';

async function shareProgress(userId) {
  const progress = await getTrainingProgress(userId);

  await shareManager.exportReport({
    title: 'My Training Progress',
    sections: {
      'Completed Modules': progress.completed.map(m => m.title),
      'In Progress': progress.inProgress.map(m => `${m.title} (${m.percent}%)`),
      'Total Hours': `${progress.totalHours} hours`,
      'Certificates Earned': progress.certificates
    },
    format: 'html'
  });
}
```

---

### Example 3: Electron Clipboard Monitoring

```javascript
// In Electron renderer process
const { electronAPI } = window;

// Start monitoring
await electronAPI.clipboard.startWatching(1000); // Check every 1 second

// Listen for changes
const unsubscribe = electronAPI.clipboard.onClipboardChange((data) => {
  console.log('Clipboard changed:');
  console.log('Text:', data.text);
  console.log('HTML:', data.html);
  console.log('Formats:', data.formats);
  console.log('Time:', data.timestamp);

  // Process clipboard data
  if (data.text.includes('http')) {
    console.log('URL detected in clipboard!');
  }
});

// Stop monitoring when done
// await electronAPI.clipboard.stopWatching();
// unsubscribe();
```

---

### Example 4: Multi-Format Clipboard

```javascript
const { electronAPI } = window;

// Write multiple formats simultaneously
await electronAPI.clipboard.writeMultiFormat({
  text: 'Hello, World!',
  html: '<p>Hello, <strong>World</strong>!</p>',
  rtf: '{\\rtf1 Hello, {\\b World}!}'
});

// Check available formats
const result = await electronAPI.clipboard.availableFormats();
console.log('Available formats:', result.data);

// Check for specific format
const hasHTML = await electronAPI.clipboard.has('text/html');
console.log('Has HTML:', hasHTML.data);
```

---

### Example 5: Code Analysis Sharing

```javascript
import { analyzeCode } from './code-analyzer.js';
import shareManager from './src/utils/share-manager.js';

async function analyzeAndShare(filePath) {
  const analysis = await analyzeCode(filePath);

  const result = await shareManager.shareCodeAnalysis({
    summary: `Analyzed ${filePath}`,
    metrics: {
      lines: analysis.lines,
      functions: analysis.functions,
      complexity: analysis.complexity
    },
    issues: analysis.issues,
    recommendations: analysis.recommendations
  }, 'html');

  if (result.success) {
    console.log(`Analysis shared via ${result.method}`);
  } else {
    console.log('Analysis copied to clipboard');
  }
}
```

---

## Integration with Framework

### AI Bridge Integration

The clipboard and share managers can be integrated with the AI Bridge for agent-to-agent operations:

```javascript
// In an agent
import clipboardManager from '../utils/clipboard-manager.js';
import shareManager from '../utils/share-manager.js';

class ClipboardAgent {
  async handleMessage(message) {
    if (message.type === 'copy_to_clipboard') {
      await clipboardManager.copy(message.data.text);
      return { success: true };
    }

    if (message.type === 'share_content') {
      const result = await shareManager.share(message.data);
      return result;
    }
  }
}
```

---

### Training Catalog Integration

Share training recommendations directly from the catalog:

```javascript
import { TrainingController } from './src/api/training-controller.js';
import shareManager from './src/utils/share-manager.js';

const controller = new TrainingController();

async function shareRecommendations(userId) {
  const result = await controller.getRecommendations({ userId, limit: 10 });

  await shareManager.shareTrainingRecommendations(
    result.data.recommendations,
    'html'
  );
}
```

---

## Browser Compatibility

### Clipboard Manager
- **Modern browsers**: Full support (Chrome 66+, Firefox 63+, Safari 13.1+)
- **Older browsers**: Fallback to `execCommand('copy')`
- **Electron**: Native clipboard access

### Share Manager
- **Web Share API**: Chrome 89+, Safari 12.1+, Edge 93+
- **Fallback**: Clipboard copy on unsupported browsers
- **Desktop**: Limited support (mainly mobile/PWA focus)

---

## Security Considerations

### Clipboard Access
- **User permission**: Some browsers require user gesture for clipboard write
- **HTTPS required**: Clipboard API requires secure context (HTTPS or localhost)
- **Privacy**: No automatic clipboard reading without user interaction

### Share API
- **User-initiated**: Share must be triggered by user action
- **File access**: Shared files don't grant permanent access
- **Cross-origin**: Share API respects same-origin policy

---

## Troubleshooting

### Issue: Clipboard write fails

**Solution:**
1. Ensure HTTPS or localhost
2. Trigger within user gesture (click, keypress)
3. Check browser permissions
4. Verify clipboard API support with `clipboardManager.isAvailable()`

---

### Issue: Share API not available

**Solution:**
1. Check with `shareManager.canShare()`
2. Use fallback: `shareManager.share()` automatically falls back to clipboard
3. Test on mobile device (better support)

---

### Issue: Electron clipboard not working

**Solution:**
1. Verify preload script loaded: Check `window.electronAPI` exists
2. Confirm IPC handlers registered in main process
3. Check Electron version (>= 12.0.0 recommended)
4. Review console for IPC errors

---

### Issue: Image clipboard fails

**Solution:**
1. Ensure image data is valid base64 or Blob
2. Check browser support: `clipboardManager.getCapabilities().copyImage`
3. For Electron, use data URI format
4. Verify image MIME type is supported

---

## Performance Optimization

### Best Practices

1. **Use silent mode for bulk operations**:
   ```javascript
   for (const item of items) {
     await clipboardManager.copy(item, { silent: true });
   }
   ```

2. **Batch history retrieval**:
   ```javascript
   const recent = clipboardManager.getHistory(5); // Limit results
   ```

3. **Clear history periodically**:
   ```javascript
   setInterval(() => {
     clipboardManager.clearHistory();
   }, 3600000); // Every hour
   ```

4. **Debounce clipboard monitoring** (Electron):
   ```javascript
   let debounceTimer;
   electronAPI.clipboard.onClipboardChange((data) => {
     clearTimeout(debounceTimer);
     debounceTimer = setTimeout(() => {
       processClipboardChange(data);
     }, 500);
   });
   ```

---

## Testing

### Run Tests

```bash
# All tests
npm test

# Specific tests
npm test tests/clipboard-manager.test.js
npm test tests/share-manager.test.js

# With coverage
npm run test:coverage
```

---

## License

ISC License - see LICENSE file for details.

---

**Last Updated**: 2025-01-15
**Version**: 1.0.0
**Maintainer**: scarmonit (scarmonit@gmail.com)
