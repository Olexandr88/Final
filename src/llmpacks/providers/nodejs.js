/**
 * Node.js provider for LLMPacks
 * Handles npm, yarn, and pnpm projects
 *
 * @module llmpacks/providers/nodejs
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';

export class NodeJSProvider {
  constructor(options) {
    this.projectPath = options.projectPath;
    this.detected = options.detected;
    this.config = options.config || {};
  }

  /**
   * Determine install command based on package manager
   * @returns {string} Install command
   */
  getInstallCommand() {
    const pm = this.detected.packageManager || 'npm';

    const commands = {
      npm: 'npm ci --production=false',
      yarn: 'yarn install --frozen-lockfile',
      pnpm: 'pnpm install --frozen-lockfile'
    };

    return commands[pm] || commands.npm;
  }

  /**
   * Determine build command from package.json scripts
   * @returns {Promise<string|null>} Build command or null
   */
  async getBuildCommand() {
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      const scripts = pkg.scripts || {};

      // Check for common build scripts
      const buildScripts = ['build', 'compile', 'prepare'];
      for (const script of buildScripts) {
        if (scripts[script]) {
          const pm = this.detected.packageManager || 'npm';
          return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;
        }
      }

      return null;
    } catch (error) {
      logger.warn('Could not read package.json for build command', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Determine start command from package.json
   * @returns {Promise<string>} Start command
   */
  async getStartCommand() {
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      const scripts = pkg.scripts || {};

      // Priority: start > serve > dev
      if (scripts.start) {
        return 'npm start';
      }
      if (scripts.serve) {
        return 'npm run serve';
      }
      if (scripts.dev) {
        return 'npm run dev';
      }

      // Check for main entry point
      if (pkg.main) {
        return `node ${pkg.main}`;
      }

      // Default
      return 'node index.js';
    } catch (error) {
      logger.warn('Could not determine start command, using default', {
        error: error.message
      });
      return 'node index.js';
    }
  }

  /**
   * Detect port from package.json or environment
   * @returns {Promise<number>} Port number
   */
  async detectPort() {
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      // Check for port in config
      if (pkg.config?.port) {
        return parseInt(pkg.config.port, 10);
      }

      // Check scripts for PORT environment variable
      const scripts = Object.values(pkg.scripts || {}).join(' ');
      const portMatch = scripts.match(/PORT=(\d+)/);
      if (portMatch) {
        return parseInt(portMatch[1], 10);
      }

      // Default port
      return 3000;
    } catch {
      return 3000;
    }
  }

  /**
   * Detect system dependencies
   * @returns {Promise<Array<string>>} System package names
   */
  async detectSystemDependencies() {
    const deps = [];

    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };

      // Check for packages that need system dependencies
      if (allDeps['canvas']) {
        deps.push('cairo-dev', 'jpeg-dev', 'pango-dev', 'giflib-dev');
      }
      if (allDeps['sharp']) {
        deps.push('vips-dev');
      }
      if (allDeps['node-sass'] || allDeps['sass']) {
        deps.push('python3', 'make', 'g++');
      }
      if (allDeps['bcrypt'] || allDeps['argon2']) {
        deps.push('python3', 'make', 'g++');
      }
    } catch {
      // Ignore errors
    }

    return deps;
  }

  /**
   * Generate build plan for Node.js project
   * @returns {Promise<Object>} Build plan
   */
  async generatePlan() {
    logger.debug('Generating Node.js build plan', {
      packageManager: this.detected.packageManager,
      version: this.detected.version
    });

    const buildCommand = await this.getBuildCommand();
    const startCommand = await this.getStartCommand();
    const port = await this.detectPort();
    const systemDeps = await this.detectSystemDependencies();

    const plan = {
      provider: 'nodejs',
      version: this.detected.version || '18',
      packageManager: this.detected.packageManager || 'npm',
      systemDependencies: systemDeps,
      phases: [
        {
          name: 'install',
          commands: [this.getInstallCommand()],
          cacheDirectories: ['node_modules', '.npm', '.yarn', '.pnpm'],
          environment: {
            NODE_ENV: 'development'
          }
        }
      ]
    };

    // Add build phase if build script exists
    if (buildCommand) {
      plan.phases.push({
        name: 'build',
        commands: [buildCommand],
        environment: {
          NODE_ENV: 'production'
        }
      });
    }

    // Add start phase
    plan.phases.push({
      name: 'start',
      command: startCommand,
      port,
      environment: {
        NODE_ENV: 'production',
        PORT: port.toString()
      }
    });

    logger.debug('Node.js build plan generated', {
      phases: plan.phases.length,
      hasBuil: !!buildCommand
    });

    return plan;
  }
}

export default NodeJSProvider;
