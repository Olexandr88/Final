import { spawn } from 'child_process';
import { A2AAdapter } from './a2a-adapter.js';
import { readFile } from 'fs/promises';

/**
 * MCP to A2A Bridge
 * Connects MCP servers to the A2A hub for inter-server communication
 */
export class MCPtoA2ABridge {
  constructor(mcpConfigPath = 'C:/Users/scarm/.claude/mcp.json', hubUrl = 'ws://localhost:4567') {
    this.mcpConfigPath = mcpConfigPath;
    this.hubUrl = hubUrl;
    this.mcpProcesses = new Map();
    this.a2aAdapters = new Map();
    this.config = null;
  }

  /**
   * Load MCP configuration
   */
  async loadConfig() {
    try {
      const configData = await readFile(this.mcpConfigPath, 'utf-8');
      this.config = JSON.parse(configData);
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load MCP config: ${error.message}`);
    }
  }

  /**
   * Connect all enabled MCP servers to A2A hub
   */
  async connectAll() {
    await this.loadConfig();

    const servers = Object.entries(this.config.mcpServers || {});
    const enabled = servers.filter(([_, config]) => !config.disabled);

    console.log(`Connecting ${enabled.length} MCP servers to A2A hub...`);

    for (const [serverName, serverConfig] of enabled) {
      try {
        await this.connectServer(serverName, serverConfig);
      } catch (error) {
        console.error(`Failed to connect ${serverName}:`, error.message);
      }
    }

    console.log(`Successfully connected ${this.a2aAdapters.size} servers`);
  }

  /**
   * Connect a single MCP server to the A2A hub
   */
  async connectServer(serverName, serverConfig) {
    // Create A2A adapter for this MCP server
    const adapter = new A2AAdapter(`mcp-${serverName}`, this.hubUrl);

    // Extract capabilities from description
    const capabilities = this.extractCapabilities(serverName, serverConfig);

    // Set up message handlers
    this.setupServerHandlers(serverName, adapter);

    // Connect to hub
    await adapter.connect(capabilities);

    this.a2aAdapters.set(serverName, adapter);
    console.log(`✓ ${serverName} connected to A2A hub`);

    return adapter;
  }

  /**
   * Extract capabilities from server config
   */
  extractCapabilities(serverName, config) {
    const capabilities = [serverName];

    // Add capabilities based on server type
    const capabilityMap = {
      'sequential-thinking': ['reasoning', 'planning', 'analysis'],
      'ship-mode': ['validation', 'execution', 'deployment'],
      filesystem: ['file-operations', 'read', 'write', 'search'],
      github: ['repository', 'pr', 'issues', 'code-management'],
      'brave-search': ['web-search', 'information-retrieval'],
      puppeteer: ['browser-automation', 'web-scraping', 'testing'],
      memory: ['knowledge-storage', 'entity-tracking', 'knowledge-graph'],
      sqlite: ['database', 'sql', 'data-storage'],
      postgres: ['database', 'sql', 'advanced-queries'],
    };

    if (capabilityMap[serverName]) {
      capabilities.push(...capabilityMap[serverName]);
    }

    return capabilities;
  }

  /**
   * Set up message handlers for an MCP server
   */
  setupServerHandlers(serverName, adapter) {
    adapter.on('message', async (message) => {
      console.log(`[${serverName}] Received A2A message:`, message.type);

      // Route to appropriate MCP server handler
      try {
        const response = await this.routeToMCPServer(serverName, message);

        if (message.from) {
          adapter.sendTo(message.from, {
            status: 'success',
            result: response,
          });
        }
      } catch (error) {
        if (message.from) {
          adapter.sendTo(message.from, {
            status: 'error',
            error: error.message,
          });
        }
      }
    });

    adapter.on('collaboration', async (message) => {
      console.log(`[${serverName}] Collaboration request:`, message.collaboration_id);

      // Participate in collaboration
      const contribution = await this.getServerContribution(serverName, message.task);

      adapter.broadcast({
        type: 'collaboration_contribution',
        collaboration_id: message.collaboration_id,
        agent_id: `mcp-${serverName}`,
        contribution,
      });
    });

    adapter.on('error', (error) => {
      console.error(`[${serverName}] A2A error:`, error.message);
    });
  }

  /**
   * Route message to MCP server
   */
  async routeToMCPServer(serverName, message) {
    // This is a placeholder - actual implementation would depend on
    // how you want to interface with MCP servers
    return {
      server: serverName,
      message: 'MCP server processing',
      payload: message.payload,
    };
  }

  /**
   * Get server contribution for collaboration
   */
  async getServerContribution(serverName, task) {
    return {
      server: serverName,
      analysis: `${serverName} analysis of: ${task}`,
      recommendations: [],
    };
  }

  /**
   * Get adapter for a specific MCP server
   */
  getAdapter(serverName) {
    return this.a2aAdapters.get(serverName);
  }

  /**
   * Send message from one MCP server to another
   */
  async sendBetweenServers(fromServer, toServer, payload) {
    const adapter = this.getAdapter(fromServer);
    if (!adapter) {
      throw new Error(`Server ${fromServer} not connected`);
    }

    adapter.sendTo(`mcp-${toServer}`, payload);
  }

  /**
   * Disconnect all MCP servers
   */
  disconnectAll() {
    for (const [serverName, adapter] of this.a2aAdapters.entries()) {
      adapter.disconnect();
      console.log(`✓ ${serverName} disconnected`);
    }

    this.a2aAdapters.clear();
  }

  /**
   * Get status of all connected servers
   */
  getStatus() {
    const status = {
      total: this.a2aAdapters.size,
      servers: {},
    };

    for (const [serverName, adapter] of this.a2aAdapters.entries()) {
      status.servers[serverName] = {
        connected: adapter.connected,
        agentId: adapter.agentId,
      };
    }

    return status;
  }
}
