/**
 * Command Sandboxing Layer
 * Provides isolated execution environment with strict controls
 */

import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

export class CommandSandbox extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      workingDirectory: config.workingDirectory || process.cwd(),
      allowedPaths: config.allowedPaths || [process.cwd()],
      timeout: config.timeout || 30000, // 30 seconds max
      maxBuffer: config.maxBuffer || 1024 * 1024, // 1MB max output
      allowNetworkAccess: config.allowNetworkAccess || false,
      allowedCommands: config.allowedCommands || [],
      deniedCommands: config.deniedCommands || [],
      ...config,
    };

    // Initialize deny list
    this.DANGEROUS_COMMANDS = [
      'rm',
      'rmdir',
      'del',
      'deltree',
      'format',
      'dd',
      'mkfs',
      'sudo',
      'su',
      'runas',
      'curl',
      'wget',
      'nc',
      'netcat',
      'telnet',
      'eval',
      'exec',
      'bash -c',
      'sh -c',
      'chmod',
      'chown',
      'kill',
      'killall',
      'pkill',
      'systemctl',
      'service',
      'shutdown',
      'reboot',
      'halt',
    ];

    // Whitelist approach for allowed commands
    this.SAFE_COMMANDS = [
      'npm',
      'node',
      'git',
      'ls',
      'dir',
      'cat',
      'type',
      'echo',
      'pwd',
      'cd',
      'grep',
      'find',
    ];
  }

  /**
   * Validate and sanitize command before execution
   * @param {string} command - Command to validate
   * @returns {Object} Validation result
   */
  validateCommand(command) {
    if (!command || typeof command !== 'string') {
      return { valid: false, reason: 'Invalid command type' };
    }

    // Extract base command (first word)
    const baseCommand = command.trim().split(/\s+/)[0];
    const baseName = path.basename(baseCommand);

    // Check deny list first (highest priority)
    for (const denied of this.DANGEROUS_COMMANDS) {
      if (
        baseName.toLowerCase().includes(denied.toLowerCase()) ||
        command.toLowerCase().includes(denied.toLowerCase())
      ) {
        return {
          valid: false,
          reason: `Dangerous command detected: ${denied}`,
          severity: 'CRITICAL',
        };
      }
    }

    // Check custom deny list
    for (const denied of this.config.deniedCommands) {
      if (command.toLowerCase().includes(denied.toLowerCase())) {
        return {
          valid: false,
          reason: `Denied by policy: ${denied}`,
          severity: 'HIGH',
        };
      }
    }

    // Check whitelist (if configured)
    if (this.config.allowedCommands.length > 0) {
      const isAllowed = this.config.allowedCommands.some(
        (allowed) => baseName.toLowerCase() === allowed.toLowerCase()
      );

      if (!isAllowed) {
        return {
          valid: false,
          reason: `Command not in whitelist: ${baseName}`,
          severity: 'MEDIUM',
        };
      }
    } else {
      // Default to safe commands list
      const isSafe = this.SAFE_COMMANDS.some(
        (safe) => baseName.toLowerCase() === safe.toLowerCase()
      );

      if (!isSafe) {
        return {
          valid: false,
          reason: `Command not in safe list: ${baseName}`,
          severity: 'MEDIUM',
        };
      }
    }

    // Check for shell operators (command chaining)
    const SHELL_OPERATORS = ['&&', '||', ';', '|', '>', '<', '$(', '`'];
    for (const operator of SHELL_OPERATORS) {
      if (command.includes(operator)) {
        return {
          valid: false,
          reason: `Shell operator not allowed: ${operator}`,
          severity: 'HIGH',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate file path is within allowed boundaries
   * @param {string} filePath - Path to validate
   * @returns {Object} Validation result
   */
  validatePath(filePath) {
    const normalized = path.normalize(filePath);
    const resolved = path.resolve(normalized);

    // Check for path traversal
    if (normalized.includes('..')) {
      return {
        valid: false,
        reason: 'Path traversal detected',
        severity: 'HIGH',
      };
    }

    // Check if within allowed paths
    const isAllowed = this.config.allowedPaths.some((allowedPath) => {
      const resolvedAllowed = path.resolve(allowedPath);
      return resolved.startsWith(resolvedAllowed);
    });

    if (!isAllowed) {
      return {
        valid: false,
        reason: 'Path outside allowed directories',
        severity: 'HIGH',
        path: resolved,
      };
    }

    // Check for sensitive directories (Windows)
    const SENSITIVE_DIRS = [
      'C:\\Windows\\System32',
      'C:\\Program Files',
      process.env.APPDATA,
      process.env.LOCALAPPDATA,
    ];

    for (const sensitive of SENSITIVE_DIRS) {
      if (sensitive && resolved.toLowerCase().startsWith(sensitive.toLowerCase())) {
        return {
          valid: false,
          reason: 'Access to sensitive directory denied',
          severity: 'CRITICAL',
          path: resolved,
        };
      }
    }

    return { valid: true, path: resolved };
  }

  /**
   * Execute command in sandboxed environment
   * @param {string} command - Command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeCommand(command, options = {}) {
    const executionId = options.executionId || Date.now().toString();

    logger.info('Sandbox: Validating command', { command, executionId });

    // Validate command
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      const error = new Error(validation.reason);
      error.severity = validation.severity;

      logger.error('Sandbox: Command validation failed', {
        command,
        reason: validation.reason,
        severity: validation.severity,
        executionId,
      });

      // Emit security event
      this.emit('securityViolation', {
        type: 'COMMAND_DENIED',
        command,
        reason: validation.reason,
        severity: validation.severity,
        timestamp: new Date().toISOString(),
        executionId,
      });

      throw error;
    }

    // Execute in isolated process
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      // Parse command and args
      const parts = command.trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      // Use spawn for better control
      const child = spawn(cmd, args, {
        cwd: this.config.workingDirectory,
        timeout: this.config.timeout,
        shell: false, // CRITICAL: No shell interpretation
        env: this._getSafeEnvironment(),
        maxBuffer: this.config.maxBuffer,
      });

      // Collect output
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.config.maxBuffer) {
          child.kill('SIGTERM');
          reject(new Error('Output buffer exceeded'));
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle timeout
      const timeoutTimer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      // Handle completion
      child.on('close', (code) => {
        clearTimeout(timeoutTimer);
        const duration = Date.now() - startTime;

        logger.info('Sandbox: Command completed', {
          command,
          code,
          duration,
          executionId,
        });

        this.emit('commandExecuted', {
          command,
          code,
          duration,
          success: code === 0,
          executionId,
        });

        resolve({
          success: code === 0,
          code,
          stdout,
          stderr,
          duration,
          executionId,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutTimer);
        logger.error('Sandbox: Command execution error', {
          command,
          error: error.message,
          executionId,
        });
        reject(error);
      });
    });
  }

  /**
   * Get safe environment variables (no secrets)
   * @private
   */
  _getSafeEnvironment() {
    const safe = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      NODE_ENV: 'sandbox',
    };

    // Explicitly exclude all API keys and secrets
    return safe;
  }
}
