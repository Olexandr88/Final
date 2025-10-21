/**
 * MCP-Aware Agent - Agent with native MCP tool integration
 * @module agents/mcp-aware-agent
 */

import { BaseAgent } from './base-agent.js';
import { logger } from '../utils/logger.js';

export class MCPAwareAgent extends BaseAgent {
  constructor(config) {
    super(config);

    this.mcpClients = {};
    this.availableMCPTools = config.mcpTools || [];
    this.toolCapabilities = new Map();
  }

  /**
   * Initialize MCP clients for specified tools
   */
  async connect() {
    try {
      await super.connect();

      logger.info('Initializing MCP clients', {
        agentId: this.id,
        tools: this.availableMCPTools
      });

      // Initialize MCP clients dynamically
      for (const toolName of this.availableMCPTools) {
        const client = await this._initializeMCPClient(toolName);
        this.mcpClients[toolName] = client;
        await this._discoverCapabilities(toolName, client);
      }

      logger.info('MCP clients initialized', {
        agentId: this.id,
        clientCount: Object.keys(this.mcpClients).length
      });

    } catch (error) {
      logger.error('Failed to initialize MCP clients', {
        agentId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize specific MCP client
   */
  async _initializeMCPClient(toolName) {
    switch (toolName) {
      case 'rube':
        return this._initializeRubeClient();
      case 'github':
        return this._initializeGitHubClient();
      case 'memory':
        return this._initializeMemoryClient();
      case 'chrome':
        return this._initializeChromeClient();
      case 'filesystem':
        return this._initializeFilesystemClient();
      case 'sequential-thinking':
        return this._initializeSequentialThinkingClient();
      case 'sqlite':
        return this._initializeSQLiteClient();
      case 'git-workflow':
        return this._initializeGitWorkflowClient();
      default:
        throw new Error(`Unknown MCP tool: ${toolName}`);
    }
  }

  /**
   * Initialize Rube (Composio) MCP client
   */
  async _initializeRubeClient() {
    // Rube provides access to 500+ apps via Composio
    return {
      name: 'rube',
      searchTools: async (params) => {
        return await this._callMCPTool('mcp__rube__RUBE_SEARCH_TOOLS', params);
      },
      multiExecute: async (params) => {
        return await this._callMCPTool('mcp__rube__RUBE_MULTI_EXECUTE_TOOL', params);
      },
      createPlan: async (params) => {
        return await this._callMCPTool('mcp__rube__RUBE_CREATE_PLAN', params);
      },
      remoteBash: async (params) => {
        return await this._callMCPTool('mcp__rube__RUBE_REMOTE_BASH_TOOL', params);
      },
      remoteWorkbench: async (params) => {
        return await this._callMCPTool('mcp__rube__RUBE_REMOTE_WORKBENCH', params);
      },
      manageConnections: async (params) => {
        return await this._callMCPTool('mcp__rube__RUBE_MANAGE_CONNECTIONS', params);
      }
    };
  }

  /**
   * Initialize GitHub MCP client
   */
  async _initializeGitHubClient() {
    return {
      name: 'github',
      searchCode: async (params) => {
        return await this._callMCPTool('mcp__github__search_code', params);
      },
      createPullRequest: async (params) => {
        return await this._callMCPTool('mcp__github__create_pull_request', params);
      },
      createIssue: async (params) => {
        return await this._callMCPTool('mcp__github__create_issue', params);
      },
      listPullRequests: async (params) => {
        return await this._callMCPTool('mcp__github__list_pull_requests', params);
      },
      getFileContents: async (params) => {
        return await this._callMCPTool('mcp__github__get_file_contents', params);
      },
      createOrUpdateFile: async (params) => {
        return await this._callMCPTool('mcp__github__create_or_update_file', params);
      },
      createBranch: async (params) => {
        return await this._callMCPTool('mcp__github__create_branch', params);
      }
    };
  }

  /**
   * Initialize Memory MCP client
   */
  async _initializeMemoryClient() {
    return {
      name: 'memory',
      createEntities: async (params) => {
        return await this._callMCPTool('mcp__memory__create_entities', params);
      },
      createRelations: async (params) => {
        return await this._callMCPTool('mcp__memory__create_relations', params);
      },
      addObservations: async (params) => {
        return await this._callMCPTool('mcp__memory__add_observations', params);
      },
      searchNodes: async (params) => {
        return await this._callMCPTool('mcp__memory__search_nodes', params);
      },
      openNodes: async (params) => {
        return await this._callMCPTool('mcp__memory__open_nodes', params);
      },
      readGraph: async (params) => {
        return await this._callMCPTool('mcp__memory__read_graph', params);
      }
    };
  }

  /**
   * Initialize Chrome DevTools MCP client
   */
  async _initializeChromeClient() {
    return {
      name: 'chrome',
      navigate: async (params) => {
        return await this._callMCPTool('mcp__chrome-devtools__navigate_page', params);
      },
      takeSnapshot: async (params) => {
        return await this._callMCPTool('mcp__chrome-devtools__take_snapshot', params);
      },
      takeScreenshot: async (params) => {
        return await this._callMCPTool('mcp__chrome-devtools__take_screenshot', params);
      },
      performanceStartTrace: async (params) => {
        return await this._callMCPTool('mcp__chrome-devtools__performance_start_trace', params);
      },
      performanceStopTrace: async (params) => {
        return await this._callMCPTool('mcp__chrome-devtools__performance_stop_trace', params);
      },
      click: async (params) => {
        return await this._callMCPTool('mcp__chrome-devtools__click', params);
      },
      fill: async (params) => {
        return await this._callMCPTool('mcp__chrome-devtools__fill', params);
      }
    };
  }

  /**
   * Initialize Filesystem MCP client
   */
  async _initializeFilesystemClient() {
    return {
      name: 'filesystem',
      readFile: async (params) => {
        return await this._callMCPTool('mcp__filesystem__read_text_file', params);
      },
      writeFile: async (params) => {
        return await this._callMCPTool('mcp__filesystem__write_file', params);
      },
      editFile: async (params) => {
        return await this._callMCPTool('mcp__filesystem__edit_file', params);
      },
      listDirectory: async (params) => {
        return await this._callMCPTool('mcp__filesystem__list_directory', params);
      },
      searchFiles: async (params) => {
        return await this._callMCPTool('mcp__filesystem__search_files', params);
      },
      createDirectory: async (params) => {
        return await this._callMCPTool('mcp__filesystem__create_directory', params);
      }
    };
  }

  /**
   * Initialize Sequential Thinking MCP client
   */
  async _initializeSequentialThinkingClient() {
    return {
      name: 'sequential-thinking',
      think: async (params) => {
        return await this._callMCPTool('mcp__sequential-thinking__sequentialthinking', params);
      }
    };
  }

  /**
   * Initialize SQLite MCP client
   */
  async _initializeSQLiteClient() {
    return {
      name: 'sqlite',
      readQuery: async (params) => {
        return await this._callMCPTool('mcp__sqlite__read_query', params);
      },
      writeQuery: async (params) => {
        return await this._callMCPTool('mcp__sqlite__write_query', params);
      },
      listTables: async (params) => {
        return await this._callMCPTool('mcp__sqlite__list_tables', params);
      },
      describeTable: async (params) => {
        return await this._callMCPTool('mcp__sqlite__describe_table', params);
      }
    };
  }

  /**
   * Initialize Git Workflow MCP client
   */
  async _initializeGitWorkflowClient() {
    return {
      name: 'git-workflow',
      createBranch: async (params) => {
        return await this._callMCPTool('mcp__git-workflow__create_branch', params);
      },
      analyzeCommits: async (params) => {
        return await this._callMCPTool('mcp__git-workflow__analyze_commits', params);
      },
      generatePR: async (params) => {
        return await this._callMCPTool('mcp__git-workflow__generate_pr', params);
      },
      checkStatus: async (params) => {
        return await this._callMCPTool('mcp__git-workflow__check_status', params);
      }
    };
  }

  /**
   * Call MCP tool (stub - would integrate with actual MCP system)
   */
  async _callMCPTool(toolName, params) {
    logger.debug('Calling MCP tool', { agentId: this.id, toolName, params });

    // This would integrate with the actual MCP tool system
    // For now, return a mock response
    return {
      success: true,
      toolName,
      params,
      result: {
        message: 'MCP tool execution placeholder'
      }
    };
  }

  /**
   * Discover capabilities of MCP tool
   */
  async _discoverCapabilities(toolName, client) {
    const capabilities = Object.keys(client).filter(k => typeof client[k] === 'function');
    this.toolCapabilities.set(toolName, capabilities);

    logger.debug('Discovered MCP tool capabilities', {
      agentId: this.id,
      toolName,
      capabilities
    });
  }

  /**
   * Execute task using MCP tools based on intent
   */
  async executeWithMCP(intent, data) {
    try {
      logger.info('Executing with MCP', {
        agentId: this.id,
        intent,
        availableTools: Object.keys(this.mcpClients)
      });

      // Route to appropriate MCP tool based on intent
      switch (intent) {
        case 'search_tools':
          return await this.mcpClients.rube?.searchTools(data);

        case 'execute_parallel':
          return await this.mcpClients.rube?.multiExecute(data);

        case 'create_plan':
          return await this.mcpClients.rube?.createPlan(data);

        case 'remember':
        case 'store_knowledge':
          return await this.mcpClients.memory?.createEntities(data);

        case 'search_memory':
          return await this.mcpClients.memory?.searchNodes(data);

        case 'github_search':
          return await this.mcpClients.github?.searchCode(data);

        case 'create_pr':
          return await this.mcpClients.github?.createPullRequest(data);

        case 'analyze_code':
          return await this.mcpClients.github?.getFileContents(data);

        case 'think':
        case 'reason':
          return await this.mcpClients['sequential-thinking']?.think(data);

        case 'navigate':
          return await this.mcpClients.chrome?.navigate(data);

        case 'screenshot':
          return await this.mcpClients.chrome?.takeScreenshot(data);

        case 'read_file':
          return await this.mcpClients.filesystem?.readFile(data);

        case 'write_file':
          return await this.mcpClients.filesystem?.writeFile(data);

        case 'sql_query':
          return await this.mcpClients.sqlite?.readQuery(data);

        default:
          throw new Error(`Unknown intent: ${intent}`);
      }

    } catch (error) {
      logger.error('MCP execution failed', {
        agentId: this.id,
        intent,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute MCP tool directly by name
   */
  async executeMCPTool(serverName, toolName, params) {
    try {
      const client = this.mcpClients[serverName];

      if (!client) {
        throw new Error(`MCP server not initialized: ${serverName}`);
      }

      if (!client[toolName]) {
        throw new Error(`Unknown tool: ${toolName} on server ${serverName}`);
      }

      logger.info('Executing MCP tool', {
        agentId: this.id,
        server: serverName,
        tool: toolName
      });

      const result = await client[toolName](params);

      logger.debug('MCP tool executed', {
        agentId: this.id,
        server: serverName,
        tool: toolName,
        success: true
      });

      return result;

    } catch (error) {
      logger.error('MCP tool execution failed', {
        agentId: this.id,
        server: serverName,
        tool: toolName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available MCP tools
   */
  getAvailableTools() {
    const tools = {};

    for (const [serverName, capabilities] of this.toolCapabilities.entries()) {
      tools[serverName] = capabilities;
    }

    return tools;
  }

  /**
   * Check if agent has specific MCP capability
   */
  hasCapability(serverName, toolName) {
    const capabilities = this.toolCapabilities.get(serverName);
    return capabilities && capabilities.includes(toolName);
  }
}
