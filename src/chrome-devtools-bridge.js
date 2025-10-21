#!/usr/bin/env node
/**
 * Chrome DevTools MCP Bridge
 * Exposes Chrome DevTools MCP server via HTTP/WebSocket for CLI usage
 *
 * @module chrome-devtools-bridge
 */

import { spawn } from 'child_process';
import express from 'express';
import { WebSocketServer } from 'ws';
import { logger } from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Chrome DevTools Bridge Server
 * Wraps chrome-devtools-mcp stdio MCP server with HTTP/WebSocket API
 */
export class ChromeDevToolsBridge {
  constructor(options = {}) {
    this.options = {
      httpPort: options.httpPort || 65030,
      wsPort: options.wsPort || 65031,
      browserUrl: options.browserUrl || null, // Connect to existing Chrome
      headless: options.headless !== undefined ? options.headless : false,
      channel: options.channel || 'stable',
      viewport: options.viewport || null,
      ...options,
    };

    this.mcpProcess = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.mcpTools = [];
    this.initialized = false;

    // Express app for HTTP API
    this.app = express();

    // Middleware
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.setHeader('Content-Type', 'application/json');
      next();
    });

    // WebSocket server
    this.wss = null;

    this._setupRoutes();
  }

  /**
   * Start the bridge server
   */
  async start() {
    logger.info('Starting Chrome DevTools Bridge', {
      httpPort: this.options.httpPort,
      wsPort: this.options.wsPort,
    });

    // Start MCP process
    await this._startMcpProcess();

    // Initialize MCP connection
    await this._initializeMcp();

    // Start WebSocket server
    this.wss = new WebSocketServer({ port: this.options.wsPort });
    this.wss.on('connection', (ws) => this._handleWebSocketConnection(ws));
    logger.info(`WebSocket server listening on ws://localhost:${this.options.wsPort}`);

    // Start HTTP server (after routes are setup)
    this.httpServer = this.app.listen(this.options.httpPort, () => {
      logger.info(`HTTP API listening on http://localhost:${this.options.httpPort}`);
      logger.info('Chrome DevTools Bridge ready');
    });

    // Cleanup handlers
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Stop the bridge server
   */
  async stop() {
    logger.info('Stopping Chrome DevTools Bridge');

    if (this.httpServer) {
      this.httpServer.close();
    }

    if (this.wss) {
      this.wss.close();
    }

    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }

    logger.info('Chrome DevTools Bridge stopped');
    process.exit(0);
  }

  /**
   * Start chrome-devtools-mcp process
   */
  async _startMcpProcess() {
    return new Promise((resolve, reject) => {
      const args = ['-y', 'chrome-devtools-mcp@latest'];

      // Add options
      if (this.options.browserUrl) {
        args.push('--browserUrl', this.options.browserUrl);
      }
      if (this.options.headless) {
        args.push('--headless');
      }
      if (this.options.channel) {
        args.push('--channel', this.options.channel);
      }
      if (this.options.viewport) {
        args.push('--viewport', this.options.viewport);
      }

      logger.info('Spawning chrome-devtools-mcp', { args });

      // Use npx.cmd on Windows
      const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

      this.mcpProcess = spawn(npxCommand, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
        shell: process.platform === 'win32',
      });

      this.mcpProcess.on('error', (error) => {
        logger.error('MCP process error', { error: error.message });
        reject(error);
      });

      this.mcpProcess.on('exit', (code) => {
        logger.warn('MCP process exited', { code });
        this.mcpProcess = null;
      });

      // Handle stdout (MCP JSON-RPC messages)
      let buffer = '';
      this.mcpProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              this._handleMcpMessage(message);
            } catch (error) {
              logger.debug('Non-JSON output from MCP', { line });
            }
          }
        }
      });

      // Handle stderr (logs)
      this.mcpProcess.stderr.on('data', (data) => {
        logger.debug('MCP stderr', { data: data.toString().trim() });
      });

      // Wait a bit for process to start
      setTimeout(() => resolve(), 1000);
    });
  }

  /**
   * Initialize MCP connection
   */
  async _initializeMcp() {
    logger.info('Initializing MCP connection');

    // Send initialize request
    const initResult = await this._sendMcpRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'chrome-devtools-bridge',
        version: '1.0.0',
      },
    });

    logger.info('MCP initialized', { result: initResult });

    // Send initialized notification
    this._sendMcpNotification('notifications/initialized');

    // List available tools
    const toolsResult = await this._sendMcpRequest('tools/list');
    this.mcpTools = toolsResult.tools || [];

    logger.info(`Discovered ${this.mcpTools.length} Chrome DevTools tools`, {
      tools: this.mcpTools.map((t) => t.name),
    });

    this.initialized = true;
  }

  /**
   * Send MCP JSON-RPC request
   */
  async _sendMcpRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.mcpProcess.stdin.write(message);

      logger.debug('Sent MCP request', { id, method });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timeout`));
        }
      }, 30000);
    });
  }

  /**
   * Send MCP JSON-RPC notification
   */
  _sendMcpNotification(method, params = {}) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';
    this.mcpProcess.stdin.write(message);

    logger.debug('Sent MCP notification', { method });
  }

  /**
   * Handle MCP JSON-RPC messages
   */
  _handleMcpMessage(message) {
    logger.debug('Received MCP message', { message });

    // Response to request
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'MCP error'));
      } else {
        resolve(message.result);
      }
    }

    // Notification or log
    if (message.method && message.method.startsWith('notifications/')) {
      logger.debug('MCP notification', { method: message.method });
    }
  }

  /**
   * Call Chrome DevTools tool via MCP
   */
  async callTool(toolName, args = {}) {
    if (!this.initialized) {
      throw new Error('Bridge not initialized');
    }

    const tool = this.mcpTools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    logger.info('Calling Chrome DevTools tool', { tool: toolName, args });

    const result = await this._sendMcpRequest('tools/call', {
      name: toolName,
      arguments: args,
    });

    return result;
  }

  /**
   * Setup HTTP routes
   */
  _setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        initialized: this.initialized,
        tools: this.mcpTools.length,
      });
    });

    // List tools
    this.app.get('/tools', (req, res) => {
      res.json({
        tools: this.mcpTools,
      });
    });

    // Call tool
    this.app.post('/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;

        const result = await this.callTool(toolName, args);

        res.json({
          success: true,
          result,
        });
      } catch (error) {
        logger.error('Tool call failed', { error: error.message });
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Common tool shortcuts
    this.app.post('/navigate', async (req, res) => {
      try {
        const { url } = req.body;
        const result = await this.callTool('navigate', { url });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/screenshot', async (req, res) => {
      try {
        const result = await this.callTool('screenshot', req.body || {});
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/click', async (req, res) => {
      try {
        const result = await this.callTool('click', req.body);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/evaluate', async (req, res) => {
      try {
        const { script } = req.body;
        const result = await this.callTool('evaluate', { script });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Handle WebSocket connection
   */
  _handleWebSocketConnection(ws) {
    logger.info('WebSocket client connected');

    ws.on('message', async (data) => {
      try {
        const request = JSON.parse(data.toString());
        const { tool, args } = request;

        const result = await this.callTool(tool, args);

        ws.send(
          JSON.stringify({
            success: true,
            tool,
            result,
          })
        );
      } catch (error) {
        ws.send(
          JSON.stringify({
            success: false,
            error: error.message,
          })
        );
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
    });
  }
}

// CLI entry point
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const bridge = new ChromeDevToolsBridge({
    httpPort: process.env.CHROME_BRIDGE_HTTP_PORT || 65030,
    wsPort: process.env.CHROME_BRIDGE_WS_PORT || 65031,
    browserUrl: process.env.CHROME_BROWSER_URL,
    headless: process.env.CHROME_HEADLESS === 'true',
    channel: process.env.CHROME_CHANNEL || 'stable',
  });

  bridge.start().catch((error) => {
    logger.error('Failed to start bridge', { error: error.message });
    process.exit(1);
  });
}

export default ChromeDevToolsBridge;
