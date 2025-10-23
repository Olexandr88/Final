// src/tools/dev-environment-orchestrator.js
// Automated Development Environment Setup and Management
// Uses Windows integration to detect, install, and verify development tools

import EventEmitter from 'events';
import { WinGetManager } from '../integrations/winget-manager.js';
import { WSLBridge } from '../integrations/wsl-bridge.js';
import { PowerShellExecutor } from '../integrations/powershell-executor.js';
import { logger } from '../utils/logger.js';

/**
 * Development environment profiles
 * Each profile defines a set of tools needed for a specific development scenario
 */
export const DEV_PROFILES = {
  'web-frontend': {
    name: 'Web Frontend Development',
    description: 'React, Vue, Angular, modern web development',
    tools: [
      { id: 'OpenJS.NodeJS', name: 'Node.js', required: true, verify: 'node --version' },
      { id: 'Git.Git', name: 'Git', required: true, verify: 'git --version' },
      { id: 'Microsoft.VisualStudioCode', name: 'VS Code', required: true, verify: 'code --version' },
      { id: 'Google.Chrome', name: 'Chrome', required: false, verify: null },
      { id: 'Postman.Postman', name: 'Postman', required: false, verify: null },
    ]
  },
  'web-fullstack': {
    name: 'Full Stack Web Development',
    description: 'Frontend + Backend + Database',
    tools: [
      { id: 'OpenJS.NodeJS', name: 'Node.js', required: true, verify: 'node --version' },
      { id: 'Git.Git', name: 'Git', required: true, verify: 'git --version' },
      { id: 'Microsoft.VisualStudioCode', name: 'VS Code', required: true, verify: 'code --version' },
      { id: 'Docker.DockerDesktop', name: 'Docker Desktop', required: true, verify: 'docker --version' },
      { id: 'PostgreSQL.PostgreSQL', name: 'PostgreSQL', required: false, verify: 'psql --version' },
      { id: 'Postman.Postman', name: 'Postman', required: false, verify: null },
    ]
  },
  'python-dev': {
    name: 'Python Development',
    description: 'Python data science and web development',
    tools: [
      { id: 'Python.Python.3.12', name: 'Python 3.12', required: true, verify: 'python --version' },
      { id: 'Git.Git', name: 'Git', required: true, verify: 'git --version' },
      { id: 'Microsoft.VisualStudioCode', name: 'VS Code', required: true, verify: 'code --version' },
      { id: 'Microsoft.PowerShell', name: 'PowerShell', required: false, verify: 'pwsh --version' },
    ]
  },
  'devops': {
    name: 'DevOps Engineering',
    description: 'Cloud, containers, automation',
    tools: [
      { id: 'Git.Git', name: 'Git', required: true, verify: 'git --version' },
      { id: 'Docker.DockerDesktop', name: 'Docker Desktop', required: true, verify: 'docker --version' },
      { id: 'Kubernetes.kubectl', name: 'kubectl', required: true, verify: 'kubectl version --client' },
      { id: 'Microsoft.PowerShell', name: 'PowerShell', required: true, verify: 'pwsh --version' },
      { id: 'Microsoft.AzureCLI', name: 'Azure CLI', required: false, verify: 'az --version' },
      { id: 'Amazon.AWSCLI', name: 'AWS CLI', required: false, verify: 'aws --version' },
    ]
  },
  'minimal': {
    name: 'Minimal Development Setup',
    description: 'Essential tools only',
    tools: [
      { id: 'Git.Git', name: 'Git', required: true, verify: 'git --version' },
      { id: 'OpenJS.NodeJS', name: 'Node.js', required: true, verify: 'node --version' },
      { id: 'Microsoft.VisualStudioCode', name: 'VS Code', required: true, verify: 'code --version' },
    ]
  }
};

/**
 * DevEnvironmentOrchestrator
 * Automates development environment setup using Windows integration
 */
export class DevEnvironmentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      autoInstall: options.autoInstall ?? false,
      silent: options.silent ?? true,
      verifyInstallations: options.verifyInstallations ?? true,
      testInWSL: options.testInWSL ?? false,
      ...options
    };

    this.winget = new WinGetManager({ cacheEnabled: true });
    this.wsl = new WSLBridge();
    this.ps = new PowerShellExecutor();

    this.state = {
      initialized: false,
      detected: [],
      missing: [],
      installed: [],
      failed: [],
      verified: []
    };
  }

  /**
   * Initialize all Windows integration components
   */
  async initialize() {
    logger.info('Initializing DevEnvironmentOrchestrator');

    try {
      // Initialize all components in parallel
      await Promise.all([
        this.winget.initialize(),
        this.wsl.initialize(),
        this.ps.initialize()
      ]);

      this.state.initialized = true;

      // Emit availability info
      this.emit('initialized', {
        winget: this.winget.isAvailable,
        wsl: this.wsl.isAvailable,
        powershell: this.ps.isAvailable
      });

      logger.info('DevEnvironmentOrchestrator initialized', {
        winget: this.winget.isAvailable,
        wsl: this.wsl.isAvailable,
        powershell: this.ps.isAvailable
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize DevEnvironmentOrchestrator', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect currently installed tools from a profile
   */
  async detectEnvironment(profileName) {
    if (!this.state.initialized) {
      await this.initialize();
    }

    const profile = DEV_PROFILES[profileName];
    if (!profile) {
      throw new Error(`Unknown profile: ${profileName}`);
    }

    logger.info('Detecting environment', { profile: profileName });
    this.emit('detection:start', { profile: profileName });

    const detected = [];
    const missing = [];

    // Get list of installed packages
    const installed = this.winget.isAvailable ? await this.winget.list() : [];
    const installedIds = new Set(installed.map(pkg => pkg.id));

    for (const tool of profile.tools) {
      const isInstalled = installedIds.has(tool.id);

      if (isInstalled) {
        detected.push(tool);
        this.emit('detection:found', { tool: tool.name });
      } else {
        missing.push(tool);
        this.emit('detection:missing', { tool: tool.name, required: tool.required });
      }
    }

    this.state.detected = detected;
    this.state.missing = missing;

    this.emit('detection:complete', {
      detected: detected.length,
      missing: missing.length,
      requiredMissing: missing.filter(t => t.required).length
    });

    logger.info('Environment detection complete', {
      detected: detected.length,
      missing: missing.length
    });

    return { detected, missing };
  }

  /**
   * Install missing tools
   */
  async installMissing(options = {}) {
    if (!this.winget.isAvailable) {
      throw new Error('WinGet not available - cannot install packages');
    }

    const installRequired = options.requiredOnly ?? false;
    const toInstall = installRequired
      ? this.state.missing.filter(t => t.required)
      : this.state.missing;

    if (toInstall.length === 0) {
      logger.info('No packages to install');
      return { installed: [], failed: [] };
    }

    logger.info('Starting installation', { count: toInstall.length });
    this.emit('install:start', { count: toInstall.length });

    const installed = [];
    const failed = [];

    for (let i = 0; i < toInstall.length; i++) {
      const tool = toInstall[i];

      this.emit('install:progress', {
        current: i + 1,
        total: toInstall.length,
        tool: tool.name
      });

      try {
        logger.info('Installing package', { tool: tool.name, id: tool.id });

        await this.winget.install(tool.id, {
          silent: this.config.silent,
          accept: true
        });

        installed.push(tool);
        this.emit('install:success', { tool: tool.name });
        logger.info('Package installed successfully', { tool: tool.name });

      } catch (error) {
        failed.push({ tool, error: error.message });
        this.emit('install:failed', { tool: tool.name, error: error.message });
        logger.error('Package installation failed', {
          tool: tool.name,
          error: error.message
        });
      }
    }

    this.state.installed = installed;
    this.state.failed = failed;

    this.emit('install:complete', {
      installed: installed.length,
      failed: failed.length
    });

    logger.info('Installation complete', {
      installed: installed.length,
      failed: failed.length
    });

    return { installed, failed };
  }

  /**
   * Verify installations by running version commands
   */
  async verifyInstallations() {
    if (!this.ps.isAvailable) {
      logger.warn('PowerShell not available - skipping verification');
      return { verified: [], failed: [] };
    }

    const toVerify = [...this.state.detected, ...this.state.installed].filter(
      tool => tool.verify
    );

    if (toVerify.length === 0) {
      logger.info('No tools to verify');
      return { verified: [], failed: [] };
    }

    logger.info('Starting verification', { count: toVerify.length });
    this.emit('verify:start', { count: toVerify.length });

    const verified = [];
    const failed = [];

    for (const tool of toVerify) {
      this.emit('verify:checking', { tool: tool.name });

      try {
        const result = await this.ps.execute(tool.verify, { timeout: 5000 });

        if (result.success) {
          const version = result.stdout.trim().split('\n')[0];
          verified.push({ tool, version });
          this.emit('verify:success', { tool: tool.name, version });
          logger.info('Tool verified', { tool: tool.name, version });
        } else {
          failed.push({ tool, error: 'Command failed' });
          this.emit('verify:failed', { tool: tool.name });
        }
      } catch (error) {
        failed.push({ tool, error: error.message });
        this.emit('verify:failed', { tool: tool.name, error: error.message });
        logger.error('Verification failed', { tool: tool.name, error: error.message });
      }
    }

    this.state.verified = verified;

    this.emit('verify:complete', {
      verified: verified.length,
      failed: failed.length
    });

    logger.info('Verification complete', {
      verified: verified.length,
      failed: failed.length
    });

    return { verified, failed };
  }

  /**
   * Test installations in WSL environment
   */
  async testInWSL() {
    if (!this.wsl.isAvailable) {
      logger.warn('WSL not available - skipping WSL tests');
      return { tested: [], failed: [] };
    }

    const toTest = [...this.state.detected, ...this.state.installed].filter(
      tool => tool.verify
    );

    logger.info('Testing in WSL', { count: toTest.length });
    this.emit('wsl:test:start', { count: toTest.length });

    const tested = [];
    const failed = [];

    for (const tool of toTest) {
      this.emit('wsl:test:checking', { tool: tool.name });

      try {
        const result = await this.wsl.execute(tool.verify);

        if (result.success) {
          tested.push({ tool, output: result.stdout.trim() });
          this.emit('wsl:test:success', { tool: tool.name });
        } else {
          failed.push({ tool, error: 'Command failed in WSL' });
          this.emit('wsl:test:failed', { tool: tool.name });
        }
      } catch (error) {
        failed.push({ tool, error: error.message });
        this.emit('wsl:test:failed', { tool: tool.name, error: error.message });
      }
    }

    this.emit('wsl:test:complete', {
      tested: tested.length,
      failed: failed.length
    });

    logger.info('WSL testing complete', {
      tested: tested.length,
      failed: failed.length
    });

    return { tested, failed };
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    if (!this.ps.isAvailable) {
      return null;
    }

    try {
      return await this.ps.getSystemInfo();
    } catch (error) {
      logger.error('Failed to get system info', { error: error.message });
      return null;
    }
  }

  /**
   * Generate a comprehensive report
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        wingetAvailable: this.winget.isAvailable,
        wslAvailable: this.wsl.isAvailable,
        powershellAvailable: this.ps.isAvailable
      },
      environment: {
        detected: this.state.detected.length,
        missing: this.state.missing.length,
        installed: this.state.installed.length,
        failed: this.state.failed.length,
        verified: this.state.verified.length
      },
      details: {
        detected: this.state.detected.map(t => t.name),
        missing: this.state.missing.map(t => ({
          name: t.name,
          required: t.required
        })),
        installed: this.state.installed.map(t => t.name),
        failed: this.state.failed.map(f => ({
          name: f.tool.name,
          error: f.error
        })),
        verified: this.state.verified.map(v => ({
          name: v.tool.name,
          version: v.version
        }))
      }
    };
  }

  /**
   * Complete setup workflow for a profile
   */
  async setupEnvironment(profileName, options = {}) {
    logger.info('Starting environment setup', { profile: profileName });
    this.emit('setup:start', { profile: profileName });

    try {
      // Step 1: Detect current environment
      await this.detectEnvironment(profileName);

      // Step 2: Install missing tools (if auto-install enabled)
      if (this.config.autoInstall || options.install) {
        await this.installMissing({ requiredOnly: options.requiredOnly });
      }

      // Step 3: Verify installations
      if (this.config.verifyInstallations || options.verify) {
        await this.verifyInstallations();
      }

      // Step 4: Test in WSL (if enabled)
      if (this.config.testInWSL || options.testWSL) {
        await this.testInWSL();
      }

      const report = this.generateReport();
      this.emit('setup:complete', report);
      logger.info('Environment setup complete', report);

      return report;

    } catch (error) {
      this.emit('setup:error', { error: error.message });
      logger.error('Environment setup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * List all available profiles
   */
  static getProfiles() {
    return Object.entries(DEV_PROFILES).map(([key, profile]) => ({
      id: key,
      name: profile.name,
      description: profile.description,
      toolCount: profile.tools.length,
      requiredCount: profile.tools.filter(t => t.required).length
    }));
  }
}
