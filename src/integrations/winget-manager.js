// src/integrations/winget-manager.js
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Windows Package Manager (WinGet) automation service
 * Provides programmatic access to WinGet for dependency management
 * @module winget-manager
 * @extends EventEmitter
 */
export class WinGetManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: config.cacheTTL || 300000, // 5 minutes
    };
    this.cache = new Map();
    this.isAvailable = false;
    this.wingetPath = 'winget';
  }

  /**
   * Initialize WinGet manager and verify availability
   * @returns {Promise<boolean>} True if WinGet is available
   */
  async initialize() {
    try {
      logger.info('Initializing WinGet Manager');
      const version = await this.getVersion();
      this.isAvailable = !!version;

      if (this.isAvailable) {
        logger.info('WinGet Manager initialized', { version });
      } else {
        logger.warn('WinGet not available on this system');
      }

      return this.isAvailable;
    } catch (error) {
      logger.error('Failed to initialize WinGet Manager', { error: error.message });
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Get WinGet version
   * @returns {Promise<string>} WinGet version string
   */
  async getVersion() {
    try {
      const result = await this._execute(['--version']);
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Failed to get WinGet version: ${error.message}`);
    }
  }

  /**
   * Search for packages
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of package objects
   */
  async search(query, options = {}) {
    try {
      const cacheKey = `search:${query}:${JSON.stringify(options)}`;

      if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.cacheTTL) {
          logger.debug('Returning cached search results', { query });
          return cached.data;
        }
      }

      logger.info('Searching WinGet packages', { query });

      const args = ['search', query, '--accept-source-agreements'];
      if (options.exact) args.push('--exact');
      if (options.source) args.push('--source', options.source);

      const result = await this._execute(args);
      const packages = this._parseSearchOutput(result.stdout);

      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: packages,
          timestamp: Date.now(),
        });
      }

      this.emit('search', { query, count: packages.length });
      return packages;
    } catch (error) {
      logger.error('WinGet search failed', { query, error: error.message });
      throw new Error(`Failed to search packages: ${error.message}`);
    }
  }

  /**
   * Install a package
   * @param {string} packageId - Package identifier
   * @param {Object} options - Installation options
   * @returns {Promise<Object>} Installation result
   */
  async install(packageId, options = {}) {
    try {
      logger.info('Installing package via WinGet', { packageId });

      const args = ['install', packageId, '--accept-package-agreements', '--accept-source-agreements'];
      if (options.silent) args.push('--silent');
      if (options.version) args.push('--version', options.version);
      if (options.source) args.push('--source', options.source);
      if (options.scope) args.push('--scope', options.scope);

      const result = await this._execute(args);

      this.emit('install', { packageId, success: true });

      return {
        success: true,
        packageId,
        output: result.stdout,
      };
    } catch (error) {
      logger.error('WinGet install failed', { packageId, error: error.message });
      this.emit('install', { packageId, success: false, error: error.message });
      throw new Error(`Failed to install package: ${error.message}`);
    }
  }

  /**
   * Upgrade a package
   * @param {string} packageId - Package identifier (or 'all' for all packages)
   * @param {Object} options - Upgrade options
   * @returns {Promise<Object>} Upgrade result
   */
  async upgrade(packageId = 'all', options = {}) {
    try {
      logger.info('Upgrading package via WinGet', { packageId });

      const args = ['upgrade'];
      if (packageId !== 'all') {
        args.push(packageId);
      } else {
        args.push('--all');
      }

      args.push('--accept-package-agreements', '--accept-source-agreements');
      if (options.silent) args.push('--silent');
      if (options.includeUnknown) args.push('--include-unknown');

      const result = await this._execute(args);

      this.emit('upgrade', { packageId, success: true });

      return {
        success: true,
        packageId,
        output: result.stdout,
      };
    } catch (error) {
      logger.error('WinGet upgrade failed', { packageId, error: error.message });
      this.emit('upgrade', { packageId, success: false, error: error.message });
      throw new Error(`Failed to upgrade package: ${error.message}`);
    }
  }

  /**
   * Uninstall a package
   * @param {string} packageId - Package identifier
   * @param {Object} options - Uninstallation options
   * @returns {Promise<Object>} Uninstallation result
   */
  async uninstall(packageId, options = {}) {
    try {
      logger.info('Uninstalling package via WinGet', { packageId });

      const args = ['uninstall', packageId];
      if (options.silent) args.push('--silent');
      if (options.version) args.push('--version', options.version);

      const result = await this._execute(args);

      this.emit('uninstall', { packageId, success: true });

      return {
        success: true,
        packageId,
        output: result.stdout,
      };
    } catch (error) {
      logger.error('WinGet uninstall failed', { packageId, error: error.message });
      this.emit('uninstall', { packageId, success: false, error: error.message });
      throw new Error(`Failed to uninstall package: ${error.message}`);
    }
  }

  /**
   * List installed packages
   * @param {Object} options - List options
   * @returns {Promise<Array>} Array of installed packages
   */
  async list(options = {}) {
    try {
      logger.info('Listing installed packages');

      const args = ['list'];
      if (options.query) args.push(options.query);
      if (options.source) args.push('--source', options.source);

      const result = await this._execute(args);
      const packages = this._parseListOutput(result.stdout);

      this.emit('list', { count: packages.length });

      return packages;
    } catch (error) {
      logger.error('WinGet list failed', { error: error.message });
      throw new Error(`Failed to list packages: ${error.message}`);
    }
  }

  /**
   * Show package details
   * @param {string} packageId - Package identifier
   * @returns {Promise<Object>} Package details
   */
  async show(packageId) {
    try {
      logger.info('Showing package details', { packageId });

      const args = ['show', packageId, '--accept-source-agreements'];
      const result = await this._execute(args);
      const details = this._parseShowOutput(result.stdout);

      return details;
    } catch (error) {
      logger.error('WinGet show failed', { packageId, error: error.message });
      throw new Error(`Failed to show package details: ${error.message}`);
    }
  }

  /**
   * Execute WinGet command
   * @private
   * @param {Array<string>} args - Command arguments
   * @returns {Promise<Object>} Execution result
   */
  async _execute(args) {
    return new Promise((resolve, reject) => {
      const process = spawn(this.wingetPath, args, {
        windowsHide: true,
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

        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`WinGet command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Parse search output
   * @private
   */
  _parseSearchOutput(output) {
    const lines = output.split('\n').filter(line => line.trim());
    const packages = [];

    // Skip header lines and parse data rows
    let dataStarted = false;
    for (const line of lines) {
      if (line.includes('---')) {
        dataStarted = true;
        continue;
      }

      if (dataStarted && line.trim()) {
        const parts = line.split(/\s{2,}/).map(p => p.trim());
        if (parts.length >= 3) {
          packages.push({
            name: parts[0],
            id: parts[1],
            version: parts[2],
            source: parts[3] || 'winget',
          });
        }
      }
    }

    return packages;
  }

  /**
   * Parse list output
   * @private
   */
  _parseListOutput(output) {
    return this._parseSearchOutput(output);
  }

  /**
   * Parse show output
   * @private
   */
  _parseShowOutput(output) {
    const details = {};
    const lines = output.split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        if (key && value) {
          details[key] = value;
        }
      }
    }

    return details;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('WinGet cache cleared');
  }
}

export default WinGetManager;
