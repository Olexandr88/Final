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
      ...config
    };

    // Initialize deny list
    this.DANGEROUS_COMMANDS = [
      'rm', 'rmdir', 'del', 'deltree',
      'format', 'dd', 'mkfs',
      'sudo', 'su', 'runas',
      'curl', 'wget', 'nc', 'netcat', 'telnet',
      'eval', 'exec', 'bash -c', 'sh -c',
      'chmod', 'chown',
      'kill', 'killall', 'pkill',
      'systemctl', 'service',
      'shutdown', 'reboot', 'halt'
    ];

    // Whitelist approach for allowed commands
    this.SAFE_COMMANDS = [
      'npm', 'node', 'git',
      'ls', 'dir', 'cat', 'type',
      'echo', 'pwd', 'cd',
      'grep', 'find'
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
      if (baseName.toLowerCase().includes(denied.toLowerCase()) ||
          command.toLowerCase().includes(denied.toLowerCase())) {
        return {
          valid: false,
          reason: `Dangerous command detected: ${denied}`,
          severity: 'CRITICAL'
        };
      }
    }

    // Check custom deny list
    for (const denied of this.config.deniedCommands) {
      if (command.toLowerCase().includes(denied.toLowerCase())) {
        return {
          valid: false,
          reason: `Denied by policy: ${denied}`,
          severity: 'HIGH'
        };
      }
    }

    // Check whitelist (if configured)
    if (this.config.allowedCommands.length > 0) {
      const isAllowed = this.config.allowedCommands.some(allowed =>
        baseName.toLowerCase() === allowed.toLowerCase()
      );

      if (!isAllowed) {
        return {
          valid: false,
          reason: `Command not in whitelist: ${baseName}`,
          severity: 'MEDIUM'
        };
      }
    } else {
      // Default to safe commands list
      const isSafe = this.SAFE_COMMANDS.some(safe =>
        baseName.toLowerCase() === safe.toLowerCase()
      );

      if (!isSafe) {
        return {
          valid: false,
          reason: `Command not in safe list: ${baseName}`,
          severity: 'MEDIUM'
        };
      }
    }

    const operatorCheck = this._detectShellOperators(command);
    if (!operatorCheck.valid) return operatorCheck;

    return { valid: true };
  }

  /**
   * Validate file path is within allowed boundaries
   * @param {string} filePath - Path to validate
   * @returns {Object} Validation result
   */
  validatePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return {valid: false, reason: 'Invalid path type', severity: 'HIGH'};
    }
    if (filePath.startsWith('\\') || filePath.startsWith('//')) {
      return {valid: false, reason: 'UNC paths not allowed', severity: 'CRITICAL'};
    }
    if (filePath.includes(':') && !filePath.match(/^[A-Za-z]:[/\\]/)) {
      return {valid: false, reason: 'NTFS ADS not allowed', severity: 'CRITICAL'};
    }
    let normalized;
    try {
      normalized = path.normalize(filePath);
      normalized = path.resolve(normalized);
    } catch (error) {
      return {valid: false, reason: 'Normalize failed: ' + error.message, severity: 'HIGH'};
    }
    if (normalized.includes('..') || filePath.includes('..')) {
      return {valid: false, reason: 'Path traversal detected', severity: 'CRITICAL'};
    }
    const isAllowed = this.config.allowedPaths.some(ap => {
      const resolved = path.resolve(ap);
      return normalized.startsWith(resolved);
    });
    if (!isAllowed) {
      return {valid: false, reason: 'Path outside allowed directories', severity: 'HIGH', path: normalized};
    }
    const SENS = ['C:\\Windows\\System32', 'C:\\Windows\\SysWOW64', 'C:\\Program Files', process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean);
    for (const s of SENS) {
      const ns = path.resolve(s).toLowerCase();
      if (normalized.toLowerCase().startsWith(ns)) {
        return {valid: false, reason: 'Sensitive directory denied', severity: 'CRITICAL', path: normalized};
      }
    }
    return {valid: true, path: normalized};
  }

  /**
   * Detect shell operators and injection attempts
   * @private
   */
  _detectShellOperators(command) {
    const ops = ['&&', '||', ';', '|', '>', '<', '$(', '`', '${', '&', '\n', '\r'];
    for (const o of ops) {
      if (command.includes(o)) return {valid: false, reason: 'Operator: ' + o, severity: 'HIGH'};
    }
    const enc = ['%26%26', '%7C%7C', '%3B', '%7C', '%3E', '%3C', '%0A', '%0D', '%24%28', '%60', '%24%7B'];
    const upper = command.toUpperCase();
    for (const e of enc) {
      if (upper.includes(e)) return {valid: false, reason: 'Encoded: ' + e, severity: 'CRITICAL'};
    }
    const html = ['&amp;', '&#38;', '&lt;', '&#60;', '&gt;', '&#62;', '&semi;', '&#59;'];
    for (const h of html) {
      if (command.includes(h)) return {valid: false, reason: 'HTML: ' + h, severity: 'CRITICAL'};
    }
    return {valid: true};
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
        executionId
      });

      // Emit security event
      this.emit('securityViolation', {
        type: 'COMMAND_DENIED',
        command,
        reason: validation.reason,
        severity: validation.severity,
        timestamp: new Date().toISOString(),
        executionId
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
        maxBuffer: this.config.maxBuffer
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
          executionId
        });

        this.emit('commandExecuted', {
          command,
          code,
          duration,
          success: code === 0,
          executionId
        });

        resolve({
          success: code === 0,
          code,
          stdout,
          stderr,
          duration,
          executionId
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutTimer);
        logger.error('Sandbox: Command execution error', {
          command,
          error: error.message,
          executionId
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
      NODE_ENV: 'sandbox'
    };

    // Explicitly exclude all API keys and secrets
    return safe;
  }
}
