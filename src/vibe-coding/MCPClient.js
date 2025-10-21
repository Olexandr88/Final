import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

/**
 * MCPClient - Model Context Protocol client for external service integration
 * Based on "The Vibe Coder's Compass" MCP integration section
 */
export class MCPClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || Logger.getInstance();
    this.servers = new Map();
    this.connections = new Map();
    this.defaultScope = options.defaultScope || 'project';
  }

  /**
   * Add MCP server
   */
  async addServer(name, config) {
    const {
      transport = 'http',
      url,
      scope = this.defaultScope,
      tools = [],
      resources = [],
      enabled = true,
    } = config;

    if (this.servers.has(name)) {
      throw new Error(`MCP server ${name} already registered`);
    }

    const server = {
      name,
      transport,
      url,
      scope,
      tools,
      resources,
      enabled,
      connected: false,
      lastConnected: null,
    };

    this.servers.set(name, server);
    this.logger.info(`MCP server registered: ${name} (${url})`);

    if (enabled) {
      await this.connect(name);
    }

    return server;
  }

  /**
   * Connect to MCP server
   */
  async connect(serverName) {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server ${serverName} not found`);
    }

    if (this.connections.has(serverName)) {
      this.logger.warn(`Already connected to ${serverName}`);
      return this.connections.get(serverName);
    }

    this.emit('server:connecting', { server: serverName });

    try {
      const connection = await this._establishConnection(server);

      this.connections.set(serverName, connection);
      server.connected = true;
      server.lastConnected = Date.now();

      this.emit('server:connected', { server: serverName, tools: connection.tools.length });
      this.logger.info(`Connected to MCP server: ${serverName}`);

      return connection;
    } catch (error) {
      this.emit('server:error', { server: serverName, error });
      this.logger.error(`Failed to connect to ${serverName}`, error);
      throw error;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(serverName) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return;
    }

    this.emit('server:disconnecting', { server: serverName });

    await this._closeConnection(connection);
    this.connections.delete(serverName);

    const server = this.servers.get(serverName);
    if (server) {
      server.connected = false;
    }

    this.emit('server:disconnected', { server: serverName });
    this.logger.info(`Disconnected from MCP server: ${serverName}`);
  }

  /**
   * Call MCP tool
   */
  async callTool(serverName, toolName, params = {}) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Not connected to ${serverName}`);
    }

    const tool = connection.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on ${serverName}`);
    }

    this.emit('tool:calling', { server: serverName, tool: toolName, params });

    try {
      const result = await this._invokeTool(connection, tool, params);

      this.emit('tool:success', { server: serverName, tool: toolName, result });
      return result;
    } catch (error) {
      this.emit('tool:error', { server: serverName, tool: toolName, error });
      throw error;
    }
  }

  /**
   * Get resource from MCP server
   */
  async getResource(serverName, resourceUri) {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`Not connected to ${serverName}`);
    }

    this.emit('resource:fetching', { server: serverName, uri: resourceUri });

    try {
      const resource = await this._fetchResource(connection, resourceUri);

      this.emit('resource:fetched', { server: serverName, uri: resourceUri });
      return resource;
    } catch (error) {
      this.emit('resource:error', { server: serverName, uri: resourceUri, error });
      throw error;
    }
  }

  /**
   * List available tools from all connected servers
   */
  listTools() {
    const tools = [];

    for (const [serverName, connection] of this.connections) {
      for (const tool of connection.tools) {
        tools.push({
          server: serverName,
          name: tool.name,
          fullName: `mcp__${serverName}__${tool.name}`,
          description: tool.description,
          parameters: tool.parameters,
        });
      }
    }

    return tools;
  }

  /**
   * List available resources from all connected servers
   */
  listResources() {
    const resources = [];

    for (const [serverName, connection] of this.connections) {
      for (const resource of connection.resources) {
        resources.push({
          server: serverName,
          uri: resource.uri,
          type: resource.type,
          description: resource.description,
        });
      }
    }

    return resources;
  }

  /**
   * Get server status
   */
  getServerStatus(serverName = null) {
    if (serverName) {
      const server = this.servers.get(serverName);
      return server
        ? {
            name: server.name,
            connected: server.connected,
            url: server.url,
            scope: server.scope,
            toolCount: this.connections.get(serverName)?.tools.length || 0,
          }
        : null;
    }

    const status = {};
    for (const [name, server] of this.servers) {
      status[name] = {
        connected: server.connected,
        url: server.url,
        scope: server.scope,
        toolCount: this.connections.get(name)?.tools.length || 0,
      };
    }
    return status;
  }

  /**
   * Enable/disable server
   */
  async setServerEnabled(serverName, enabled) {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    server.enabled = enabled;

    if (enabled && !server.connected) {
      await this.connect(serverName);
    } else if (!enabled && server.connected) {
      await this.disconnect(serverName);
    }
  }

  /**
   * Remove server
   */
  async removeServer(serverName) {
    if (this.connections.has(serverName)) {
      await this.disconnect(serverName);
    }

    this.servers.delete(serverName);
    this.logger.info(`Removed MCP server: ${serverName}`);
  }

  /**
   * Establish connection to MCP server
   */
  async _establishConnection(server) {
    // Simulate connection (real implementation would use HTTP/stdio/etc.)
    return {
      server: server.name,
      url: server.url,
      transport: server.transport,
      tools: [
        {
          name: 'fetch_data',
          description: 'Fetch data from external API',
          parameters: {
            type: 'object',
            properties: {
              endpoint: { type: 'string' },
              params: { type: 'object' },
            },
          },
        },
      ],
      resources: [
        {
          uri: `${server.url}/docs`,
          type: 'documentation',
          description: 'API documentation',
        },
      ],
    };
  }

  /**
   * Close connection
   */
  async _closeConnection(connection) {
    // Cleanup connection resources
  }

  /**
   * Invoke MCP tool
   */
  async _invokeTool(connection, tool, params) {
    // Simulate tool invocation
    return {
      success: true,
      data: { message: `Tool ${tool.name} executed` },
      timestamp: Date.now(),
    };
  }

  /**
   * Fetch resource from MCP server
   */
  async _fetchResource(connection, resourceUri) {
    // Simulate resource fetch
    return {
      uri: resourceUri,
      content: 'Resource content',
      type: 'text/plain',
      timestamp: Date.now(),
    };
  }

  /**
   * Create MCP client with common servers pre-configured
   */
  static async createWithDefaults(options = {}) {
    const client = new MCPClient(options);

    // Example: Add common MCP servers
    // await client.addServer('filesystem', {
    //   transport: 'stdio',
    //   url: 'mcp-filesystem',
    //   scope: 'user'
    // });

    return client;
  }
}
