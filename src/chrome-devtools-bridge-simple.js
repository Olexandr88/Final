#!/usr/bin/env node
/**
 * Chrome DevTools MCP Bridge - Simplified HTTP version
 * Uses native Node.js HTTP server for better compatibility
 */

import { spawn } from 'child_process';
import http from 'http';
import { WebSocketServer } from 'ws';
import { logger } from './utils/logger.js';
import { fileURLToPath } from 'url';

const HTTP_PORT = process.env.CHROME_BRIDGE_HTTP_PORT || 9900;
const WS_PORT = process.env.CHROME_BRIDGE_WS_PORT || 65031;

let mcpProcess = null;
let requestId = 0;
const pendingRequests = new Map();
let mcpTools = [];
let initialized = false;

/**
 * Send MCP JSON-RPC request
 */
async function sendMcpRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = { jsonrpc: '2.0', id, method, params };

    pendingRequests.set(id, { resolve, reject });
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request timeout`));
      }
    }, 30000);
  });
}

/**
 * Handle MCP messages
 */
function handleMcpMessage(message) {
  if (message.id && pendingRequests.has(message.id)) {
    const { resolve, reject } = pendingRequests.get(message.id);
    pendingRequests.delete(message.id);

    if (message.error) {
      reject(new Error(message.error.message || 'MCP error'));
    } else {
      resolve(message.result);
    }
  }
}

/**
 * Start chrome-devtools-mcp
 */
async function startMcp() {
  return new Promise((resolve, reject) => {
    const args = ['-y', 'chrome-devtools-mcp@latest', '--channel', 'stable'];
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    mcpProcess = spawn(npxCommand, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      shell: process.platform === 'win32',
    });

    let buffer = '';
    mcpProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            handleMcpMessage(message);
          } catch (error) {
            // Not JSON, likely log output
          }
        }
      }
    });

    mcpProcess.on('error', reject);
    setTimeout(() => resolve(), 1000);
  });
}

/**
 * Initialize MCP
 */
async function initializeMcp() {
  await sendMcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    clientInfo: { name: 'chrome-devtools-bridge', version: '1.0.0' },
  });

  // Send notification (no response expected)
  mcpProcess.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }) + '\n'
  );

  const result = await sendMcpRequest('tools/list');
  mcpTools = result.tools || [];
  initialized = true;

  logger.info(`Discovered ${mcpTools.length} tools`);
}

/**
 * Call tool
 */
async function callTool(toolName, args = {}) {
  const result = await sendMcpRequest('tools/call', {
    name: toolName,
    arguments: args,
  });
  return result;
}

/**
 * HTTP server
 */
const server = http.createServer(async (req, res) => {
  // Parse request
  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Health endpoint
    if (url.pathname === '/health') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: 'ok',
          initialized,
          tools: mcpTools.length,
        })
      );
      return;
    }

    // List tools
    if (url.pathname === '/tools' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ tools: mcpTools }));
      return;
    }

    // Call tool
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};

          // Tool call via /tools/:toolName
          const toolMatch = url.pathname.match(/^\/tools\/(.+)$/);
          if (toolMatch) {
            const toolName = toolMatch[1];
            const result = await callTool(toolName, data);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, result }));
            return;
          }

          // Shortcuts
          if (url.pathname === '/navigate') {
            const result = await callTool('navigate_page', data);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, result }));
            return;
          }

          if (url.pathname === '/screenshot') {
            const result = await callTool('take_screenshot', data);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, result }));
            return;
          }

          if (url.pathname === '/click') {
            const result = await callTool('click', data);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, result }));
            return;
          }

          if (url.pathname === '/evaluate') {
            const result = await callTool('evaluate_script', data);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, result }));
            return;
          }

          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

/**
 * Start everything
 */
async function start() {
  logger.info('Starting Chrome DevTools Bridge (Simple)');

  await startMcp();
  await initializeMcp();

  server.listen(HTTP_PORT, () => {
    logger.info(`HTTP server listening on http://localhost:${HTTP_PORT}`);
    logger.info('Chrome DevTools Bridge ready!');
  });
}

// CLI entry
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((error) => {
    logger.error('Failed to start:', error);
    process.exit(1);
  });
}
