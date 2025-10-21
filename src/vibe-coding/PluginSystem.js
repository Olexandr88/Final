import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * PluginSystem - Package and distribute complete vibe-coding environments
 * Implements the plugin architecture from "The Vibe Coder's Compass"
 */
export class PluginSystem extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || Logger.getInstance();
    this.pluginDir = options.pluginDir || '.vibe-coding/plugins';
    this.plugins = new Map();
    this.activePlugins = new Set();
  }

  /**
   * Initialize plugin system
   */
  async initialize() {
    await fs.mkdir(this.pluginDir, { recursive: true });
    await this._discoverPlugins();
    this.logger.info('Plugin system initialized');
  }

  /**
   * Create a new plugin
   */
  async createPlugin(name, config = {}) {
    const {
      version = '1.0.0',
      description = '',
      author = '',
      subAgents = [],
      hooks = [],
      mcpServers = [],
      slashCommands = [],
      claudeMd = '',
      permissions = {},
    } = config;

    const plugin = {
      name,
      version,
      description,
      author,
      subAgents,
      hooks,
      mcpServers,
      slashCommands,
      claudeMd,
      permissions,
      createdAt: Date.now(),
      active: false,
    };

    // Save plugin manifest
    const pluginPath = path.join(this.pluginDir, name);
    await fs.mkdir(pluginPath, { recursive: true });

    const manifestPath = path.join(pluginPath, 'plugin.json');
    await fs.writeFile(manifestPath, JSON.stringify(plugin, null, 2), 'utf-8');

    // Save CLAUDE.md if provided
    if (claudeMd) {
      const claudeMdPath = path.join(pluginPath, 'CLAUDE.md');
      await fs.writeFile(claudeMdPath, claudeMd, 'utf-8');
    }

    // Save sub-agents
    if (subAgents.length > 0) {
      const agentsDir = path.join(pluginPath, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });

      for (const agent of subAgents) {
        const agentPath = path.join(agentsDir, `${agent.name}.md`);
        await fs.writeFile(agentPath, agent.content, 'utf-8');
      }
    }

    this.plugins.set(name, plugin);
    this.logger.info(`Created plugin: ${name} v${version}`);
    this.emit('plugin:created', { name, version });

    return plugin;
  }

  /**
   * Load plugin
   */
  async loadPlugin(name) {
    const pluginPath = path.join(this.pluginDir, name, 'plugin.json');

    try {
      const content = await fs.readFile(pluginPath, 'utf-8');
      const plugin = JSON.parse(content);

      this.plugins.set(name, plugin);
      this.logger.info(`Loaded plugin: ${name}`);

      return plugin;
    } catch (error) {
      this.logger.error(`Failed to load plugin: ${name}`, error);
      throw error;
    }
  }

  /**
   * Activate plugin
   */
  async activatePlugin(name, environment = {}) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (this.activePlugins.has(name)) {
      this.logger.warn(`Plugin ${name} already active`);
      return;
    }

    this.emit('plugin:activating', { name });

    try {
      // Apply plugin configuration to environment
      await this._applySubAgents(plugin, environment);
      await this._applyHooks(plugin, environment);
      await this._applyMCPServers(plugin, environment);
      await this._applyPermissions(plugin, environment);
      await this._applyClaudeMd(plugin, environment);

      this.activePlugins.add(name);
      plugin.active = true;

      this.emit('plugin:activated', { name });
      this.logger.info(`Activated plugin: ${name}`);
    } catch (error) {
      this.emit('plugin:activation-failed', { name, error });
      throw error;
    }
  }

  /**
   * Deactivate plugin
   */
  async deactivatePlugin(name, environment = {}) {
    if (!this.activePlugins.has(name)) {
      return;
    }

    const plugin = this.plugins.get(name);
    this.emit('plugin:deactivating', { name });

    // Remove plugin configuration from environment
    await this._removePluginConfiguration(plugin, environment);

    this.activePlugins.delete(name);
    if (plugin) {
      plugin.active = false;
    }

    this.emit('plugin:deactivated', { name });
    this.logger.info(`Deactivated plugin: ${name}`);
  }

  /**
   * Export plugin for distribution
   */
  async exportPlugin(name, outputPath) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    const pluginPath = path.join(this.pluginDir, name);

    // Create exportable package
    const pkg = {
      plugin,
      files: {},
    };

    // Read all plugin files
    const files = await this._readPluginFiles(pluginPath);
    pkg.files = files;

    await fs.writeFile(outputPath, JSON.stringify(pkg, null, 2), 'utf-8');
    this.logger.info(`Exported plugin to: ${outputPath}`);

    return outputPath;
  }

  /**
   * Import plugin from package
   */
  async importPlugin(packagePath) {
    const content = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);

    const { plugin, files } = pkg;
    const pluginPath = path.join(this.pluginDir, plugin.name);

    // Create plugin directory
    await fs.mkdir(pluginPath, { recursive: true });

    // Write all files
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(pluginPath, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    }

    this.plugins.set(plugin.name, plugin);
    this.logger.info(`Imported plugin: ${plugin.name}`);
    this.emit('plugin:imported', { name: plugin.name });

    return plugin;
  }

  /**
   * List all plugins
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
      active: p.active,
      author: p.author,
    }));
  }

  /**
   * Get plugin details
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * Delete plugin
   */
  async deletePlugin(name) {
    if (this.activePlugins.has(name)) {
      await this.deactivatePlugin(name);
    }

    const pluginPath = path.join(this.pluginDir, name);
    await fs.rm(pluginPath, { recursive: true, force: true });

    this.plugins.delete(name);
    this.logger.info(`Deleted plugin: ${name}`);
    this.emit('plugin:deleted', { name });
  }

  /**
   * Discover plugins in plugin directory
   */
  async _discoverPlugins() {
    try {
      const entries = await fs.readdir(this.pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            await this.loadPlugin(entry.name);
          } catch (error) {
            this.logger.warn(`Failed to load plugin: ${entry.name}`, error);
          }
        }
      }
    } catch (error) {
      // Plugin directory doesn't exist yet
    }
  }

  /**
   * Apply sub-agents from plugin
   */
  async _applySubAgents(plugin, environment) {
    if (environment.subAgents && plugin.subAgents.length > 0) {
      for (const agent of plugin.subAgents) {
        environment.subAgents.registerAgent(agent);
      }
    }
  }

  /**
   * Apply hooks from plugin
   */
  async _applyHooks(plugin, environment) {
    if (environment.hooks && plugin.hooks.length > 0) {
      for (const hook of plugin.hooks) {
        environment.hooks.register(hook.name, hook.handler, hook.options);
      }
    }
  }

  /**
   * Apply MCP servers from plugin
   */
  async _applyMCPServers(plugin, environment) {
    if (environment.mcp && plugin.mcpServers.length > 0) {
      for (const server of plugin.mcpServers) {
        await environment.mcp.addServer(server.name, server.config);
      }
    }
  }

  /**
   * Apply permissions from plugin
   */
  async _applyPermissions(plugin, environment) {
    if (environment.permissions && plugin.permissions) {
      if (plugin.permissions.allow) {
        for (const tool of plugin.permissions.allow) {
          environment.permissions.allow(tool);
        }
      }
      if (plugin.permissions.deny) {
        for (const tool of plugin.permissions.deny) {
          environment.permissions.deny(tool);
        }
      }
    }
  }

  /**
   * Apply CLAUDE.md from plugin
   */
  async _applyClaudeMd(plugin, environment) {
    // Would merge plugin CLAUDE.md with project CLAUDE.md
  }

  /**
   * Remove plugin configuration
   */
  async _removePluginConfiguration(plugin, environment) {
    // Reverse the application of plugin configuration
  }

  /**
   * Read all files in plugin directory
   */
  async _readPluginFiles(pluginPath, baseDir = pluginPath) {
    const files = {};
    const entries = await fs.readdir(pluginPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(pluginPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        const subFiles = await this._readPluginFiles(fullPath, baseDir);
        Object.assign(files, subFiles);
      } else {
        const content = await fs.readFile(fullPath, 'utf-8');
        files[relativePath] = content;
      }
    }

    return files;
  }
}
