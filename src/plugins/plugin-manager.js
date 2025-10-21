/**
 * Plugin Packaging System
 * Enables distribution of complete Claude Code environments
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class PluginManager {
  constructor(options = {}) {
    this.pluginDir = options.pluginDir || path.join(process.cwd(), '.claude', 'plugins');
    this.installedPlugins = new Map();
    this.pluginRegistry = options.registry || 'https://registry.claude-plugins.dev';

    this._ensureDirectories(); // Note: this is now async but called sync in constructor
  }

  /**
   * Create a new plugin package
   */
  async createPlugin(config) {
    const {
      name,
      version = '1.0.0',
      description,
      author,
      agents = [],
      hooks = [],
      mcpServers = [],
      slashCommands = [],
      claudeMd,
    } = config;

    const pluginPath = path.join(this.pluginDir, name);

    // Create plugin structure
    const structure = {
      'package.json': {
        name: `@claude-plugin/${name}`,
        version,
        description,
        author,
        type: 'claude-code-plugin',
        main: 'index.js',
      },
      'index.js': this._generatePluginIndex(config),
      'agents/': agents,
      'hooks/': hooks,
      'mcp/': mcpServers,
      'commands/': slashCommands,
      'CLAUDE.md': claudeMd || '',
      'README.md': this._generateReadme(config),
    };

    // Write plugin files
    await fs.promises.mkdir(pluginPath, { recursive: true });

    for (const [file, content] of Object.entries(structure)) {
      const filePath = path.join(pluginPath, file);

      if (file.endsWith('/')) {
        // Directory
        await fs.promises.mkdir(filePath, { recursive: true });
        if (Array.isArray(content)) {
          for (const item of content) {
            const itemPath = path.join(filePath, item.name);
            await fs.promises.writeFile(itemPath, JSON.stringify(item.content, null, 2));
          }
        }
      } else {
        // File
        const data = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
        await fs.promises.writeFile(filePath, data, 'utf-8');
      }
    }

    console.log(`✓ Plugin created: ${name} at ${pluginPath}`);

    return pluginPath;
  }

  /**
   * Install a plugin
   */
  async installPlugin(nameOrPath, options = {}) {
    let pluginPath;

    if (fs.existsSync(nameOrPath)) {
      // Local path
      pluginPath = path.resolve(nameOrPath);
    } else {
      // Download from registry
      pluginPath = await this._downloadPlugin(nameOrPath, options);
    }

    const packageJsonContent = await fs.promises.readFile(
      path.join(pluginPath, 'package.json'),
      'utf-8'
    );
    const packageJson = JSON.parse(packageJsonContent);

    // Install plugin components
    await this._installAgents(pluginPath);
    await this._installHooks(pluginPath);
    await this._installMcpServers(pluginPath);
    await this._installCommands(pluginPath);
    await this._installClaudeMd(pluginPath, options.scope || 'project');

    this.installedPlugins.set(packageJson.name, {
      name: packageJson.name,
      version: packageJson.version,
      path: pluginPath,
      installedAt: Date.now(),
    });

    console.log(`✓ Plugin installed: ${packageJson.name}@${packageJson.version}`);

    return packageJson.name;
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(name) {
    const plugin = this.installedPlugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`);
    }

    // Remove plugin components
    await this._removeAgents(plugin.path);
    await this._removeHooks(plugin.path);
    await this._removeMcpServers(plugin.path);
    await this._removeCommands(plugin.path);

    this.installedPlugins.delete(name);

    console.log(`✓ Plugin uninstalled: ${name}`);

    return true;
  }

  /**
   * List installed plugins
   */
  listPlugins() {
    return Array.from(this.installedPlugins.values());
  }

  /**
   * Package plugin for distribution
   */
  async packagePlugin(pluginPath, outputPath) {
    const packageJsonContent = await fs.promises.readFile(
      path.join(pluginPath, 'package.json'),
      'utf-8'
    );
    const packageJson = JSON.parse(packageJsonContent);

    const tarballName = `${packageJson.name.replace('@claude-plugin/', '')}-${packageJson.version}.tgz`;
    const tarballPath = path.join(outputPath, tarballName);

    // Create tarball
    execSync(
      `tar -czf "${tarballPath}" -C "${path.dirname(pluginPath)}" "${path.basename(pluginPath)}"`,
      {
        stdio: 'inherit',
      }
    );

    console.log(`✓ Plugin packaged: ${tarballPath}`);

    return tarballPath;
  }

  /**
   * Publish plugin to registry
   */
  async publishPlugin(pluginPath, options = {}) {
    const packageJsonContent = await fs.promises.readFile(
      path.join(pluginPath, 'package.json'),
      'utf-8'
    );
    const packageJson = JSON.parse(packageJsonContent);

    // Package plugin
    const tarballPath = await this.packagePlugin(pluginPath, path.dirname(pluginPath));

    // Upload to registry (placeholder - would integrate with actual registry API)
    console.log(
      `Publishing ${packageJson.name}@${packageJson.version} to ${this.pluginRegistry}...`
    );

    // In real implementation, would upload tarball to registry
    // const response = await fetch(`${this.pluginRegistry}/publish`, {
    //   method: 'POST',
    //   body: fs.createReadStream(tarballPath)
    // });

    console.log(`✓ Plugin published: ${packageJson.name}@${packageJson.version}`);

    return { name: packageJson.name, version: packageJson.version };
  }

  /**
   * Generate plugin index.js
   */
  _generatePluginIndex(config) {
    return `/**
 * ${config.name} Plugin
 * ${config.description}
 */

export default {
  name: '${config.name}',
  version: '${config.version}',

  activate(context) {
    console.log('Plugin activated: ${config.name}');

    // Load agents
    ${config.agents?.length ? `context.loadAgents('./agents');` : ''}

    // Register hooks
    ${config.hooks?.length ? `context.registerHooks('./hooks');` : ''}

    // Connect MCP servers
    ${config.mcpServers?.length ? `context.connectMcpServers('./mcp');` : ''}

    // Register commands
    ${config.slashCommands?.length ? `context.registerCommands('./commands');` : ''}
  },

  deactivate() {
    console.log('Plugin deactivated: ${config.name}');
  }
};
`;
  }

  /**
   * Generate plugin README
   */
  _generateReadme(config) {
    return `# ${config.name}

${config.description}

## Installation

\`\`\`bash
claude plugin install ${config.name}
\`\`\`

## Features

${config.agents?.length ? `### Sub-Agents\n${config.agents.map((a) => `- **${a.name}**: ${a.description}`).join('\n')}` : ''}

${config.hooks?.length ? `\n### Hooks\n${config.hooks.map((h) => `- **${h.event}**: ${h.description}`).join('\n')}` : ''}

${config.mcpServers?.length ? `\n### MCP Integrations\n${config.mcpServers.map((m) => `- **${m.name}**: ${m.description}`).join('\n')}` : ''}

## Usage

[Add usage instructions here]

## Configuration

[Add configuration details here]

## License

${config.license || 'MIT'}

## Author

${config.author}
`;
  }

  /**
   * Download plugin from registry
   */
  async _downloadPlugin(name, options) {
    // Placeholder - would integrate with actual registry API
    throw new Error('Plugin registry download not yet implemented');
  }

  /**
   * Install plugin agents
   */
  async _installAgents(pluginPath) {
    const agentsDir = path.join(pluginPath, 'agents');
    if (!fs.existsSync(agentsDir)) return;

    const targetDir = path.join(process.cwd(), '.claude', 'agents');
    await fs.promises.mkdir(targetDir, { recursive: true });

    const agents = await fs.promises.readdir(agentsDir);
    for (const agent of agents) {
      const src = path.join(agentsDir, agent);
      const dest = path.join(targetDir, agent);
      await fs.promises.copyFile(src, dest);
    }
  }

  /**
   * Install plugin hooks
   */
  async _installHooks(pluginPath) {
    const hooksFile = path.join(pluginPath, 'hooks', 'hooks.json');
    if (!fs.existsSync(hooksFile)) return;

    const hooksContent = await fs.promises.readFile(hooksFile, 'utf-8');
    const hooks = JSON.parse(hooksContent);
    const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');

    let settings = {};
    if (fs.existsSync(settingsPath)) {
      const settingsContent = await fs.promises.readFile(settingsPath, 'utf-8');
      settings = JSON.parse(settingsContent);
    }

    settings.hooks = { ...settings.hooks, ...hooks };

    await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  /**
   * Install MCP servers
   */
  async _installMcpServers(pluginPath) {
    const mcpFile = path.join(pluginPath, 'mcp', 'servers.json');
    if (!fs.existsSync(mcpFile)) return;

    const serversContent = await fs.promises.readFile(mcpFile, 'utf-8');
    const servers = JSON.parse(serversContent);
    const mcpConfigPath = path.join(process.cwd(), '.mcp.json');

    let mcpConfig = { servers: {} };
    if (fs.existsSync(mcpConfigPath)) {
      const mcpConfigContent = await fs.promises.readFile(mcpConfigPath, 'utf-8');
      mcpConfig = JSON.parse(mcpConfigContent);
    }

    mcpConfig.servers = { ...mcpConfig.servers, ...servers };

    await fs.promises.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
  }

  /**
   * Install slash commands
   */
  async _installCommands(pluginPath) {
    const commandsDir = path.join(pluginPath, 'commands');
    if (!fs.existsSync(commandsDir)) return;

    const targetDir = path.join(process.cwd(), '.claude', 'commands');
    await fs.promises.mkdir(targetDir, { recursive: true });

    const commands = await fs.promises.readdir(commandsDir);
    for (const cmd of commands) {
      const src = path.join(commandsDir, cmd);
      const dest = path.join(targetDir, cmd);
      await fs.promises.copyFile(src, dest);
    }
  }

  /**
   * Install CLAUDE.md
   */
  async _installClaudeMd(pluginPath, scope) {
    const claudeMdPath = path.join(pluginPath, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) return;

    let targetPath;
    if (scope === 'user') {
      targetPath = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'CLAUDE.md');
    } else {
      targetPath = path.join(process.cwd(), 'CLAUDE.md');
    }

    const content = await fs.promises.readFile(claudeMdPath, 'utf-8');

    // Append to existing CLAUDE.md if it exists
    if (fs.existsSync(targetPath)) {
      const existing = await fs.promises.readFile(targetPath, 'utf-8');
      await fs.promises.writeFile(targetPath, `${existing}\n\n${content}`, 'utf-8');
    } else {
      await fs.promises.writeFile(targetPath, content, 'utf-8');
    }
  }

  /**
   * Remove plugin components (stub implementations)
   */
  async _removeAgents(pluginPath) {
    /* Implementation */
  }
  async _removeHooks(pluginPath) {
    /* Implementation */
  }
  async _removeMcpServers(pluginPath) {
    /* Implementation */
  }
  async _removeCommands(pluginPath) {
    /* Implementation */
  }

  /**
   * Ensure required directories exist
   */
  async _ensureDirectories() {
    if (!fs.existsSync(this.pluginDir)) {
      await fs.promises.mkdir(this.pluginDir, { recursive: true });
    }
  }
}

export default PluginManager;
