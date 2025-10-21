/**
 * MCP (Model Context Protocol) Integration Layer
 * Connects Claude Code to external tools and data sources
 */

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProviderDetector } from './provider-detector.js';

export class MCPIntegration extends EventEmitter {
  constructor(options = {}) {
    super();
    this.servers = new Map();
    this.connections = new Map();
    this.configPath = options.configPath || path.join(process.cwd(), '.mcp.json');
    this.debug = options.debug || false;

    // Initialize built-in tools
    this.builtInTools = new Map();
    this._registerBuiltInTools();

    this._loadConfig(); // Note: this is now async but called sync in constructor
  }

  /**
   * Register built-in MCP tools
   * @private
   */
  _registerBuiltInTools() {
    // Provider detector tool
    const providerDetector = new ProviderDetector();
    this.builtInTools.set('detect_providers', {
      definition: ProviderDetector.getToolDefinition(),
      executor: providerDetector.executeTool.bind(providerDetector),
    });

    // System info tool
    this.builtInTools.set('get_system_info', {
      definition: {
        name: 'get_system_info',
        description: 'Retrieves basic system information (OS, Node.js version, uptime).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      executor: this._handleGetSystemInfo.bind(this),
    });
  }

  /**
   * Execute a built-in tool
   * @param {string} toolName - Tool name
   * @param {Object} params - Tool parameters
   * @returns {Promise<Object>} Tool execution result
   */
  async executeBuiltInTool(toolName, params = {}) {
    const tool = this.builtInTools.get(toolName);
    if (!tool) {
      throw new Error(`Built-in tool not found: ${toolName}`);
    }

    return tool.executor(params);
  }

  /**
   * List all available tools (built-in and from servers)
   * @returns {Array} List of tool definitions
   */
  listAllTools() {
    const tools = [];

    // Add built-in tools
    for (const [name, tool] of this.builtInTools) {
      tools.push({
        ...tool.definition,
        source: 'built-in',
        available: true,
      });
    }

    // Add server tools
    for (const [serverName, server] of this.servers) {
      for (const toolName of server.tools) {
        tools.push({
          name: toolName,
          server: serverName,
          source: 'server',
          available: server.connected,
          url: server.url,
        });
      }
    }

    return tools;
  }

  /**
   * Add MCP server connection
   */
  async addServer(config) {
    const {
      name,
      transport = 'http', // http, stdio, websocket
      url,
      command,
      args,
      scope = 'project', // local, project, user
      tools = [],
      auth = null,
    } = config;

    const serverConfig = {
      name,
      transport,
      url,
      command,
      args,
      scope,
      tools,
      auth,
      connected: false,
      addedAt: Date.now(),
    };

    this.servers.set(name, serverConfig);

    // Save to config
    await this._saveServerConfig(serverConfig, scope);

    console.log(`✓ MCP server added: ${name}`);

    return name;
  }

  /**
   * Connect to MCP server
   */
  async connect(serverName) {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    console.log(`Connecting to MCP server: ${serverName}...`);

    try {
      let connection;

      switch (server.transport) {
        case 'http':
          connection = await this._connectHttp(server);
          break;
        case 'stdio':
          connection = await this._connectStdio(server);
          break;
        case 'websocket':
          connection = await this._connectWebSocket(server);
          break;
        default:
          throw new Error(`Unsupported transport: ${server.transport}`);
      }

      this.connections.set(serverName, connection);
      server.connected = true;

      this.emit('server:connected', { serverName, tools: server.tools });

      console.log(`✓ Connected to ${serverName}`);

      return connection;
    } catch (error) {
      console.error(`Failed to connect to ${serverName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(serverName) {
    const connection = this.connections.get(serverName);
    if (!connection) return false;

    await connection.close();
    this.connections.delete(serverName);

    const server = this.servers.get(serverName);
    if (server) {
      server.connected = false;
    }

    this.emit('server:disconnected', { serverName });

    console.log(`✓ Disconnected from ${serverName}`);

    return true;
  }

  /**
   * Call MCP tool
   */
  async callTool(serverName, toolName, params = {}) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    const server = this.servers.get(serverName);
    if (!server.tools.includes(toolName)) {
      throw new Error(`Tool not available: ${toolName} on ${serverName}`);
    }

    console.log(`Calling ${serverName}::${toolName}...`);

    try {
      const result = await connection.call(toolName, params);

      this.emit('tool:called', { serverName, toolName, params, result });

      return result;
    } catch (error) {
      this.emit('tool:error', { serverName, toolName, error: error.message });
      throw error;
    }
  }

  /**
   * List available tools across all servers (legacy method)
   * @deprecated Use listAllTools() instead
   */
  listTools() {
    const tools = [];

    for (const [serverName, server] of this.servers) {
      for (const tool of server.tools) {
        tools.push({
          server: serverName,
          tool,
          available: server.connected,
          url: server.url,
        });
      }
    }

    return tools;
  }

  /**
   * Get server information
   */
  getServer(serverName) {
    return this.servers.get(serverName);
  }

  /**
   * List all servers
   */
  listServers() {
    return Array.from(this.servers.values());
  }

  /**
   * List tools available on a specific server
   */
  async listServerTools(serverName) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    console.log(`Listing tools on ${serverName}...`);

    try {
      const result = await connection.call('list_tools', {});
      return result.tools;
    } catch (error) {
      console.error(`Failed to list tools on ${serverName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove MCP server
   */
  async removeServer(serverName) {
    if (this.connections.has(serverName)) {
      await this.disconnect(serverName);
    }

    this.servers.delete(serverName);
    await this._removeServerConfig(serverName);

    console.log(`✓ MCP server removed: ${serverName}`);

    return true;
  }

  /**
   * Connect via HTTP transport
   */
  async _connectHttp(server) {
    return {
      type: 'http',
      url: server.url,
      auth: server.auth,

      async call(toolName, params) {
        const response = await fetch(`${server.url}/mcp/tools/${toolName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(server.auth ? { Authorization: server.auth } : {}),
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      },

      async close() {
        // HTTP is stateless, nothing to close
      },
    };
  }

  /**
   * Connect via stdio transport
   */
  async _connectStdio(server) {
    const { spawn } = await import('child_process');
    const process = spawn(server.command, server.args || []);

    return {
      type: 'stdio',
      process,

      async call(toolName, params) {
        return new Promise((resolve, reject) => {
          const message = JSON.stringify({ tool: toolName, params });

          process.stdin.write(message + '\n');

          const onData = (data) => {
            try {
              const result = JSON.parse(data.toString());
              process.stdout.off('data', onData);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          };

          process.stdout.on('data', onData);

          setTimeout(() => {
            process.stdout.off('data', onData);
            reject(new Error('Tool call timeout'));
          }, 30000);
        });
      },

      async close() {
        process.kill();
      },
    };
  }

  /**
   * Connect via WebSocket transport
   */
  async _connectWebSocket(server) {
    const WebSocket = (await import('ws')).default;
    const ws = new WebSocket(server.url);

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    return {
      type: 'websocket',
      ws,

      async call(toolName, params) {
        return new Promise((resolve, reject) => {
          const id = Math.random().toString(36);
          const message = JSON.stringify({ id, tool: toolName, params });

          ws.send(message);

          const onMessage = (data) => {
            try {
              const response = JSON.parse(data.toString());
              if (response.id === id) {
                ws.off('message', onMessage);
                resolve(response.result);
              }
            } catch (error) {
              reject(error);
            }
          };

          ws.on('message', onMessage);

          setTimeout(() => {
            ws.off('message', onMessage);
            reject(new Error('Tool call timeout'));
          }, 30000);
        });
      },

      async close() {
        ws.close();
      },
    };
  }

  /**
   * Load MCP configuration
   */
  async _loadConfig() {
    if (!fs.existsSync(this.configPath)) return;

    try {
      const configContent = await fs.promises.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent);

      for (const [name, serverConfig] of Object.entries(config.servers || {})) {
        this.servers.set(name, {
          name,
          ...serverConfig,
          connected: false,
        });
      }

      console.log(`Loaded ${this.servers.size} MCP server(s) from config`);
    } catch (error) {
      console.error(`Failed to load MCP config: ${error.message}`);
    }
  }

  /**
   * Save server configuration
   */
  async _saveServerConfig(serverConfig, scope) {
    let configPath;

    if (scope === 'user') {
      configPath = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'mcp.json');
    } else {
      configPath = this.configPath;
    }

    let config = { servers: {} };
    if (fs.existsSync(configPath)) {
      const configContent = await fs.promises.readFile(configPath, 'utf-8');
      config = JSON.parse(configContent);
    }

    config.servers[serverConfig.name] = {
      transport: serverConfig.transport,
      url: serverConfig.url,
      tools: serverConfig.tools,
      auth: serverConfig.auth,
    };

    await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Remove server configuration
   */
  async _removeServerConfig(serverName) {
    if (!fs.existsSync(this.configPath)) return;

    const configContent = await fs.promises.readFile(this.configPath, 'utf-8');
    const config = JSON.parse(configContent);
    delete config.servers[serverName];

    await fs.promises.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Handle get system info tool
   * @private
   */
  async _handleGetSystemInfo() {
    return {
      osType: os.type(),
      osPlatform: os.platform(),
      osArch: os.arch(),
      nodeVersion: process.version,
      uptime: os.uptime(),
    };
  }
}

export default MCPIntegration;
