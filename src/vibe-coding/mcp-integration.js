import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../utils/logger.js';

/**
 * MCP Integration for Whole-Codebase Reasoning
 * Implements Model Context Protocol for external resources and codebase analysis
 */
export class MCPIntegration {
  constructor(config = {}) {
    this.clients = new Map();
    this.resources = new Map();
    this.config = config;
  }

  /**
   * Initialize MCP client for a specific server
   */
  async initClient(serverName, command, args = []) {
    const transport = new StdioClientTransport({
      command,
      args,
    });

    const client = new Client(
      {
        name: `vibe-coding-${serverName}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    await client.connect(transport);
    this.clients.set(serverName, client);

    logger.info(`MCP client connected: ${serverName}`);
    return client;
  }

  /**
   * Initialize codebase MCP server for whole-repo context
   */
  async initCodebaseServer(projectPath) {
    try {
      const client = await this.initClient('codebase', 'node', [
        './mcp-servers/codebase-server.js',
        projectPath,
      ]);

      // List available resources
      const resources = await client.listResources();
      this.resources.set('codebase', resources);

      logger.info(`Codebase MCP initialized: ${resources.resources?.length || 0} resources`);
      return resources;
    } catch (error) {
      logger.error('Failed to init codebase MCP:', error);
      throw error;
    }
  }

  /**
   * Query codebase with natural language
   */
  async queryCodebase(query) {
    const client = this.clients.get('codebase');
    if (!client) {
      throw new Error('Codebase MCP not initialized');
    }

    try {
      const result = await client.callTool('query', { query });
      return result.content;
    } catch (error) {
      logger.error('Codebase query failed:', error);
      throw error;
    }
  }

  /**
   * Get file dependencies and relationships
   */
  async getDependencyGraph(filePath) {
    const client = this.clients.get('codebase');
    if (!client) {
      throw new Error('Codebase MCP not initialized');
    }

    const result = await client.callTool('dependencies', {
      file: filePath,
      depth: 3,
    });

    return result.content;
  }

  /**
   * Initialize external resource MCP (Google Drive, Figma, etc.)
   */
  async initExternalResource(type, config) {
    const serverMap = {
      'google-drive': {
        command: 'node',
        args: ['./mcp-servers/google-drive-server.js'],
      },
      figma: {
        command: 'node',
        args: ['./mcp-servers/figma-server.js'],
      },
      github: {
        command: 'node',
        args: ['./mcp-servers/github-server.js'],
      },
    };

    const serverConfig = serverMap[type];
    if (!serverConfig) {
      throw new Error(`Unknown MCP resource type: ${type}`);
    }

    const client = await this.initClient(type, serverConfig.command, serverConfig.args);

    // Fetch resources from external service
    const resources = await client.listResources();
    this.resources.set(type, resources);

    logger.info(`External resource MCP initialized: ${type}`);
    return resources;
  }

  /**
   * Fetch design specs from Figma via MCP
   */
  async fetchDesignSpec(figmaUrl) {
    const client = this.clients.get('figma');
    if (!client) {
      await this.initExternalResource('figma');
    }

    const result = await this.clients.get('figma').callTool('fetch-design', {
      url: figmaUrl,
    });

    return {
      components: result.content.components,
      styles: result.content.styles,
      assets: result.content.assets,
    };
  }

  /**
   * Fetch documentation from Google Drive via MCP
   */
  async fetchDocumentation(driveFileId) {
    const client = this.clients.get('google-drive');
    if (!client) {
      await this.initExternalResource('google-drive');
    }

    const result = await client.callTool('fetch-doc', {
      fileId: driveFileId,
    });

    return result.content;
  }

  /**
   * Analyze entire codebase structure
   */
  async analyzeCodebaseStructure() {
    const client = this.clients.get('codebase');
    if (!client) {
      throw new Error('Codebase MCP not initialized');
    }

    const result = await client.callTool('analyze-structure', {
      includeTests: true,
      includeDocs: true,
    });

    return {
      files: result.content.files,
      directories: result.content.directories,
      languages: result.content.languages,
      frameworks: result.content.frameworks,
      entryPoints: result.content.entryPoints,
    };
  }

  /**
   * Search codebase semantically
   */
  async semanticSearch(query, options = {}) {
    const client = this.clients.get('codebase');
    if (!client) {
      throw new Error('Codebase MCP not initialized');
    }

    const result = await client.callTool('semantic-search', {
      query,
      limit: options.limit || 10,
      fileTypes: options.fileTypes || ['js', 'ts', 'jsx', 'tsx'],
    });

    return result.content.results;
  }

  /**
   * Get project insights (patterns, conventions, architecture)
   */
  async getProjectInsights() {
    const client = this.clients.get('codebase');
    if (!client) {
      throw new Error('Codebase MCP not initialized');
    }

    const result = await client.callTool('insights', {
      analyzePatterns: true,
      analyzeConventions: true,
      analyzeArchitecture: true,
    });

    return {
      patterns: result.content.patterns,
      conventions: result.content.conventions,
      architecture: result.content.architecture,
      recommendations: result.content.recommendations,
    };
  }

  /**
   * Disconnect all MCP clients
   */
  async disconnect() {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        logger.info(`MCP client disconnected: ${name}`);
      } catch (error) {
        logger.error(`Failed to disconnect ${name}:`, error);
      }
    }

    this.clients.clear();
    this.resources.clear();
  }

  /**
   * Get MCP statistics
   */
  getStats() {
    return {
      activeClients: Array.from(this.clients.keys()),
      totalResources: Array.from(this.resources.values()).reduce(
        (sum, r) => sum + (r.resources?.length || 0),
        0
      ),
    };
  }
}

export default MCPIntegration;
