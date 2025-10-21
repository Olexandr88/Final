#!/usr/bin/env node
/**
 * Continue-Ollama MCP Server
 * Provides Ollama integration for VS Code Continue extension via MCP
 * Features: Auto-detection, streaming autocomplete, agent mode, full tool access
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { OllamaModelDetector } from './ollama-model-detector.js';
import { OllamaCloudClient } from '../clients/ollama-cloud-client.js';
import { logger } from '../utils/logger.js';
import { CONTINUE_MCP_CONFIG } from '../config/continue-mcp-config.js';

class ContinueOllamaMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'continue-ollama-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.modelDetector = new OllamaModelDetector(CONTINUE_MCP_CONFIG);
    this.ollamaClient = new OllamaCloudClient({
      endpoint: CONTINUE_MCP_CONFIG.ollama.endpoint,
      model: CONTINUE_MCP_CONFIG.ollama.defaultModel,
      streamingEnabled: true,
      healthCheckInterval: CONTINUE_MCP_CONFIG.health.checkInterval
    });

    this.conversationHistory = new Map(); // For agent mode
    this.activeModel = CONTINUE_MCP_CONFIG.ollama.defaultModel;

    this._setupHandlers();
  }

  _setupHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_models',
            description: 'Auto-detect and list all available Ollama models with capabilities',
            inputSchema: {
              type: 'object',
              properties: {
                refresh: {
                  type: 'boolean',
                  description: 'Force refresh model list from Ollama API'
                }
              }
            }
          },
          {
            name: 'select_model',
            description: 'Select active Ollama model for subsequent operations',
            inputSchema: {
              type: 'object',
              properties: {
                model: {
                  type: 'string',
                  description: 'Model name (e.g., llama3, codellama, mistral)'
                }
              },
              required: ['model']
            }
          },
          {
            name: 'autocomplete',
            description: 'Stream code completion/autocomplete with Ollama',
            inputSchema: {
              type: 'object',
              properties: {
                prefix: {
                  type: 'string',
                  description: 'Code before cursor'
                },
                suffix: {
                  type: 'string',
                  description: 'Code after cursor'
                },
                language: {
                  type: 'string',
                  description: 'Programming language'
                },
                maxTokens: {
                  type: 'number',
                  description: 'Maximum tokens to generate',
                  default: 100
                }
              },
              required: ['prefix']
            }
          },
          {
            name: 'chat',
            description: 'Agent mode conversation with context retention',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'User message'
                },
                sessionId: {
                  type: 'string',
                  description: 'Conversation session ID'
                },
                systemPrompt: {
                  type: 'string',
                  description: 'Optional system prompt'
                }
              },
              required: ['message']
            }
          },
          {
            name: 'analyze_code',
            description: 'Analyze code for patterns, issues, and improvements',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Code to analyze'
                },
                language: {
                  type: 'string',
                  description: 'Programming language'
                },
                focusAreas: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Analysis focus: security, performance, style, bugs'
                }
              },
              required: ['code']
            }
          },
          {
            name: 'refactor_code',
            description: 'Get code refactoring suggestions',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Code to refactor'
                },
                language: {
                  type: 'string',
                  description: 'Programming language'
                },
                refactorType: {
                  type: 'string',
                  enum: ['optimize', 'modernize', 'simplify', 'extract'],
                  description: 'Type of refactoring'
                }
              },
              required: ['code']
            }
          }
        ]
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_models':
            return await this._handleListModels(args);
          case 'select_model':
            return await this._handleSelectModel(args);
          case 'autocomplete':
            return await this._handleAutocomplete(args);
          case 'chat':
            return await this._handleChat(args);
          case 'analyze_code':
            return await this._handleAnalyzeCode(args);
          case 'refactor_code':
            return await this._handleRefactorCode(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error('Tool execution error', { tool: name, error: error.message });
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });

    logger.info('Continue-Ollama MCP Server handlers configured');
  }

  async _handleListModels(args) {
    const refresh = args.refresh || false;
    const models = await this.modelDetector.detectModels(refresh);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          models: models.map(m => ({
            name: m.name,
            size: m.size,
            modified: m.modified_at,
            family: m.details?.family,
            format: m.details?.format,
            parameterSize: m.details?.parameter_size,
            quantization: m.details?.quantization_level,
            capabilities: m.capabilities
          })),
          activeModel: this.activeModel,
          cached: !refresh,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }

  async _handleSelectModel(args) {
    const { model } = args;
    const models = await this.modelDetector.detectModels();
    const modelExists = models.some(m => m.name === model);

    if (!modelExists) {
      throw new Error(`Model '${model}' not found. Available: ${models.map(m => m.name).join(', ')}`);
    }

    this.activeModel = model;
    this.ollamaClient.config.model = model;

    logger.info('Model selected', { model });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          previousModel: this.ollamaClient.config.model,
          activeModel: this.activeModel,
          message: `Switched to model: ${model}`
        })
      }]
    };
  }

  async _handleAutocomplete(args) {
    const { prefix, suffix = '', language = 'javascript', maxTokens = 100 } = args;

    const prompt = `Complete the following ${language} code. Only return the completion, no explanations.

Code before cursor:
${prefix}

Code after cursor:
${suffix}

Completion:`;

    try {
      let completion = '';

      // Use streaming for low-latency autocomplete
      await this.ollamaClient.generateStream({
        model: this.activeModel,
        prompt,
        num_predict: maxTokens,
        temperature: 0.2, // Low temperature for more deterministic completions
        stop: ['\\n\\n', '```'] // Stop at double newline or code fence
      }, (token) => {
        completion += token;
      });

      // Extract only the code completion (remove any markdown or explanations)
      const cleanCompletion = completion.split('```')[0].trim();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            completion: cleanCompletion,
            model: this.activeModel,
            language,
            latency: 'streaming'
          })
        }]
      };
    } catch (error) {
      logger.error('Autocomplete failed', { error: error.message });
      throw error;
    }
  }

  async _handleChat(args) {
    const { message, sessionId = 'default', systemPrompt } = args;

    // Get or create conversation history
    if (!this.conversationHistory.has(sessionId)) {
      this.conversationHistory.set(sessionId, []);
    }

    const history = this.conversationHistory.get(sessionId);

    // Build conversation context
    let fullPrompt = '';
    if (systemPrompt) {
      fullPrompt += `System: ${systemPrompt}\\n\\n`;
    }

    // Add history (last 10 exchanges to keep context manageable)
    const recentHistory = history.slice(-10);
    for (const exchange of recentHistory) {
      fullPrompt += `User: ${exchange.user}\\nAssistant: ${exchange.assistant}\\n\\n`;
    }

    fullPrompt += `User: ${message}\\nAssistant:`;

    try {
      const result = await this.ollamaClient.generate({
        model: this.activeModel,
        prompt: fullPrompt,
        temperature: 0.7
      });

      // Store in history
      history.push({
        user: message,
        assistant: result.response,
        timestamp: new Date().toISOString()
      });

      // Limit history size
      if (history.length > 50) {
        history.splice(0, history.length - 50);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            response: result.response,
            sessionId,
            model: this.activeModel,
            historyLength: history.length
          })
        }]
      };
    } catch (error) {
      logger.error('Chat failed', { error: error.message, sessionId });
      throw error;
    }
  }

  async _handleAnalyzeCode(args) {
    const { code, language = 'javascript', focusAreas = ['all'] } = args;

    const focusText = focusAreas.includes('all')
      ? 'security, performance, style, and potential bugs'
      : focusAreas.join(', ');

    const prompt = `Analyze the following ${language} code for ${focusText}. Provide specific issues and recommendations.

Code:
\`\`\`${language}
${code}
\`\`\`

Analysis:`;

    try {
      const result = await this.ollamaClient.generate({
        model: this.activeModel,
        prompt,
        temperature: 0.3
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            analysis: result.response,
            language,
            focusAreas,
            model: this.activeModel
          })
        }]
      };
    } catch (error) {
      logger.error('Code analysis failed', { error: error.message });
      throw error;
    }
  }

  async _handleRefactorCode(args) {
    const { code, language = 'javascript', refactorType = 'optimize' } = args;

    const refactorPrompts = {
      optimize: 'optimize for performance',
      modernize: 'modernize with latest language features',
      simplify: 'simplify and improve readability',
      extract: 'suggest functions/methods to extract'
    };

    const prompt = `Refactor the following ${language} code to ${refactorPrompts[refactorType]}. Show the refactored code and explain changes.

Original code:
\`\`\`${language}
${code}
\`\`\`

Refactored code:`;

    try {
      const result = await this.ollamaClient.generate({
        model: this.activeModel,
        prompt,
        temperature: 0.4
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            refactoredCode: result.response,
            refactorType,
            language,
            model: this.activeModel
          })
        }]
      };
    } catch (error) {
      logger.error('Code refactoring failed', { error: error.message });
      throw error;
    }
  }

  async start() {
    // Initialize model detector
    await this.modelDetector.initialize();

    logger.info('Continue-Ollama MCP Server starting', {
      ollamaEndpoint: CONTINUE_MCP_CONFIG.ollama.endpoint,
      defaultModel: this.activeModel
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('Continue-Ollama MCP Server connected via stdio');
  }

  async close() {
    await this.ollamaClient.close();
    logger.info('Continue-Ollama MCP Server closed');
  }
}

// Start server
const server = new ContinueOllamaMCPServer();
server.start().catch((error) => {
  logger.error('Server start failed', { error: error.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

export default ContinueOllamaMCPServer;
