/**
 * Tool Executor - Real tool implementations for autonomous agents
 * Provides actual file operations, command execution, git operations, etc.
 */

import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { glob } from 'glob';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export class ToolExecutor extends EventEmitter {
  constructor(agentId, permissions = {}) {
    super();

    this.agentId = agentId;
    this.permissions = permissions;
    this.tools = new Map();
    this.metrics = {
      totalExecutions: 0,
      successCount: 0,
      errorCount: 0,
      toolUsage: {}
    };
    this.executionHistory = [];
    this.cachedSchemas = null;
    this._isReady = false;

    // Register all tools
    this._registerTools();
    this._isReady = true;
  }

  /**
   * Register all available tools
   * @private
   */
  _registerTools() {
    // File operations
    this.tools.set('read', this._handleRead.bind(this));
    this.tools.set('write', this._handleWrite.bind(this));
    this.tools.set('glob', this._handleGlob.bind(this));
    this.tools.set('grep', this._handleGrep.bind(this));
    this.tools.set('edit', this._handleEdit.bind(this));

    // Command execution
    this.tools.set('bash', this._handleBash.bind(this));
    this.tools.set('npm', this._handleNpm.bind(this));

    // Git operations
    this.tools.set('git_status', this._handleGitStatus.bind(this));
    this.tools.set('git_diff', this._handleGitDiff.bind(this));
    this.tools.set('git_commit', this._handleGitCommit.bind(this));
    this.tools.set('git_log', this._handleGitLog.bind(this));

    // Code analysis
    this.tools.set('analyze_code', this._handleAnalyzeCode.bind(this));
    this.tools.set('run_tests', this._handleRunTests.bind(this));

    logger.info(`Tool executor initialized for ${this.agentId}`, {
      toolCount: this.tools.size,
      tools: Array.from(this.tools.keys())
    });
  }

  /**
   * Wait for tool executor to be ready
   */
  async waitForReady() {
    if (this._isReady) return;

    return new Promise((resolve) => {
      const checkReady = setInterval(() => {
        if (this._isReady) {
          clearInterval(checkReady);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Execute a tool
   * @param {string} toolName - Tool to execute
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeTool(toolName, params = {}, context = {}) {
    const startTime = Date.now();

    logger.info(`Executing tool: ${toolName}`, {
      agentId: this.agentId,
      params
    });

    // Check if tool exists
    if (!this.tools.has(toolName)) {
      const error = new Error(`Tool not found: ${toolName}`);
      this._recordExecution(toolName, false, Date.now() - startTime, error);
      throw error;
    }

    // Check permissions
    if (!this._hasPermission(toolName)) {
      const error = new Error(`Permission denied for tool: ${toolName}`);
      this._recordExecution(toolName, false, Date.now() - startTime, error);
      throw error;
    }

    try {
      const handler = this.tools.get(toolName);
      const result = await handler(params, context);

      const duration = Date.now() - startTime;
      this._recordExecution(toolName, true, duration, null, result);

      this.emit('toolExecuted', {
        tool: toolName,
        success: true,
        duration,
        agentId: this.agentId
      });

      return {
        success: true,
        tool: toolName,
        result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this._recordExecution(toolName, false, duration, error);

      this.emit('toolExecuted', {
        tool: toolName,
        success: false,
        duration,
        error: error.message,
        agentId: this.agentId
      });

      throw error;
    }
  }

  /**
   * Check if agent has permission for tool
   * @private
   */
  _hasPermission(toolName) {
    const permissionMap = {
      read: 'file_read',
      write: 'file_write',
      edit: 'file_write',
      glob: 'file_read',
      grep: 'file_read',
      bash: 'command_exec',
      npm: 'command_exec',
      git_status: 'git_operations',
      git_diff: 'git_operations',
      git_commit: 'git_operations',
      git_log: 'git_operations',
      analyze_code: 'code_analysis',
      run_tests: 'test_execution'
    };

    const requiredPermission = permissionMap[toolName];
    if (!requiredPermission) return false;

    return this.permissions[requiredPermission] === true;
  }

  /**
   * Record tool execution
   * @private
   */
  _recordExecution(toolName, success, duration, error = null, result = null) {
    this.metrics.totalExecutions++;
    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.errorCount++;
    }

    this.metrics.toolUsage[toolName] = (this.metrics.toolUsage[toolName] || 0) + 1;

    this.executionHistory.push({
      tool: toolName,
      success,
      duration,
      error: error?.message,
      timestamp: new Date().toISOString(),
      agentId: this.agentId
    });

    // Keep only last 100 executions
    if (this.executionHistory.length > 100) {
      this.executionHistory = this.executionHistory.slice(-100);
    }
  }

  // ========== TOOL IMPLEMENTATIONS ==========

  /**
   * Read file
   * @private
   */
  async _handleRead(params, context) {
    const { file_path, encoding = 'utf-8' } = params;

    if (!file_path) {
      throw new Error('file_path is required');
    }

    const content = await fs.readFile(file_path, encoding);

    return {
      file_path,
      content,
      encoding,
      size: content.length
    };
  }

  /**
   * Write file
   * @private
   */
  async _handleWrite(params, context) {
    const { file_path, content, encoding = 'utf-8' } = params;

    if (!file_path || content === undefined) {
      throw new Error('file_path and content are required');
    }

    // Ensure directory exists
    const dir = path.dirname(file_path);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(file_path, content, encoding);

    return {
      file_path,
      bytesWritten: content.length,
      success: true
    };
  }

  /**
   * Find files matching pattern
   * @private
   */
  async _handleGlob(params, context) {
    const { pattern, cwd = process.cwd() } = params;

    if (!pattern) {
      throw new Error('pattern is required');
    }

    const files = await glob(pattern, { cwd, absolute: true });

    return {
      pattern,
      files,
      count: files.length
    };
  }

  /**
   * Search files for pattern
   * @private
   */
  async _handleGrep(params, context) {
    const { pattern, file_path, flags = '' } = params;

    if (!pattern || !file_path) {
      throw new Error('pattern and file_path are required');
    }

    const content = await fs.readFile(file_path, 'utf-8');
    const regex = new RegExp(pattern, flags);
    const matches = [];

    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (regex.test(line)) {
        matches.push({
          line: index + 1,
          content: line
        });
      }
    });

    return {
      file_path,
      pattern,
      matches,
      count: matches.length
    };
  }

  /**
   * Edit file
   * @private
   */
  async _handleEdit(params, context) {
    const { file_path, old_string, new_string } = params;

    if (!file_path || !old_string || new_string === undefined) {
      throw new Error('file_path, old_string, and new_string are required');
    }

    const content = await fs.readFile(file_path, 'utf-8');
    const newContent = content.replace(old_string, new_string);

    if (content === newContent) {
      throw new Error('old_string not found in file');
    }

    await fs.writeFile(file_path, newContent, 'utf-8');

    return {
      file_path,
      success: true,
      replacements: 1
    };
  }

  /**
   * Execute bash command
   * @private
   */
  async _handleBash(params, context) {
    const { command, args = [], cwd = process.cwd() } = params;

    if (!command) {
      throw new Error('command is required');
    }

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;

    const { stdout, stderr } = await execAsync(fullCommand, { cwd });

    return {
      command: fullCommand,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      success: true
    };
  }

  /**
   * Execute npm command
   * @private
   */
  async _handleNpm(params, context) {
    const { command, args = [], cwd = process.cwd() } = params;

    if (!command) {
      throw new Error('command is required');
    }

    const fullCommand = `npm ${command} ${args.join(' ')}`.trim();

    const { stdout, stderr } = await execAsync(fullCommand, { cwd });

    return {
      command: fullCommand,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      success: true
    };
  }

  /**
   * Get git status
   * @private
   */
  async _handleGitStatus(params, context) {
    const { cwd = process.cwd() } = params;

    const { stdout } = await execAsync('git status --porcelain', { cwd });

    return {
      status: stdout.trim(),
      modified: stdout.trim().split('\n').filter(l => l.startsWith(' M')).length,
      untracked: stdout.trim().split('\n').filter(l => l.startsWith('??')).length
    };
  }

  /**
   * Get git diff
   * @private
   */
  async _handleGitDiff(params, context) {
    const { cwd = process.cwd(), file_path = '' } = params;

    const command = file_path ? `git diff ${file_path}` : 'git diff';
    const { stdout } = await execAsync(command, { cwd });

    return {
      diff: stdout.trim(),
      file_path: file_path || 'all'
    };
  }

  /**
   * Create git commit
   * @private
   */
  async _handleGitCommit(params, context) {
    const { message, cwd = process.cwd() } = params;

    if (!message) {
      throw new Error('message is required');
    }

    // Add all changes
    await execAsync('git add .', { cwd });

    // Commit
    const { stdout } = await execAsync(`git commit -m "${message}"`, { cwd });

    return {
      message,
      output: stdout.trim(),
      success: true
    };
  }

  /**
   * Get git log
   * @private
   */
  async _handleGitLog(params, context) {
    const { limit = 10, cwd = process.cwd() } = params;

    const { stdout } = await execAsync(`git log -n ${limit} --oneline`, { cwd });

    return {
      log: stdout.trim(),
      commits: stdout.trim().split('\n')
    };
  }

  /**
   * Analyze code
   * @private
   */
  async _handleAnalyzeCode(params, context) {
    const { file_path } = params;

    if (!file_path) {
      throw new Error('file_path is required');
    }

    const content = await fs.readFile(file_path, 'utf-8');

    return {
      file_path,
      lines: content.split('\n').length,
      size: content.length,
      functions: (content.match(/function\s+\w+/g) || []).length,
      classes: (content.match(/class\s+\w+/g) || []).length
    };
  }

  /**
   * Run tests
   * @private
   */
  async _handleRunTests(params, context) {
    const { command = 'npm test', cwd = process.cwd() } = params;

    try {
      const { stdout, stderr } = await execAsync(command, { cwd });

      return {
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: true
      };
    } catch (error) {
      return {
        command,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        success: false,
        exitCode: error.code
      };
    }
  }

  /**
   * Get available tools
   * @returns {Array<string>} Tool names
   */
  getAvailableTools() {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool schemas for LLM function calling
   * @returns {Array<Object>} Tool schemas
   */
  getToolSchemas() {
    return [
      {
        name: 'read',
        description: 'Read contents of a file',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' },
            encoding: { type: 'string', description: 'File encoding', default: 'utf-8' }
          },
          required: ['file_path']
        }
      },
      {
        name: 'write',
        description: 'Write content to a file',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' },
            content: { type: 'string', description: 'Content to write' },
            encoding: { type: 'string', description: 'File encoding', default: 'utf-8' }
          },
          required: ['file_path', 'content']
        }
      },
      {
        name: 'bash',
        description: 'Execute shell command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
            cwd: { type: 'string', description: 'Working directory' }
          },
          required: ['command']
        }
      },
      {
        name: 'git_status',
        description: 'Get git repository status',
        parameters: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Repository directory' }
          }
        }
      }
    ];
  }

  /**
   * Get execution metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalExecutions > 0
        ? (this.metrics.successCount / this.metrics.totalExecutions * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Get execution history
   * @param {number} limit - Max number of records
   * @returns {Array<Object>} History
   */
  getHistory(limit = 10) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Clear execution history
   */
  clearHistory() {
    this.executionHistory = [];
    logger.info(`Execution history cleared for ${this.agentId}`);
  }
}

export default ToolExecutor;
