#!/usr/bin/env node
/**
 * Model Context Protocol (MCP) Server Implementation
 * Provides standardized tool access for IDE integration
 *
 * @module mcp-server
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';
import { logger } from '../utils/logger.js';
import { JulesClient } from '../jules-client.js';
import ContextAwareAnalyzer from '../agents/context-aware-analyzer.js';
import SessionManager from '../session-manager.js';

config();

const importWithFallback = async (primary, fallback) => {
  try {
    return await import(primary);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      return import(fallback);
    }
    throw error;
  }
};

const { Server } = await importWithFallback(
  '@modelcontextprotocol/sdk/server/index.js',
  '@modelcontextprotocol/sdk/dist/esm/server/index.js'
);

const { StdioServerTransport } = await importWithFallback(
  '@modelcontextprotocol/sdk/server/stdio.js',
  '@modelcontextprotocol/sdk/dist/esm/server/stdio.js'
);

const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} = await importWithFallback(
  '@modelcontextprotocol/sdk/types.js',
  '@modelcontextprotocol/sdk/dist/esm/types.js'
);

/**
 * MCP Server for LLM Framework
 * Exposes code analysis, testing, and file operations
 */
export class MCPServer {
  constructor(options = {}, additionalTools = []) {
    this.options = {
      name: options.name || 'llm-framework-mcp',
      version: options.version || '1.0.0',
      debug: options.debug || false,
      workingDir: options.workingDir || process.cwd(),
      ...options
    };

    this.server = new Server(
      {
        name: this.options.name,
        version: this.options.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Initialize components
    this.analyzer = new ContextAwareAnalyzer();
    this.sessionManager = new SessionManager();
    this.sessionId = this.sessionManager.register();
    this.julesClient = new JulesClient(options.julesApiKey);

    // Tool definitions
    this.tools = [...this._getBaseTools(), ...additionalTools];

    // Setup handlers
    this._setupHandlers();

    logger.info('MCP Server initialized', {
      name: this.options.name,
      version: this.options.version,
      sessionId: this.sessionId.slice(0, 8)
    });
  }

  /**
   * Define available base MCP tools
   */
  _getBaseTools() {
    return [
      {
        name: 'analyze_code',
        description: 'Analyze code for bugs, security issues, and quality metrics',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Source code to analyze'
            },
            filepath: {
              type: 'string',
              description: 'File path (optional, for context)'
            },
            language: {
              type: 'string',
              description: 'Programming language (auto-detected if not provided)'
            }
          },
          required: ['code']
        }
      },
      {
        name: 'run_tests',
        description: 'Execute test suite and return results',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Test file pattern (e.g., "tests/**/*.test.js")'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (default: 30000)'
            },
            parallel: {
              type: 'boolean',
              description: 'Run tests in parallel (default: true)'
            }
          }
        }
      },
      {
        name: 'get_context',
        description: 'Retrieve session context and state information',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID (uses current session if not provided)'
            },
            includeHistory: {
              type: 'boolean',
              description: 'Include log history (default: false)'
            }
          }
        }
      },
      {
        name: 'execute_command',
        description: 'Execute shell command safely with timeout and validation',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute'
            },
            cwd: {
              type: 'string',
              description: 'Working directory (default: project root)'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (default: 10000)'
            },
            env: {
              type: 'object',
              description: 'Environment variables'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'read_file',
        description: 'Read file contents with encoding support',
        inputSchema: {
          type: 'object',
          properties: {
            filepath: {
              type: 'string',
              description: 'Absolute or relative file path'
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf-8)'
            },
            maxSize: {
              type: 'number',
              description: 'Maximum file size in bytes (default: 1MB)'
            }
          },
          required: ['filepath']
        }
      },
      {
        name: 'write_file',
        description: 'Write content to file with backup and validation',
        inputSchema: {
          type: 'object',
          properties: {
            filepath: {
              type: 'string',
              description: 'Absolute or relative file path'
            },
            content: {
              type: 'string',
              description: 'File content to write'
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf-8)'
            },
            createBackup: {
              type: 'boolean',
              description: 'Create backup before overwriting (default: true)'
            }
          },
          required: ['filepath', 'content']
        }
      },
      {
        name: 'jules_list_sessions',
        description: 'List Jules sessions available for the configured API key',
        inputSchema: {
          type: 'object',
          properties: {
            page_size: {
              type: 'number',
              description: 'Number of sessions per page (default 10)',
              default: 10
            },
            page_token: {
              type: 'string',
              description: 'Pagination token from a previous list call'
            }
          }
        }
      },
      {
        name: 'jules_get_session',
        description: 'Fetch details for a single Jules session',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Session identifier (numeric ID or resource name)'
            }
          },
          required: ['session_id']
        }
      },
      {
        name: 'jules_create_session',
        description: 'Create a new Jules session for a repository/source',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Task prompt for Jules'
            },
            source_id: {
              type: 'string',
              description: 'Source identifier (e.g., sources/github/owner/repo)'
            },
            title: {
              type: 'string',
              description: 'Optional session title'
            },
            starting_branch: {
              type: 'string',
              description: 'Repository branch to analyze (default: main)',
              default: 'main'
            }
          },
          required: ['prompt', 'source_id']
        }
      },
      {
        name: 'jules_send_message',
        description: 'Send a follow-up message to an existing Jules session',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Target session identifier'
            },
            message: {
              type: 'string',
              description: 'Message content to send'
            }
          },
          required: ['session_id', 'message']
        }
      },
      {
        name: 'list_tools',
        description: 'Lists all tools available on this MCP server.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }
    ];
  }

  /**
   * Setup request handlers
   */
  _setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('MCP: List tools request');
      return {
        tools: this.tools.map(tool => ({ // Return a copy of tools with only definition properties
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema, // Map inputSchema to parameters for consistency
        }))
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info('MCP: Tool call', { tool: name, args });

      try {
        // Find the executor for the tool
        const toolExecutor = this.tools.find(tool => tool.name === name)?.executor;

        if (!toolExecutor) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
        }

        const result = await toolExecutor(args);

        logger.debug('MCP: Tool call success', { tool: name });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('MCP: Tool call failed', {
          tool: name,
          error: error.message
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });

    // Error handler
    this.server.onerror = (error) => {
      logger.error('MCP Server error', { error: error.message });
    };

    // Cleanup on close
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Handle analyze_code tool
   */
  async _handleAnalyzeCode(args) {
    const { code, filepath = 'unknown', language } = args;

    if (!code) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Code parameter is required'
      );
    }

    const analysis = this.analyzer.analyzeWithContext(code, filepath, {
      language,
      source: 'mcp-server'
    });

    return {
      success: true,
      filepath: analysis.filePath,
      metrics: {
        qualityScore: analysis.metrics?.qualityScore || 0,
        complexity: analysis.metrics?.complexity || 0,
        maintainability: analysis.metrics?.maintainability || 0
      },
      issues: {
        total: analysis.issues?.length || 0,
        errors: analysis.issues?.filter(i => i.severity === 'error').length || 0,
        warnings: analysis.issues?.filter(i => i.severity === 'warning').length || 0,
        info: analysis.issues?.filter(i => i.severity === 'info').length || 0
      },
      details: analysis.issues?.map(issue => ({
        line: issue.line,
        severity: issue.severity,
        message: issue.message,
        category: issue.category
      })) || [],
      recommendations: analysis.recommendations || []
    };
  }

  /**
   * Handle run_tests tool
   */
  async _handleRunTests(args) {
    const {
      pattern = 'tests',
      timeout = 30000,
      parallel = true
    } = args;

    try {
      const concurrency = parallel ? 4 : 1;
      const command = `node --test --test-concurrency=${concurrency} ${pattern}`;

      const output = execSync(command, {
        cwd: this.options.workingDir,
        timeout,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'test' }
      });

      // Parse test output
      const lines = output.split('\n');
      const results = {
        success: true,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        output: output
      };

      // Extract test results (basic parsing)
      for (const line of lines) {
        if (line.includes('tests passed')) {
          const match = line.match(/(\d+) tests passed/);
          if (match) results.passed = parseInt(match[1], 10);
        }
        if (line.includes('failed')) {
          const match = line.match(/(\d+) failed/);
          if (match) results.failed = parseInt(match[1], 10);
        }
      }

      return results;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString() || '',
        stdout: error.stdout?.toString() || ''
      };
    }
  }

  /**
   * Handle get_context tool
   */
  async _handleGetContext(args) {
    const {
      sessionId = this.sessionId,
      includeHistory = false
    } = args;

    const sessionInfo = this.sessionManager.getSessionInfo(sessionId);

    if (!sessionInfo) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Session not found: ${sessionId}`
      );
    }

    const context = {
      session: {
        id: sessionInfo.id,
        pid: sessionInfo.pid,
        startTime: sessionInfo.start_time,
        lastHeartbeat: sessionInfo.last_heartbeat,
        status: sessionInfo.status,
        currentTask: sessionInfo.current_task,
        cwd: sessionInfo.cwd,
        uptime: Date.now() - sessionInfo.start_time
      },
      locks: sessionInfo.locks || [],
      workingDirectory: this.options.workingDir
    };

    if (includeHistory) {
      context.logHistory = logger.getHistory({ limit: 100 });
    }

    return context;
  }

  /**
   * Handle execute_command tool
   */
  async _handleExecuteCommand(args) {
    const {
      command,
      cwd = this.options.workingDir,
      timeout = 10000,
      env = {}
    } = args;

    if (!command) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Command parameter is required'
      );
    }

    // Basic command validation (prevent dangerous commands)
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /format\s+c:/i,
      /del\s+\/[sq]/i,
      /dd\s+if=/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Command contains dangerous operations'
        );
      }
    }

    try {
      const output = execSync(command, {
        cwd,
        timeout,
        encoding: 'utf-8',
        env: { ...process.env, ...env }
      });

      return {
        success: true,
        exitCode: 0,
        stdout: output,
        stderr: ''
      };
    } catch (error) {
      return {
        success: false,
        exitCode: error.status || 1,
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message
      };
    }
  }

  /**
   * Handle read_file tool
   */
  async _handleReadFile(args) {
    const {
      filepath,
      encoding = 'utf-8',
      maxSize = 1024 * 1024 // 1MB
    } = args;

    if (!filepath) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Filepath parameter is required'
      );
    }

    // Resolve path
    const absolutePath = path.isAbsolute(filepath)
      ? filepath
      : path.join(this.options.workingDir, filepath);

    try {
      // Check file size
      const stats = await fs.stat(absolutePath);
      if (stats.size > maxSize) {
        throw new Error(`File size exceeds maximum (${maxSize} bytes)`);
      }

      // Read file
      const content = await fs.readFile(absolutePath, encoding);

      return {
        success: true,
        filepath: absolutePath,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read file: ${error.message}`
      );
    }
  }

  /**
   * Handle write_file tool
   */
  async _handleWriteFile(args) {
    const {
      filepath,
      content,
      encoding = 'utf-8',
      createBackup = true
    } = args;

    if (!filepath || content === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Filepath and content parameters are required'
      );
    }

    // Resolve path
    const absolutePath = path.isAbsolute(filepath)
      ? filepath
      : path.join(this.options.workingDir, filepath);

    try {
      // Create backup if file exists
      if (createBackup) {
        try {
          await fs.access(absolutePath);
          const backupPath = `${absolutePath}.backup`;
          await fs.copyFile(absolutePath, backupPath);
          logger.debug('Created backup', { backup: backupPath });
        } catch (_error) {
          // File doesn't exist, no backup needed
        }
      }

      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(absolutePath, content, encoding);

      const stats = await fs.stat(absolutePath);

      return {
        success: true,
        filepath: absolutePath,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to write file: ${error.message}`
      );
    }
  }

  /**
   * Ensure Jules API is configured
   */
  _ensureJulesConfigured() {
    if (!this.julesClient?.apiKey) {
      throw new McpError(
        ErrorCode.InternalError,
        'JULES_API_KEY is not configured. Set it in your environment or .env file to use Jules tools.'
      );
    }
  }

  /**
   * Handle jules_list_sessions tool
   */
  async _handleJulesListSessions(args = {}) {
    this._ensureJulesConfigured();

    const { page_size: pageSize, page_token: pageToken } = args;

    const result = await this.julesClient.listSessions({
      pageSize,
      pageToken
    });

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Failed to list Jules sessions.'
      );
    }

    return {
      success: true,
      sessions: result.data?.sessions || [],
      nextPageToken: result.data?.nextPageToken || null
    };
  }

  /**
   * Handle jules_get_session tool
   */
  async _handleJulesGetSession(args = {}) {
    this._ensureJulesConfigured();

    const rawSessionId = args.session_id;

    if (!rawSessionId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'session_id parameter is required'
      );
    }

    const sessionId = rawSessionId.startsWith('sessions/')
      ? rawSessionId.split('/').pop()
      : rawSessionId;

    const result = await this.julesClient.getSession(sessionId);

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Failed to fetch Jules session.'
      );
    }

    return {
      success: true,
      sessionId: rawSessionId,
      session: result.data
    };
  }

  /**
   * Handle jules_create_session tool
   */
  async _handleJulesCreateSession(args = {}) {
    this._ensureJulesConfigured();

    const {
      prompt,
      source_id: sourceId,
      title,
      starting_branch: startingBranch = 'main'
    } = args;

    if (!prompt || !sourceId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'prompt and source_id parameters are required'
      );
    }

    const result = await this.julesClient.createSession({
      prompt,
      sourceId,
      title,
      startingBranch
    });

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Failed to create Jules session.'
      );
    }

    return {
      success: true,
      sessionId: result.sessionId,
      data: result.data
    };
  }

  /**
   * Handle jules_send_message tool
   */
  async _handleJulesSendMessage(args = {}) {
    this._ensureJulesConfigured();

    const rawSessionId = args.session_id;
    const message = args.message;

    if (!rawSessionId || !message) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'session_id and message parameters are required'
      );
    }

    const sessionId = rawSessionId.startsWith('sessions/')
      ? rawSessionId.split('/').pop()
      : rawSessionId;

    const result = await this.julesClient.sendMessage(sessionId, message);

    if (!result.success) {
      throw new McpError(
        ErrorCode.InternalError,
        result.error || 'Failed to send message to Jules session.'
      );
    }

    return {
      success: true,
      sessionId: rawSessionId,
      data: result.data
    };
  }

  /**
   * Handle list_tools tool
   */
  async _handleListTools(args) {
    return {
      success: true,
      tools: this.tools,
    };
  }

  /**
   * Start the MCP server
   */
  async start() {
    logger.info('Starting MCP Server', {
      name: this.options.name,
      version: this.options.version
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (typeof transport._stdin?.resume === 'function') {
      transport._stdin.resume();
    } else if (typeof process.stdin.resume === 'function') {
      process.stdin.resume();
    }

    logger.info('MCP Server started - listening on stdio');
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('MCP Server shutting down');

    try {
      await this.sessionManager.cleanup();
      await this.server.close();
      logger.info('MCP Server stopped');
    } catch (error) {
      logger.error('Cleanup error', { error: error.message });
    }
  }
}

export default MCPServer;
