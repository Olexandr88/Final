#!/usr/bin/env node
/**
 * Autonomous Claude Agent with Tool Calling
 * Extended thinking, multi-turn tool use, and autonomous task execution
 *
 * @module autonomous-claude-agent
 */

import { BaseAgent } from './base-agent.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import { logger } from '../utils/logger.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Autonomous Claude Agent with full tool execution capabilities
 */
export class AutonomousClaudeAgent extends BaseAgent {
  constructor(config = {}) {
    super(config);

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Initialize conversation history tracking
    this.conversationHistory = new Map();

    // Initialize tool executor with permissions
    this.toolExecutor = new ToolExecutor(this.config.clientId, {
      file_read: true,
      file_write: true,
      command_exec: true,
      git_operations: true,
      code_analysis: true,
      test_execution: true
    });

    // Track tool usage
    this.toolUsageStats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0
    };

    // Listen to tool execution events
    this.toolExecutor.on('toolExecuted', (event) => {
      this.toolUsageStats.totalCalls++;
      if (event.success) {
        this.toolUsageStats.successfulCalls++;
      } else {
        this.toolUsageStats.failedCalls++;
      }

      logger.info(`Tool executed: ${event.tool}`, {
        agent: this.config.clientId,
        success: event.success,
        duration: event.duration
      });
    });

    // Extended thinking configuration
    this.extendedThinking = config.extendedThinking !== false;
    this.thinkingBudget = config.thinkingBudget || 10000;

    // Wait for tools to be ready before allowing agent to handle requests
    this._initPromise = this._initialize();

    logger.info('Autonomous Claude Agent initializing...', {
      clientId: this.config.clientId,
      extendedThinking: this.extendedThinking,
      thinkingBudget: this.thinkingBudget
    });
  }

  /**
   * Initialize agent (wait for tools)
   * @private
   */
  async _initialize() {
    try {
      await this.toolExecutor.waitForReady();
      logger.info('Autonomous Claude Agent initialized', {
        clientId: this.config.clientId,
        availableTools: this.toolExecutor.getAvailableTools().length
      });
    } catch (error) {
      logger.error('Failed to initialize autonomous agent', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Ensure agent is ready before handling requests
   * @private
   */
  async _ensureReady() {
    if (this._initPromise) {
      await this._initPromise;
    }
  }

  /**
   * Handle envelope with tool execution support
   * @override
   */
  async handleEnvelope(envelope) {
    // Ensure tools are loaded
    await this._ensureReady();

    const { from, to, payload, intent, taskId } = envelope;

    // Ignore messages not for us
    if (to !== this.config.clientId && to !== null) {
      return;
    }

    try {
      logger.info(`Handling envelope`, {
        from,
        intent,
        taskId,
        hasPayload: !!payload
      });

      // Extract message
      const userMessage = payload?.message || payload?.prompt || payload?.text || '';

      if (!userMessage) {
        this.sendResponse(envelope, {
          error: 'No message content provided',
          status: 'error'
        });
        return;
      }

      // Get or create conversation history
      const historyKey = taskId || from || 'default';
      if (!this.conversationHistory.has(historyKey)) {
        this.conversationHistory.set(historyKey, []);
      }
      const history = this.conversationHistory.get(historyKey);

      // Add user message to history
      history.push({
        role: 'user',
        content: userMessage
      });

      // Call Claude with tool support and extended thinking
      const response = await this.callClaudeWithTools(history, envelope);

      // Send response back
      this.sendResponse(envelope, {
        response: response.text,
        thinking: response.thinking,
        tool_calls: response.toolCalls,
        status: 'success'
      });

    } catch (error) {
      logger.error('Failed to handle envelope', {
        error: error.message,
        envelope
      });

      this.sendResponse(envelope, {
        error: error.message,
        status: 'error'
      });
    }
  }

  /**
   * Call Claude with tool support and handle multi-turn tool use
   * @param {Array} history - Conversation history
   * @param {Object} envelope - Original envelope
   * @returns {Promise<Object>} Final response with text and tool calls
   */
  async callClaudeWithTools(history, envelope) {
    let continueConversation = true;
    let iterationCount = 0;
    const maxIterations = 10; // Prevent infinite loops
    const allToolCalls = [];
    let thinkingContent = [];

    while (continueConversation && iterationCount < maxIterations) {
      iterationCount++;

      logger.info(`Claude iteration ${iterationCount}`, {
        historyLength: history.length
      });

      // Prepare API call with extended thinking and tools
      const apiParams = {
        model: 'claude-sonnet-4-5-20250929', // Latest model with extended thinking
        max_tokens: 8000,
        messages: history
      };

      // Add extended thinking if enabled
      if (this.extendedThinking) {
        apiParams.thinking = {
          type: 'enabled',
          budget_tokens: this.thinkingBudget
        };
      }

      // Add tool definitions
      apiParams.tools = this.getToolDefinitions();

      // Call Claude
      const response = await this.client.messages.create(apiParams);

      // Extract thinking content if present
      const thinking = response.content.filter(c => c.type === 'thinking');
      if (thinking.length > 0) {
        thinkingContent.push(...thinking.map(t => t.thinking));
      }

      // Check if Claude wants to use tools
      const toolUses = response.content.filter(c => c.type === 'tool_use');

      if (toolUses.length > 0) {
        logger.info(`Claude requesting ${toolUses.length} tool(s)`, {
          tools: toolUses.map(t => t.name)
        });

        // Add assistant message to history
        history.push({
          role: 'assistant',
          content: response.content
        });

        // Execute tools
        const toolResults = await this.executeTools(toolUses, envelope);
        allToolCalls.push(...toolUses.map(t => ({
          name: t.name,
          input: t.input,
          result: toolResults.find(r => r.tool_use_id === t.id)?.content
        })));

        // Add tool results to history
        history.push({
          role: 'user',
          content: toolResults
        });

        // Continue conversation to get final response
        continueConversation = true;
      } else {
        // No tool use, this is the final response
        const textContent = response.content.find(c => c.type === 'text');

        // Add assistant message to history
        history.push({
          role: 'assistant',
          content: response.content
        });

        return {
          text: textContent?.text || '',
          thinking: thinkingContent.join('\n\n'),
          toolCalls: allToolCalls,
          iterations: iterationCount
        };
      }
    }

    // Max iterations reached
    logger.warn('Max iterations reached in tool use loop', {
      iterations: iterationCount
    });

    return {
      text: 'Maximum tool use iterations reached',
      thinking: thinkingContent.join('\n\n'),
      toolCalls: allToolCalls,
      iterations: iterationCount
    };
  }

  /**
   * Execute tools requested by Claude
   * @param {Array} toolUses - Tool use requests from Claude
   * @param {Object} envelope - Original envelope for context
   * @returns {Promise<Array>} Tool results
   */
  async executeTools(toolUses, envelope) {
    const results = [];

    for (const toolUse of toolUses) {
      const { id, name, input } = toolUse;

      logger.info(`Executing tool: ${name}`, { input });

      try {
        // Execute tool via ToolExecutor
        const result = await this.toolExecutor.executeTool(
          name,
          input,
          { taskId: envelope.taskId, from: envelope.from }
        );

        results.push({
          type: 'tool_result',
          tool_use_id: id,
          content: JSON.stringify(result.result)
        });

        logger.info(`Tool execution successful: ${name}`);
      } catch (error) {
        logger.error(`Tool execution failed: ${name}`, {
          error: error.message
        });

        results.push({
          type: 'tool_result',
          tool_use_id: id,
          is_error: true,
          content: `Tool execution failed: ${error.message}`
        });
      }
    }

    return results;
  }

  /**
   * Get tool definitions for Claude API
   * @returns {Array<Object>} Tool definitions
   */
  getToolDefinitions() {
    return [
      {
        name: 'read',
        description: 'Read contents of a file from the filesystem',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file to read'
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf-8)',
              enum: ['utf-8', 'ascii', 'base64']
            }
          },
          required: ['file_path']
        }
      },
      {
        name: 'write',
        description: 'Write content to a file, creating it if it doesn\'t exist',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file to write'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf-8)'
            }
          },
          required: ['file_path', 'content']
        }
      },
      {
        name: 'edit',
        description: 'Edit a file with line-based modifications',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file to edit'
            },
            edits: {
              type: 'array',
              description: 'Array of edit operations',
              items: {
                type: 'object',
                properties: {
                  line: {
                    type: 'number',
                    description: 'Line number to edit (1-based)'
                  },
                  operation: {
                    type: 'string',
                    enum: ['replace', 'insert', 'delete'],
                    description: 'Edit operation type'
                  },
                  content: {
                    type: 'string',
                    description: 'New content for replace/insert operations'
                  }
                },
                required: ['line', 'operation']
              }
            }
          },
          required: ['file_path', 'edits']
        }
      },
      {
        name: 'glob',
        description: 'Find files matching a glob pattern',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern (e.g., "**/*.js", "src/**/*.ts")'
            },
            cwd: {
              type: 'string',
              description: 'Working directory for search'
            },
            ignore: {
              type: 'array',
              items: { type: 'string' },
              description: 'Patterns to ignore'
            }
          },
          required: ['pattern']
        }
      },
      {
        name: 'grep',
        description: 'Search file contents for a pattern (like grep/ripgrep)',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Search pattern (regex supported)'
            },
            path: {
              type: 'string',
              description: 'Path to search in (default: current directory)'
            },
            case_sensitive: {
              type: 'boolean',
              description: 'Case sensitive search (default: false)'
            }
          },
          required: ['pattern']
        }
      },
      {
        name: 'bash',
        description: 'Execute a shell command',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute'
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'Command arguments'
            },
            cwd: {
              type: 'string',
              description: 'Working directory'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (max: 60000)'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'npm',
        description: 'Run an npm command',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'NPM command (e.g., "install", "test", "run build")'
            },
            cwd: {
              type: 'string',
              description: 'Working directory'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'git_status',
        description: 'Get git repository status',
        input_schema: {
          type: 'object',
          properties: {
            cwd: {
              type: 'string',
              description: 'Repository directory'
            }
          }
        }
      },
      {
        name: 'git_diff',
        description: 'Get git diff for changes',
        input_schema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Specific file to diff (optional)'
            },
            staged: {
              type: 'boolean',
              description: 'Show staged changes only'
            },
            cwd: {
              type: 'string',
              description: 'Repository directory'
            }
          }
        }
      },
      {
        name: 'git_commit',
        description: 'Commit changes to git',
        input_schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Commit message'
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to commit (optional, commits all if empty)'
            },
            cwd: {
              type: 'string',
              description: 'Repository directory'
            }
          },
          required: ['message']
        }
      },
      {
        name: 'analyze_code',
        description: 'Analyze code for issues, bugs, and code smells',
        input_schema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Code to analyze'
            },
            language: {
              type: 'string',
              description: 'Programming language (js, ts, py, etc.)'
            },
            file_path: {
              type: 'string',
              description: 'File path for context'
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'run_tests',
        description: 'Run test suite',
        input_schema: {
          type: 'object',
          properties: {
            test_pattern: {
              type: 'string',
              description: 'Test file pattern'
            },
            framework: {
              type: 'string',
              enum: ['node:test', 'jest', 'mocha', 'vitest'],
              description: 'Test framework to use'
            },
            cwd: {
              type: 'string',
              description: 'Working directory'
            },
            coverage: {
              type: 'boolean',
              description: 'Generate coverage report'
            }
          }
        }
      }
    ];
  }

  /**
   * Get tool usage statistics
   * @returns {Object} Tool usage stats
   */
  getToolStats() {
    return {
      ...this.toolUsageStats,
      successRate: this.toolUsageStats.totalCalls > 0
        ? ((this.toolUsageStats.successfulCalls / this.toolUsageStats.totalCalls) * 100).toFixed(2) + '%'
        : '0%',
      executorMetrics: this.toolExecutor.getMetrics()
    };
  }
}

// If run directly, start the agent
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const agent = new AutonomousClaudeAgent({
    clientId: 'autonomous-claude-agent',
    role: 'autonomous-assistant',
    bridgeUrl: process.env.BRIDGE_WS || 'ws://localhost:65028',
    intents: [
      'code.analyze',
      'code.fix',
      'code.refactor',
      'file.read',
      'file.write',
      'command.execute',
      'test.run'
    ],
    extendedThinking: true,
    thinkingBudget: 10000
  });

  agent.connect().then(() => {
    logger.info('✅ Autonomous Claude Agent connected and ready');
    logger.info(`Available tools: ${agent.toolExecutor.getAvailableTools().join(', ')}`);
  }).catch(error => {
    logger.error('Failed to connect Autonomous Claude Agent', { error: error.message });
    process.exit(1);
  });
}

export default AutonomousClaudeAgent;
