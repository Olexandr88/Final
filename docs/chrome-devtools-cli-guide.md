# Chrome DevTools for Claude Code CLI

## Overview

This guide explains how to use Chrome DevTools with Claude Code CLI via the Chrome DevTools Bridge. This integration allows Claude Code to interact with Chrome browser programmatically for testing, debugging, and automation.

## Architecture

```
Claude Code CLI → HTTP/curl → Chrome DevTools Bridge → MCP stdio → chrome-devtools-mcp → Chrome CDP → Chrome Browser
```

Components:

- **Chrome DevTools Bridge** (`src/chrome-devtools-bridge.js`): HTTP/WebSocket server that wraps the MCP protocol
- **chrome-devtools-mcp**: Official Google MCP server for Chrome DevTools Protocol
- **Chrome DevTools CLI** (`scripts/chrome-devtools-cli.js`): Command-line utilities for common operations

## Installation

Dependencies are already included in package.json:

- `express`: HTTP server
- `ws`: WebSocket server
- `commander`: CLI argument parsing
- `node-fetch`: HTTP client

The `chrome-devtools-mcp` package is automatically downloaded via `npx` when the bridge starts.

## Starting the Bridge

### Option 1: Start with npm script

```bash
npm run start:chrome-bridge
```

### Option 2: Start with environment variables

```bash
# Use existing Chrome instance
CHROME_BROWSER_URL=http://localhost:9222 npm run start:chrome-bridge

# Run in headless mode
CHROME_HEADLESS=true npm run start:chrome-bridge

# Use different Chrome channel
CHROME_CHANNEL=canary npm run start:chrome-bridge

# Custom ports
CHROME_BRIDGE_HTTP_PORT=65099 CHROME_BRIDGE_WS_PORT=65100 npm run start:chrome-bridge
```

### Option 3: Connect to existing Chrome with debugging port

First, launch Chrome with remote debugging:

```bash
# Windows
chrome.exe --remote-debugging-port=9222

# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

Then start the bridge:

```bash
CHROME_BROWSER_URL=http://localhost:9222 npm run start:chrome-bridge
```

## Available Chrome DevTools Tools

The bridge discovers 26 Chrome DevTools tools automatically:

### Navigation & Pages

- `navigate_page` - Navigate to a URL
- `navigate_page_history` - Go back/forward in history
- `new_page` - Open a new tab
- `close_page` - Close a tab
- `list_pages` - List all open tabs
- `select_page` - Switch to a specific tab

### User Interaction

- `click` - Click an element
- `fill` - Fill a form field
- `fill_form` - Fill multiple fields at once
- `hover` - Hover over an element
- `drag` - Drag and drop
- `upload_file` - Upload files to input fields

### Inspection & Debugging

- `take_screenshot` - Capture page screenshot
- `take_snapshot` - Get DOM snapshot
- `evaluate_script` - Execute JavaScript
- `list_console_messages` - Get console logs
- `list_network_requests` - Monitor network traffic
- `get_network_request` - Get specific request details
- `handle_dialog` - Handle alerts/confirms/prompts

### Performance

- `performance_start_trace` - Begin performance trace
- `performance_stop_trace` - End performance trace
- `performance_analyze_insight` - Get performance insights
- `emulate_cpu` - Throttle CPU
- `emulate_network` - Simulate network conditions

### Utilities

- `resize_page` - Change viewport size
- `wait_for` - Wait for elements/conditions

## Using the CLI

### Basic Commands

```bash
# Check if bridge is running
npm run chrome health

# List all available tools
npm run chrome tools

# Navigate to a URL
npm run chrome navigate https://example.com

# Take a screenshot
npm run chrome screenshot
npm run chrome screenshot --fullPage
npm run chrome screenshot my-screenshot.png

# Click an element
npm run chrome click "#submit-button"

# Fill a form field
npm run chrome fill "#email" "test@example.com"

# Execute JavaScript
npm run chrome eval "document.title"
npm run chrome eval "window.location.href"

# Get console messages
npm run chrome console
```

### Advanced Commands

```bash
# Call any tool directly
npm run chrome call navigate_page '{"url": "https://google.com"}'
npm run chrome call take_screenshot '{"fullPage": true}'
npm run chrome call fill_form '{"fields": [{"selector": "#email", "value": "test@example.com"}]}'

# Using key-value args instead of JSON
npm run chrome call navigate_page --url https://example.com
npm run chrome call click --selector "#button"
```

## HTTP API Usage

### Health Check

```bash
curl http://localhost:65030/health
```

Response:

```json
{
  "status": "ok",
  "initialized": true,
  "tools": 26
}
```

### List Tools

```bash
curl http://localhost:65030/tools
```

Response:

```json
{
  "tools": [
    {
      "name": "navigate_page",
      "description": "Navigate to a URL",
      "inputSchema": {...}
    },
    ...
  ]
}
```

### Call a Tool

```bash
# Navigate
curl -X POST http://localhost:65030/tools/navigate_page \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Take screenshot
curl -X POST http://localhost:65030/tools/take_screenshot \
  -H "Content-Type: application/json" \
  -d '{"fullPage": true}' \
  -o screenshot.png

# Click element
curl -X POST http://localhost:65030/tools/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "#submit"}'

# Execute JavaScript
curl -X POST http://localhost:65030/tools/evaluate_script \
  -H "Content-Type: application/json" \
  -d '{"script": "return document.title;"}'
```

### Shortcut Endpoints

```bash
# Navigate (shortcut)
curl -X POST http://localhost:65030/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Screenshot (shortcut)
curl -X POST http://localhost:65030/screenshot \
  -H "Content-Type: application/json" \
  -d '{}'

# Click (shortcut)
curl -X POST http://localhost:65030/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "#button"}'

# Evaluate (shortcut)
curl -X POST http://localhost:65030/evaluate \
  -H "Content-Type: application/json" \
  -d '{"script": "console.log(\"hello\")"}'
```

## WebSocket API Usage

Connect to `ws://localhost:65031` and send JSON messages:

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:65031');

ws.on('open', () => {
  // Navigate to a page
  ws.send(
    JSON.stringify({
      tool: 'navigate_page',
      args: { url: 'https://example.com' },
    })
  );
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('Result:', response);
});
```

## Integration with Claude Code

### From Claude Code CLI

Claude Code can now use Chrome DevTools by making HTTP requests:

```bash
# In Claude Code session, execute:
curl -X POST http://localhost:65030/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com"}'
```

### Programmatic Usage

```javascript
import ChromeDevToolsBridge from './src/chrome-devtools-bridge.js';

const bridge = new ChromeDevToolsBridge({
  httpPort: 65030,
  wsPort: 65031,
  headless: true,
});

await bridge.start();

// Call a tool
const result = await bridge.callTool('navigate_page', {
  url: 'https://example.com',
});

console.log(result);
```

## Common Use Cases

### Test a Web Application

```bash
# Start bridge
npm run start:chrome-bridge

# Navigate to app
npm run chrome navigate http://localhost:3000

# Fill login form
npm run chrome fill "#username" "testuser"
npm run chrome fill "#password" "testpass"

# Click login button
npm run chrome click "#login-btn"

# Wait for dashboard
npm run chrome call wait_for '{"selector": "#dashboard"}'

# Take screenshot of result
npm run chrome screenshot dashboard.png
```

### Monitor Network Performance

```bash
# Start performance trace
npm run chrome call performance_start_trace '{}'

# Navigate to page
npm run chrome navigate https://example.com

# Stop trace and get results
npm run chrome call performance_stop_trace '{}'

# Analyze insights
npm run chrome call performance_analyze_insight '{}'
```

### Scrape Dynamic Content

```bash
# Navigate to page
npm run chrome navigate https://news.ycombinator.com

# Execute JavaScript to extract data
npm run chrome eval "Array.from(document.querySelectorAll('.athing')).map(el => el.innerText).slice(0, 5)"

# Get console messages (if any)
npm run chrome console
```

## Troubleshooting

### Bridge won't start

```bash
# Check if ports are already in use
netstat -ano | findstr "65030"
netstat -ano | findstr "65031"

# Kill processes using those ports
taskkill /PID <pid> /F

# Try again
npm run start:chrome-bridge
```

### "spawn npx ENOENT" error

This is a Windows path issue. The bridge automatically detects Windows and uses `npx.cmd` with shell mode.

If still failing, install chrome-devtools-mcp globally:

```bash
npm install -g chrome-devtools-mcp
```

### Chrome won't launch

```bash
# Specify Chrome executable path
CHROME_EXECUTABLE_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" npm run start:chrome-bridge

# Or use Canary/Beta/Dev
CHROME_CHANNEL=canary npm run start:chrome-bridge
```

### Tools not working

```bash
# Check health
npm run chrome health

# List discovered tools
npm run chrome tools

# Check bridge logs
# The bridge logs to console with Winston logger
```

## Configuration Options

Environment variables for the bridge:

| Variable                  | Default     | Description                                                |
| ------------------------- | ----------- | ---------------------------------------------------------- |
| `CHROME_BRIDGE_HTTP_PORT` | `65030`     | HTTP API port                                              |
| `CHROME_BRIDGE_WS_PORT`   | `65031`     | WebSocket port                                             |
| `CHROME_BROWSER_URL`      | `null`      | Connect to existing Chrome (e.g., `http://localhost:9222`) |
| `CHROME_HEADLESS`         | `false`     | Run Chrome in headless mode                                |
| `CHROME_CHANNEL`          | `stable`    | Chrome channel (`stable`, `beta`, `dev`, `canary`)         |
| `CHROME_VIEWPORT`         | `null`      | Initial viewport size (e.g., `1280x720`)                   |
| `CHROME_EXECUTABLE_PATH`  | Auto-detect | Path to Chrome executable                                  |

## Performance Tips

1. **Reuse Chrome instance**: Start Chrome once with `--remote-debugging-port=9222`, then connect bridge to it
2. **Headless mode**: Use `CHROME_HEADLESS=true` for CI/CD or when GUI not needed
3. **Viewport size**: Set appropriate viewport to reduce memory usage
4. **Close unused tabs**: Use `close_page` to clean up tabs
5. **Batch operations**: Use WebSocket for multiple sequential commands

## Security Considerations

- **Local only**: Bridge listens on `localhost` by default
- **No authentication**: Add authentication layer for production use
- **Chrome debugging**: Remote debugging port allows full Chrome control
- **Sandboxing**: Run Chrome with `--no-sandbox` only if absolutely necessary

## Examples

### Example 1: Automated Testing

```bash
#!/bin/bash
# test-login.sh

# Start bridge in background
npm run start:chrome-bridge &
BRIDGE_PID=$!

sleep 5

# Run tests
npm run chrome navigate http://localhost:3000/login
npm run chrome fill "#email" "test@example.com"
npm run chrome fill "#password" "password123"
npm run chrome click "#submit"
npm run chrome call wait_for '{"selector": ".dashboard"}'
npm run chrome screenshot test-result.png

# Cleanup
kill $BRIDGE_PID
```

### Example 2: Performance Analysis

```javascript
import fetch from 'node-fetch';

const BRIDGE = 'http://localhost:65030';

async function analyzePerformance(url) {
  // Start trace
  await fetch(`${BRIDGE}/tools/performance_start_trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  // Navigate
  await fetch(`${BRIDGE}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  // Wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Stop trace
  const trace = await fetch(`${BRIDGE}/tools/performance_stop_trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json());

  console.log('Performance metrics:', trace);
}

analyzePerformance('https://example.com');
```

## Related Documentation

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [chrome-devtools-mcp on GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## Support

For issues or questions:

- Check bridge logs for errors
- Ensure Chrome and bridge are both running
- Verify network connectivity to localhost ports
- Report issues to the project repository

---

**Status**: ✅ Fully implemented and tested
**Last Updated**: 2025-10-20
**Version**: 1.0.0
