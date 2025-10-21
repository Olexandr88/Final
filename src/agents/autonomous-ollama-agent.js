#!/usr/bin/env node
/**
 * Autonomous Ollama Agent with Tool Calling
 * Extends A2AOllamaAgent with real tool execution capabilities
 * Uses Ollama's tool calling support for autonomous file ops, commands, git, etc.
 *
 * @module autonomous-ollama-agent
 */

import { BaseAgent } from './base-agent.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import { logger } from '../utils/logger.js';
import http from 'http';

/**
 * Autonomous Ollama Agent with full tool execution capabilities
 */
export class AutonomousOllamaAgent extends BaseAgent {
  constructor(config = {}) {
    super(config);

    // Ollama configuration
    this.ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = config.model || process.env.OLLAMA_MODEL || 'llama3.1';

    // Initialize conversation history tracking
    this.conversationHistory = new Map();

    // Initialize tool executor with permissions
    this.toolExecutor = new ToolExecutor(this.config.clientId, {
      file_read: true,
      file_write: true,
      command_exec: true,
      git_operations: true,
      code_analysis: true,
      test_execution: true,
    });

    // Track tool usage
    this.toolUsageStats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
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
        duration: event.duration,
      });
    });

    // Wait for tools to be ready before allowing agent to handle requests
    this._initPromise = this._initialize();

    logger.info('Autonomous Ollama Agent initializing...', {
      clientId: this.config.clientId,
      model: this.model,
      ollamaUrl: this.ollamaUrl,
    });
  }

  /**
   * Initialize agent (wait for tools)
   * @private
   */
  async _initialize() {
    try {
      await this.toolExecutor.waitForReady();
      logger.info('Autonomous Ollama Agent initialized', {
        clientId: this.config.clientId,
        availableTools: this.toolExecutor.getAvailableTools().length,
      });
    } catch (error) {
      logger.error('Failed to initialize autonomous Ollama agent', {
        error: error.message,
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
   * Handle intent with tool execution support
   * @override
   */
  async handleIntent(envelope) {
    // Ensure tools are loaded
    await this._ensureReady();

    const { from, to, payload, intent, taskId } = envelope;

    // Ignore messages not for us (check if envelope has 'to' field)
    if (to && to !== this.config.clientId && to !== null) {
      return;
    }

    try {
      logger.info(`Handling envelope`, {
        from,
        intent,
        taskId,
        hasPayload: !!payload,
      });

      // Extract message
      const userMessage = payload?.message || payload?.prompt || payload?.text || '';

      if (!userMessage) {
        this.sendResponse(envelope, {
          error: 'No message content provided',
          status: 'error',
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
        content: userMessage,
      });

      // Call Ollama with tool support
      const response = await this.callOllamaWithTools(history, envelope);

      // Send response back
      this.sendResponse(envelope, {
        response: response.text,
        tool_calls: response.toolCalls,
        status: 'success',
      });
    } catch (error) {
      logger.error('Failed to handle envelope', {
        error: error.message,
        envelope,
      });

      this.sendResponse(envelope, {
        error: error.message,
        status: 'error',
      });
    }
  }

  /**
   * Call Ollama with tool support and handle multi-turn tool use
   * @param {Array} history - Conversation history
   * @param {Object} envelope - Original envelope
   * @returns {Promise<Object>} Final response with text and tool calls
   */
  async callOllamaWithTools(history, envelope) {
    let continueConversation = true;
    let iterationCount = 0;
    const maxIterations = 10; // Prevent infinite loops
    const allToolCalls = [];

    while (continueConversation && iterationCount < maxIterations) {
      iterationCount++;

      logger.info(`Ollama iteration ${iterationCount}`, {
        historyLength: history.length,
      });

      // Prepare API call with tools
      const requestBody = {
        model: this.model,
        messages: history.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        tools: this.getToolDefinitions(),
        stream: false,
      };

      // Call Ollama
      const response = await this.callOllamaAPI('/api/chat', requestBody);

      // Check if Ollama wants to use tools
      const message = response.message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        logger.info(`Ollama requesting ${message.tool_calls.length} tool(s)`, {
          tools: message.tool_calls.map((t) => t.function.name),
        });

        // Add assistant message to history
        history.push({
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls,
        });

        // Execute tools
        const toolResults = await this.executeTools(message.tool_calls, envelope);
        allToolCalls.push(
          ...message.tool_calls.map((tc, idx) => ({
            name: tc.function.name,
            input: tc.function.arguments,
            result: toolResults[idx],
          }))
        );

        // Add tool results to history
        for (let i = 0; i < toolResults.length; i++) {
          history.push({
            role: 'tool',
            content: JSON.stringify(toolResults[i]),
          });
        }

        // Continue conversation to get final response
        continueConversation = true;
      } else {
        // No tool use, this is the final response
        history.push({
          role: 'assistant',
          content: message.content,
        });

        return {
          text: message.content || '',
          toolCalls: allToolCalls,
          iterations: iterationCount,
        };
      }
    }

    // Max iterations reached
    logger.warn('Max iterations reached in tool use loop', {
      iterations: iterationCount,
    });

    return {
      text: 'Maximum tool use iterations reached',
      toolCalls: allToolCalls,
      iterations: iterationCount,
    };
  }

  /**
   * Execute tools requested by Ollama
   * @param {Array} toolCalls - Tool call requests from Ollama
   * @param {Object} envelope - Original envelope for context
   * @returns {Promise<Array>} Tool results
   */
  async executeTools(toolCalls, envelope) {
    const results = [];

    for (const toolCall of toolCalls) {
      const { function: func } = toolCall;
      const { name, arguments: argsStr } = func;

      logger.info(`Executing tool: ${name}`, { arguments: argsStr });

      try {
        // Parse arguments
        const args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;

        // Execute tool via ToolExecutor
        const result = await this.toolExecutor.executeTool(name, args, {
          taskId: envelope.taskId,
          from: envelope.from,
        });

        results.push(result.result);

        logger.info(`Tool execution successful: ${name}`);
      } catch (error) {
        logger.error(`Tool execution failed: ${name}`, {
          error: error.message,
        });

        results.push({
          error: `Tool execution failed: ${error.message}`,
        });
      }
    }

    return results;
  }

  /**
   * Get tool definitions for Ollama API (OpenAI-compatible format)
   * @returns {Array<Object>} Tool definitions
   */
  getToolDefinitions() {
    return [
      {
        type: 'function',
        function: {
          name: 'read',
          description: 'Read contents of a file from the filesystem',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the file to read',
              },
              encoding: {
                type: 'string',
                description: 'File encoding (default: utf-8)',
                enum: ['utf-8', 'ascii', 'base64'],
              },
            },
            required: ['file_path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'write',
          description: "Write content to a file, creating it if it doesn't exist",
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the file to write',
              },
              content: {
                type: 'string',
                description: 'Content to write to the file',
              },
              encoding: {
                type: 'string',
                description: 'File encoding (default: utf-8)',
              },
            },
            required: ['file_path', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'glob',
          description: 'Find files matching a glob pattern',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Glob pattern (e.g., "**/*.js", "src/**/*.ts")',
              },
              cwd: {
                type: 'string',
                description: 'Working directory for search',
              },
            },
            required: ['pattern'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'bash',
          description: 'Execute a shell command',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'Shell command to execute',
              },
              args: {
                type: 'array',
                items: { type: 'string' },
                description: 'Command arguments',
              },
              cwd: {
                type: 'string',
                description: 'Working directory',
              },
            },
            required: ['command'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'git_status',
          description: 'Get git repository status',
          parameters: {
            type: 'object',
            properties: {
              cwd: {
                type: 'string',
                description: 'Repository directory',
              },
            },
          },
        },
      },
    ];
  }

  /**
   * Call Ollama API
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @returns {Promise<Object>} API response
   */
  async callOllamaAPI(endpoint, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.ollamaUrl);
      const postData = JSON.stringify(body);

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 120000, // 2 minutes for model inference
      };

      const req = http.request(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse Ollama response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Ollama API request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama API request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Get tool usage statistics
   * @returns {Object} Tool usage stats
   */
  getToolStats() {
    return {
      ...this.toolUsageStats,
      successRate:
        this.toolUsageStats.totalCalls > 0
          ? ((this.toolUsageStats.successfulCalls / this.toolUsageStats.totalCalls) * 100).toFixed(
              2
            ) + '%'
          : '0%',
      executorMetrics: this.toolExecutor.getMetrics(),
    };
  }
}

// If run directly, start the agent
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const agent = new AutonomousOllamaAgent({
    clientId: 'autonomous-ollama-agent',
    role: 'autonomous-assistant',
    bridgeUrl: process.env.BRIDGE_WS || 'ws://localhost:65028',
    intents: [
      'code.analyze',
      'code.fix',
      'code.refactor',
      'file.read',
      'file.write',
      'command.execute',
      'test.run',
    ],
    model: process.env.OLLAMA_MODEL || 'llama3.1',
  });

  agent
    .connect()
    .then(() => {
      logger.info('✅ Autonomous Ollama Agent connected and ready');
      logger.info(`Available tools: ${agent.toolExecutor.getAvailableTools().join(', ')}`);
      logger.info(`Model: ${agent.model}`);
    })
    .catch((error) => {
      logger.error('Failed to connect Autonomous Ollama Agent', { error: error.message });
      process.exit(1);
    });
}

export default AutonomousOllamaAgent;
