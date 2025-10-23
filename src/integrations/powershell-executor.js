// src/integrations/powershell-executor.js
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * PowerShell script executor
 * Enables execution of PowerShell commands and scripts from Node.js
 * @module powershell-executor
 * @extends EventEmitter
 */
export class PowerShellExecutor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      timeout: config.timeout || 30000,
      pwshPath: config.pwshPath || 'pwsh', // PowerShell Core
      fallbackToWindowsPowerShell: config.fallbackToWindowsPowerShell !== false,
      executionPolicy: config.executionPolicy || 'Bypass',
      sessionEnabled: config.sessionEnabled || false,
    };
    this.isAvailable = false;
    this.isPwshCore = false;
    this.session = null;
  }

  /**
   * Initialize PowerShell executor
   * @returns {Promise<boolean>} True if PowerShell is available
   */
  async initialize() {
    try {
      logger.info('Initializing PowerShell Executor');

      // Try PowerShell Core first
      try {
        const version = await this._getVersion(this.config.pwshPath);
        this.isAvailable = true;
        this.isPwshCore = true;
        logger.info('PowerShell Core available', { version });
      } catch (error) {
        // Fallback to Windows PowerShell
        if (this.config.fallbackToWindowsPowerShell) {
          try {
            const version = await this._getVersion('powershell');
            this.config.pwshPath = 'powershell';
            this.isAvailable = true;
            this.isPwshCore = false;
            logger.info('Windows PowerShell available', { version });
          } catch (fallbackError) {
            logger.warn('Neither PowerShell Core nor Windows PowerShell available');
            this.isAvailable = false;
          }
        } else {
          this.isAvailable = false;
        }
      }

      return this.isAvailable;
    } catch (error) {
      logger.error('Failed to initialize PowerShell Executor', { error: error.message });
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Get PowerShell version
   * @returns {Promise<string>} PowerShell version string
   */
  async getVersion() {
    try {
      return await this._getVersion(this.config.pwshPath);
    } catch (error) {
      throw new Error(`Failed to get PowerShell version: ${error.message}`);
    }
  }

  /**
   * Execute PowerShell command
   * @param {string} command - PowerShell command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async execute(command, options = {}) {
    try {
      if (!this.isAvailable) {
        throw new Error('PowerShell is not available');
      }

      logger.info('Executing PowerShell command', {
        command: command.substring(0, 100)
      });

      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', this.config.executionPolicy,
        '-Command', command,
      ];

      if (options.encodedCommand) {
        args.splice(args.length - 2, 2, '-EncodedCommand', options.encodedCommand);
      }

      const result = await this._execute(args, options);

      this.emit('execute', { command, success: result.exitCode === 0 });

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } catch (error) {
      logger.error('PowerShell command execution failed', {
        command: command.substring(0, 100),
        error: error.message
      });
      this.emit('execute', { command, success: false, error: error.message });
      throw new Error(`Failed to execute command: ${error.message}`);
    }
  }

  /**
   * Execute PowerShell script file
   * @param {string} scriptPath - Path to PowerShell script (.ps1)
   * @param {Array} args - Script arguments
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeScript(scriptPath, args = [], options = {}) {
    try {
      logger.info('Executing PowerShell script', { scriptPath });

      const command = `& "${scriptPath}" ${args.map(arg => `"${arg}"`).join(' ')}`;
      return await this.execute(command, options);
    } catch (error) {
      logger.error('Failed to execute PowerShell script', {
        scriptPath,
        error: error.message
      });
      throw new Error(`Failed to execute script: ${error.message}`);
    }
  }

  /**
   * Get environment variable
   * @param {string} varName - Variable name
   * @returns {Promise<string>} Variable value
   */
  async getEnvVar(varName) {
    try {
      const result = await this.execute(`$env:${varName}`);
      return result.stdout.trim();
    } catch (error) {
      logger.error('Failed to get environment variable', { varName, error: error.message });
      throw new Error(`Failed to get environment variable: ${error.message}`);
    }
  }

  /**
   * Set environment variable (process scope)
   * @param {string} varName - Variable name
   * @param {string} value - Variable value
   * @returns {Promise<Object>} Execution result
   */
  async setEnvVar(varName, value) {
    try {
      const command = `$env:${varName} = "${value}"`;
      return await this.execute(command);
    } catch (error) {
      logger.error('Failed to set environment variable', { varName, error: error.message });
      throw new Error(`Failed to set environment variable: ${error.message}`);
    }
  }

  /**
   * Get system information
   * @returns {Promise<Object>} System information
   */
  async getSystemInfo() {
    try {
      const command = `
        $info = @{
          ComputerName = $env:COMPUTERNAME
          OSVersion = [System.Environment]::OSVersion.VersionString
          ProcessorCount = [System.Environment]::ProcessorCount
          UserName = $env:USERNAME
          PowerShellVersion = $PSVersionTable.PSVersion.ToString()
        }
        $info | ConvertTo-Json
      `;

      const result = await this.execute(command);
      return JSON.parse(result.stdout);
    } catch (error) {
      logger.error('Failed to get system info', { error: error.message });
      throw new Error(`Failed to get system information: ${error.message}`);
    }
  }

  /**
   * Test path existence
   * @param {string} path - File or directory path
   * @returns {Promise<boolean>} True if path exists
   */
  async testPath(path) {
    try {
      const result = await this.execute(`Test-Path "${path}"`);
      return result.stdout.trim().toLowerCase() === 'true';
    } catch (error) {
      logger.error('Failed to test path', { path, error: error.message });
      return false;
    }
  }

  /**
   * Get file hash
   * @param {string} filePath - Path to file
   * @param {string} algorithm - Hash algorithm (SHA256, SHA1, MD5)
   * @returns {Promise<string>} File hash
   */
  async getFileHash(filePath, algorithm = 'SHA256') {
    try {
      const command = `(Get-FileHash "${filePath}" -Algorithm ${algorithm}).Hash`;
      const result = await this.execute(command);
      return result.stdout.trim();
    } catch (error) {
      logger.error('Failed to get file hash', { filePath, error: error.message });
      throw new Error(`Failed to get file hash: ${error.message}`);
    }
  }

  /**
   * Get PowerShell version
   * @private
   */
  async _getVersion(pwshPath) {
    const result = await this._execute(['-Version'], { pwshPath });
    return result.stdout.trim() || result.stderr.trim();
  }

  /**
   * Execute PowerShell command
   * @private
   */
  async _execute(args, options = {}) {
    return new Promise((resolve, reject) => {
      const pwshPath = options.pwshPath || this.config.pwshPath;

      const process = spawn(pwshPath, args, {
        windowsHide: true,
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        process.kill();
        reject(new Error(`Command timeout after ${this.config.timeout}ms`));
      }, options.timeout || this.config.timeout);

      process.on('close', (exitCode) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode });
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Encode command for safe execution
   * @param {string} command - PowerShell command
   * @returns {string} Base64 encoded command
   */
  encodeCommand(command) {
    const buffer = Buffer.from(command, 'utf16le');
    return buffer.toString('base64');
  }
}

export default PowerShellExecutor;
