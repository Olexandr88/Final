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
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import fetch from 'node-fetch';

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
      healthCheckInterval: CONTINUE_MCP_CONFIG.health.checkInterval,
    });

    this.conversationHistory = new Map(); // For agent mode
    this.activeModel = CONTINUE_MCP_CONFIG.ollama.defaultModel;

    // Performance optimizations
    this.modelCache = new Map(); // Cache model list
    this.modelCacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.lastModelCacheUpdate = 0;

    // Connection pooling for better performance
    this.requestQueue = [];
    this.maxConcurrentRequests = 3;
    this.currentRequests = 0;

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
                  description: 'Force refresh model list from Ollama API',
                },
              },
            },
          },
          {
            name: 'select_model',
            description: 'Select active Ollama model for subsequent operations',
            inputSchema: {
              type: 'object',
              properties: {
                model: {
                  type: 'string',
                  description: 'Model name (e.g., llama3, codellama, mistral)',
                },
              },
              required: ['model'],
            },
          },
          {
            name: 'autocomplete',
            description: 'Stream code completion/autocomplete with Ollama',
            inputSchema: {
              type: 'object',
              properties: {
                prefix: {
                  type: 'string',
                  description: 'Code before cursor',
                },
                suffix: {
                  type: 'string',
                  description: 'Code after cursor',
                },
                language: {
                  type: 'string',
                  description: 'Programming language',
                },
                maxTokens: {
                  type: 'number',
                  description: 'Maximum tokens to generate',
                  default: 100,
                },
              },
              required: ['prefix'],
            },
          },
          {
            name: 'chat',
            description: 'Agent mode conversation with context retention',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'User message',
                },
                sessionId: {
                  type: 'string',
                  description: 'Conversation session ID',
                },
                systemPrompt: {
                  type: 'string',
                  description: 'Optional system prompt',
                },
              },
              required: ['message'],
            },
          },
          {
            name: 'analyze_code',
            description: 'Analyze code for patterns, issues, and improvements',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Code to analyze',
                },
                language: {
                  type: 'string',
                  description: 'Programming language',
                },
                focusAreas: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Analysis focus: security, performance, style, bugs',
                },
              },
              required: ['code'],
            },
          },
          {
            name: 'refactor_code',
            description: 'Get code refactoring suggestions',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Code to refactor',
                },
                language: {
                  type: 'string',
                  description: 'Programming language',
                },
                refactorType: {
                  type: 'string',
                  enum: ['optimize', 'modernize', 'simplify', 'extract'],
                  description: 'Type of refactoring',
                },
              },
              required: ['code'],
            },
          },
          {
            name: 'read_file',
            description: 'Read file contents with size and encoding controls',
            inputSchema: {
              type: 'object',
              properties: {
                filepath: {
                  type: 'string',
                  description: 'Path to file (absolute or relative to project)',
                },
                encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
                maxSize: { type: 'number', description: 'Max bytes to read', default: 1048576 },
              },
              required: ['filepath'],
            },
          },
          {
            name: 'write_file',
            description: 'Write content to a file with optional backup creation',
            inputSchema: {
              type: 'object',
              properties: {
                filepath: { type: 'string' },
                content: { type: 'string' },
                encoding: { type: 'string', default: 'utf-8' },
                createBackup: { type: 'boolean', default: true },
              },
              required: ['filepath', 'content'],
            },
          },
          {
            name: 'list_dir',
            description: 'List directory contents (optionally recursive)',
            inputSchema: {
              type: 'object',
              properties: {
                dirpath: { type: 'string', default: '.' },
                recursive: { type: 'boolean', default: false },
                maxEntries: { type: 'number', default: 1000 },
              },
            },
          },
          {
            name: 'search_code',
            description: 'Search project files for a regex pattern',
            inputSchema: {
              type: 'object',
              properties: {
                pattern: { type: 'string' },
                dirpath: { type: 'string', default: '.' },
                maxResults: { type: 'number', default: 100 },
              },
              required: ['pattern'],
            },
          },
          {
            name: 'execute_command',
            description: 'Execute a safe, whitelisted command with timeout',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string' },
                args: { type: 'array', items: { type: 'string' }, default: [] },
                cwd: { type: 'string' },
                timeout: { type: 'number', default: 15000 },
              },
              required: ['command'],
            },
          },
          {
            name: 'run_tests',
            description: 'Run project tests (npm test <pattern>)',
            inputSchema: {
              type: 'object',
              properties: {
                pattern: { type: 'string' },
                timeout: { type: 'number', default: 300000 },
              },
            },
          },
          {
            name: 'get_context',
            description: 'Retrieve server and project context information',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'fetch_url',
            description: 'Fetch an HTTP/HTTPS URL with safety limits',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                method: { type: 'string', default: 'GET' },
              },
              required: ['url'],
            },
          },
          {
            name: 'git_status',
            description: 'Get git branch and status summary',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'edit_file_patch',
            description: 'Safely replace the first occurrence of a string in a file (creates .bak)',
            inputSchema: {
              type: 'object',
              properties: {
                filepath: { type: 'string' },
                search: { type: 'string' },
                replace: { type: 'string' },
              },
              required: ['filepath', 'search', 'replace'],
            },
          },
        ],
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
          case 'read_file':
            return await this._handleReadFile(args);
          case 'write_file':
            return await this._handleWriteFile(args);
          case 'list_dir':
            return await this._handleListDir(args);
          case 'search_code':
            return await this._handleSearchCode(args);
          case 'execute_command':
            return await this._handleExecuteCommand(args);
          case 'run_tests':
            return await this._handleRunTests(args);
          case 'get_context':
            return await this._handleGetContext(args);
          case 'fetch_url':
            return await this._handleFetchUrl(args);
          case 'git_status':
            return await this._handleGitStatus(args);
          case 'edit_file_patch':
            return await this._handleEditFilePatch(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error('Tool execution error', { tool: name, error: error.message });
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });

    logger.info('Continue-Ollama MCP Server handlers configured');
  }

  async _handleListModels(args) {
    const refresh = args.refresh || false;
    const now = Date.now();

    // Use cache if available and not expired
    if (
      !refresh &&
      this.modelCache.has('models') &&
      now - this.lastModelCacheUpdate < this.modelCacheTimeout
    ) {
      const cachedModels = this.modelCache.get('models');
      logger.debug('Using cached model list');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                models: cachedModels,
                activeModel: this.activeModel,
                cached: true,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const models = await this.modelDetector.detectModels(refresh);

    // Cache the results
    const modelData = models.map((m) => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
      family: m.details?.family,
      format: m.details?.format,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
      capabilities: m.capabilities,
    }));

    this.modelCache.set('models', modelData);
    this.lastModelCacheUpdate = now;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              models: modelData,
              activeModel: this.activeModel,
              cached: false,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async _handleSelectModel(args) {
    const { model } = args;
    const models = await this.modelDetector.detectModels();
    const modelExists = models.some((m) => m.name === model);

    if (!modelExists) {
      throw new Error(
        `Model '${model}' not found. Available: ${models.map((m) => m.name).join(', ')}`
      );
    }

    this.activeModel = model;
    this.ollamaClient.config.model = model;

    logger.info('Model selected', { model });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            previousModel: this.ollamaClient.config.model,
            activeModel: this.activeModel,
            message: `Switched to model: ${model}`,
          }),
        },
      ],
    };
  }

  async _handleAutocomplete(args) {
    const { prefix, suffix = '', language = 'javascript', maxTokens = 100 } = args;

    // Input validation
    if (!prefix || typeof prefix !== 'string') {
      throw new Error('Invalid prefix: must be a non-empty string');
    }
    if (prefix.length > 10000) {
      throw new Error('Prefix too long: maximum 10,000 characters');
    }
    if (maxTokens < 1 || maxTokens > 500) {
      throw new Error('maxTokens must be between 1 and 500');
    }

    const prompt = `Complete the following ${language} code. Only return the completion, no explanations.

Code before cursor:
${prefix}

Code after cursor:
${suffix}

Completion:`;

    try {
      let completion = '';

      // Use streaming for low-latency autocomplete
      await this.ollamaClient.generateStream(
        {
          model: this.activeModel,
          prompt,
          num_predict: maxTokens,
          temperature: 0.2, // Low temperature for more deterministic completions
          stop: ['\\n\\n', '```'], // Stop at double newline or code fence
        },
        (token) => {
          completion += token;
        }
      );

      // Extract only the code completion (remove any markdown or explanations)
      const cleanCompletion = completion.split('```')[0].trim();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              completion: cleanCompletion,
              model: this.activeModel,
              language,
              latency: 'streaming',
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Autocomplete failed', { error: error.message });
      throw error;
    }
  }

  async _handleChat(args) {
    const { message, sessionId = 'default', systemPrompt } = args;

    // Input validation
    if (!message || typeof message !== 'string') {
      throw new Error('Invalid message: must be a non-empty string');
    }
    if (message.length > 8000) {
      throw new Error('Message too long: maximum 8,000 characters');
    }
    if (sessionId && !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new Error('Invalid sessionId: only alphanumeric, underscore and dash allowed');
    }

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
        temperature: 0.7,
      });

      // Store in history
      history.push({
        user: message,
        assistant: result.response,
        timestamp: new Date().toISOString(),
      });

      // Limit history size
      if (history.length > 50) {
        history.splice(0, history.length - 50);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              response: result.response,
              sessionId,
              model: this.activeModel,
              historyLength: history.length,
            }),
          },
        ],
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
        temperature: 0.3,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              analysis: result.response,
              language,
              focusAreas,
              model: this.activeModel,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Code analysis failed', { error: error.message });
      throw error;
    }
  }

  // Utility: ensure path is within workspace
  _resolveSafePath(p) {
    const abs = path.resolve(process.cwd(), p);
    const root = path.resolve(process.cwd());
    if (!abs.startsWith(root)) {
      throw new Error('Access outside project directory is not allowed');
    }
    return abs;
  }

  // Utility: detect shell operators
  _hasShellOperators(text) {
    const ops = [/&&/, /\|\|/, /;/, /\|/, />/, /</, /`/, /\$\(/, /\$\{/];
    return ops.some((r) => r.test(text));
  }

  // Utility: safe command execution
  async _safeSpawn(command, args = [], opts = {}) {
    const allow = new Set(['node', 'npm', 'npx', 'git', 'tsc', 'tsx', 'pnpm', 'yarn']);
    if (!allow.has(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }
    if (args.some((a) => this._hasShellOperators(String(a)))) {
      throw new Error('Shell operators are not allowed in args');
    }
    const cwd = opts.cwd ? this._resolveSafePath(opts.cwd) : process.cwd();
    const timeout = Math.min(opts.timeout || 15000, 300000);

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...opts.env },
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      const to = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Process timeout'));
      }, timeout);
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(to);
        resolve({ code, stdout, stderr });
      });
    });
  }

  async _handleReadFile(args) {
    const { filepath, encoding = 'utf-8', maxSize = 1048576 } = args;
    const full = this._resolveSafePath(filepath);
    const st = await fs.stat(full);
    if (st.size > maxSize) throw new Error(`File exceeds maxSize (${st.size} > ${maxSize})`);
    const content = await fs.readFile(full, encoding);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, filepath: full, size: st.size, content }, null, 2),
        },
      ],
    };
  }

  async _handleWriteFile(args) {
    const { filepath, content, encoding = 'utf-8', createBackup = true } = args;
    const full = this._resolveSafePath(filepath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (createBackup && fssync.existsSync(full)) {
      await fs.copyFile(full, `${full}.bak`);
    }
    await fs.writeFile(full, content, encoding);
    const st = await fs.stat(full);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ success: true, filepath: full, size: st.size }) },
      ],
    };
  }

  async _handleListDir(args) {
    const { dirpath = '.', recursive = false, maxEntries = 1000 } = args;
    const full = this._resolveSafePath(dirpath);
    const results = [];
    const walker = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const it of items) {
        if (results.length >= maxEntries) return;
        const p = path.join(dir, it.name);
        if (it.isDirectory()) {
          results.push({ path: p, type: 'dir' });
          if (recursive) await walker(p);
        } else if (it.isFile()) {
          const st = await fs.stat(p);
          results.push({ path: p, type: 'file', size: st.size });
        }
      }
    };
    await walker(full);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ success: true, entries: results }, null, 2) },
      ],
    };
  }

  async _handleSearchCode(args) {
    const { pattern, dirpath = '.', maxResults = 100 } = args;
    const full = this._resolveSafePath(dirpath);
    const regex = new RegExp(pattern, 'i');
    const results = [];
    const exts = new Set([
      '.js',
      '.ts',
      '.tsx',
      '.jsx',
      '.json',
      '.md',
      '.yaml',
      '.yml',
      '.py',
      '.sh',
      '.cjs',
      '.mjs',
    ]);

    const walker = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const it of items) {
        if (results.length >= maxResults) return;
        const p = path.join(dir, it.name);
        if (it.isDirectory()) {
          await walker(p);
        } else if (it.isFile()) {
          const ext = path.extname(it.name).toLowerCase();
          if (!exts.has(ext)) continue;
          const st = await fs.stat(p);
          if (st.size > 2_000_000) continue; // skip large files
          const text = await fs.readFile(p, 'utf-8');
          if (regex.test(text)) {
            results.push({ path: p, size: st.size });
          }
        }
      }
    };
    await walker(full);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ success: true, matches: results }, null, 2) },
      ],
    };
  }

  async _handleExecuteCommand(args) {
    const { command, args: cmdArgs = [], cwd, timeout = 15000 } = args;
    if (typeof command !== 'string' || !command) throw new Error('Invalid command');
    const { code, stdout, stderr } = await this._safeSpawn(command, cmdArgs, { cwd, timeout });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: code === 0, exitCode: code, stdout, stderr }),
        },
      ],
    };
  }

  async _handleRunTests(args) {
    const { pattern, timeout = 300000 } = args;
    const testArgs = ['test'];
    if (pattern) testArgs.push(pattern);
    const result = await this._safeSpawn('npm', testArgs, { timeout: Math.min(timeout, 600000) });
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: result.code === 0, ...result }) }],
    };
  }

  async _handleGetContext() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              cwd: process.cwd(),
              node: process.version,
              platform: os.platform(),
              activeModel: this.activeModel,
              time: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async _handleFetchUrl(args) {
    const { url, method = 'GET' } = args;
    try {
      if (!/^https?:\/\//i.test(url)) throw new Error('Only http/https URLs allowed');
      const res = await fetch(url, { method });
      const text = await res.text();
      const body = text.length > 200000 ? text.slice(0, 200000) + '\n/* truncated */' : text;
      return {
        content: [
          { type: 'text', text: JSON.stringify({ success: true, status: res.status, body }) },
        ],
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }

  async _handleGitStatus() {
    const { code, stdout, stderr } = await this._safeSpawn('git', [
      '--no-pager',
      'status',
      '--porcelain=v1',
      '-b',
    ]);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: code === 0, stdout, stderr }) }],
    };
  }

  async _handleEditFilePatch(args) {
    const { filepath, search, replace } = args;
    const full = this._resolveSafePath(filepath);
    const orig = await fs.readFile(full, 'utf-8');
    const idx = orig.indexOf(search);
    if (idx === -1) throw new Error('Search string not found');
    await fs.copyFile(full, `${full}.bak`);
    const updated = orig.slice(0, idx) + replace + orig.slice(idx + search.length);
    await fs.writeFile(full, updated, 'utf-8');
    return {
      content: [
        { type: 'text', text: JSON.stringify({ success: true, filepath: full, replaced: 1 }) },
      ],
    };
  }

  async _handleRefactorCode(args) {
    const { code, language = 'javascript', refactorType = 'optimize' } = args;

    const refactorPrompts = {
      optimize: 'optimize for performance',
      modernize: 'modernize with latest language features',
      simplify: 'simplify and improve readability',
      extract: 'suggest functions/methods to extract',
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
        temperature: 0.4,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              refactoredCode: result.response,
              refactorType,
              language,
              model: this.activeModel,
            }),
          },
        ],
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
      defaultModel: this.activeModel,
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
