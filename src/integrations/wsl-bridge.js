// src/integrations/wsl-bridge.js
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { platform } from 'os';

/**
 * Windows Subsystem for Linux (WSL) bridge
 * Enables execution of Linux commands from Windows Node.js
 * @module wsl-bridge
 * @extends EventEmitter
 */
export class WSLBridge extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      timeout: config.timeout || 30000,
      defaultDistro: config.defaultDistro || null,
      retryAttempts: config.retryAttempts || 2,
    };
    this.isAvailable = false;
    this.wslPath = 'wsl.exe';
    this.distros = [];
  }

  /**
   * Initialize WSL bridge and detect available distributions
   * @returns {Promise<boolean>} True if WSL is available
   */
  async initialize() {
    try {
      // WSL only available on Windows
      if (platform() !== 'win32') {
        logger.warn('WSL Bridge not available on non-Windows platforms');
        this.isAvailable = false;
        return false;
      }

      logger.info('Initializing WSL Bridge');

      // Check WSL availability
      const version = await this.getVersion();
      this.isAvailable = !!version;

      if (this.isAvailable) {
        // Get list of installed distributions
        this.distros = await this.listDistros();
        logger.info('WSL Bridge initialized', {
          version,
          distros: this.distros.length
        });
      } else {
        logger.warn('WSL not available on this system');
      }

      return this.isAvailable;
    } catch (error) {
      logger.error('Failed to initialize WSL Bridge', { error: error.message });
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Get WSL version
   * @returns {Promise<string>} WSL version string
   */
  async getVersion() {
    try {
      const result = await this._execute(['--version']);
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Failed to get WSL version: ${error.message}`);
    }
  }

  /**
   * List installed WSL distributions
   * @returns {Promise<Array>} Array of distribution objects
   */
  async listDistros() {
    try {
      logger.info('Listing WSL distributions');

      const result = await this._execute(['--list', '--verbose']);
      const distros = this._parseDistroList(result.stdout);

      return distros;
    } catch (error) {
      logger.error('Failed to list WSL distros', { error: error.message });
      throw new Error(`Failed to list distributions: ${error.message}`);
    }
  }

  /**
   * Execute command in WSL
   * @param {string} command - Linux command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async execute(command, options = {}) {
    try {
      if (!this.isAvailable) {
        throw new Error('WSL is not available');
      }

      logger.info('Executing WSL command', { command });

      const args = [];

      // Specify distribution if provided
      if (options.distro || this.config.defaultDistro) {
        args.push('--distribution', options.distro || this.config.defaultDistro);
      }

      // Specify user if provided
      if (options.user) {
        args.push('--user', options.user);
      }

      // Add the command
      args.push('--exec', '/bin/bash', '-c', command);

      const result = await this._execute(args, {
        cwd: options.cwd,
        env: options.env,
      });

      this.emit('execute', { command, success: true });

      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } catch (error) {
      logger.error('WSL command execution failed', { command, error: error.message });
      this.emit('execute', { command, success: false, error: error.message });
      throw new Error(`Failed to execute command: ${error.message}`);
    }
  }

  /**
   * Execute Node.js script in WSL
   * @param {string} scriptPath - Path to Node.js script
   * @param {Array} args - Script arguments
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeNode(scriptPath, args = [], options = {}) {
    try {
      const windowsPath = scriptPath.replace(/\\/g, '/');
      const wslPath = this._convertToWSLPath(windowsPath);

      const command = `node ${wslPath} ${args.join(' ')}`;
      return await this.execute(command, options);
    } catch (error) {
      logger.error('Failed to execute Node.js in WSL', { scriptPath, error: error.message });
      throw new Error(`Failed to execute Node.js script: ${error.message}`);
    }
  }

  /**
   * Convert Windows path to WSL path
   * @param {string} windowsPath - Windows file path
   * @returns {string} WSL path
   */
  _convertToWSLPath(windowsPath) {
    // Convert C:\Users\... to /mnt/c/Users/...
    const match = windowsPath.match(/^([A-Za-z]):(.*)/);
    if (match) {
      const drive = match[1].toLowerCase();
      const path = match[2].replace(/\\/g, '/');
      return `/mnt/${drive}${path}`;
    }
    return windowsPath;
  }

  /**
   * Convert WSL path to Windows path
   * @param {string} wslPath - WSL file path
   * @returns {string} Windows path
   */
  _convertToWindowsPath(wslPath) {
    // Convert /mnt/c/Users/... to C:\Users\...
    const match = wslPath.match(/^\/mnt\/([a-z])(.*)/);
    if (match) {
      const drive = match[1].toUpperCase();
      const path = match[2].replace(/\//g, '\\');
      return `${drive}:${path}`;
    }
    return wslPath;
  }

  /**
   * Check if a distribution is running
   * @param {string} distroName - Distribution name
   * @returns {Promise<boolean>} True if running
   */
  async isDistroRunning(distroName) {
    try {
      const distros = await this.listDistros();
      const distro = distros.find(d => d.name === distroName);
      return distro ? distro.state === 'Running' : false;
    } catch (error) {
      logger.error('Failed to check distro status', { distroName, error: error.message });
      return false;
    }
  }

  /**
   * Shutdown a distribution
   * @param {string} distroName - Distribution name
   * @returns {Promise<Object>} Shutdown result
   */
  async shutdownDistro(distroName) {
    try {
      logger.info('Shutting down WSL distro', { distroName });

      const result = await this._execute(['--terminate', distroName]);

      this.emit('shutdown', { distroName, success: true });

      return {
        success: true,
        distroName,
      };
    } catch (error) {
      logger.error('Failed to shutdown distro', { distroName, error: error.message });
      this.emit('shutdown', { distroName, success: false, error: error.message });
      throw new Error(`Failed to shutdown distribution: ${error.message}`);
    }
  }

  /**
   * Execute WSL command
   * @private
   */
  async _execute(args, options = {}) {
    return new Promise((resolve, reject) => {
      const process = spawn(this.wslPath, args, {
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
      }, this.config.timeout);

      process.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, code });
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Parse distribution list output
   * @private
   */
  _parseDistroList(output) {
    const lines = output.split('\n').filter(line => line.trim());
    const distros = [];

    // Skip header line
    let headerSkipped = false;
    for (const line of lines) {
      if (!headerSkipped) {
        headerSkipped = true;
        continue;
      }

      // Parse: NAME STATE VERSION
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[0].replace('*', '').trim();
        const state = parts[1];
        const version = parts[2] || '1';

        distros.push({
          name,
          state,
          version,
          isDefault: line.includes('*'),
        });
      }
    }

    return distros;
  }

  /**
   * Get path conversion utilities
   * @returns {Object} Path conversion functions
   */
  getPathUtils() {
    return {
      toWSL: this._convertToWSLPath.bind(this),
      toWindows: this._convertToWindowsPath.bind(this),
    };
  }
}

export default WSLBridge;
