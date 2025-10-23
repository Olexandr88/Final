/**
 * Electron provider for LLMPacks
 * Specialized builder for Electron desktop applications
 *
 * @module llmpacks/providers/electron
 */

import fs from 'fs/promises';
import path from 'path';
import { NodeJSProvider } from './nodejs.js';
import { logger } from '../../utils/logger.js';

export class ElectronProvider extends NodeJSProvider {
  constructor(options) {
    super(options);
  }

  /**
   * Detect Electron-specific build configuration
   * @returns {Promise<Object>} Electron build config
   */
  async detectElectronConfig() {
    const config = {
      hasElectronBuilder: false,
      hasElectronForge: false,
      hasElectronPackager: false,
      platforms: ['linux'],
      mainFile: 'main.js'
    };

    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      // Check for electron-builder
      if (pkg.devDependencies?.['electron-builder'] || pkg.dependencies?.['electron-builder']) {
        config.hasElectronBuilder = true;
      }

      // Check for electron-forge
      if (pkg.devDependencies?.['@electron-forge/cli'] || pkg.dependencies?.['@electron-forge/cli']) {
        config.hasElectronForge = true;
      }

      // Check for electron-packager
      if (pkg.devDependencies?.['electron-packager'] || pkg.dependencies?.['electron-packager']) {
        config.hasElectronPackager = true;
      }

      // Get main file
      if (pkg.main) {
        config.mainFile = pkg.main;
      }

      // Detect target platforms from build config
      if (pkg.build?.linux) {
        config.platforms.push('linux');
      }
      if (pkg.build?.win) {
        config.platforms.push('win32');
      }
      if (pkg.build?.mac) {
        config.platforms.push('darwin');
      }
    } catch (error) {
      logger.warn('Could not detect Electron config', { error: error.message });
    }

    return config;
  }

  /**
   * Get Electron-specific system dependencies
   * @returns {Promise<Array<string>>} System packages for Electron
   */
  async getElectronSystemDeps() {
    const baseDeps = await this.detectSystemDependencies();

    // Electron requires additional X11 libraries for headless environments
    const electronDeps = [
      'xvfb',
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'libgconf-2-4',
      'libasound2'
    ];

    return [...baseDeps, ...electronDeps];
  }

  /**
   * Determine Electron build command
   * @returns {Promise<string|null>} Build command
   */
  async getElectronBuildCommand() {
    const config = await this.detectElectronConfig();
    const pm = this.detected.packageManager || 'npm';

    if (config.hasElectronBuilder) {
      return pm === 'npm' ? 'npm run build' : `${pm} build`;
    }

    if (config.hasElectronForge) {
      return pm === 'npm' ? 'npm run make' : `${pm} make`;
    }

    if (config.hasElectronPackager) {
      return pm === 'npm' ? 'npm run package' : `${pm} package`;
    }

    // Fallback to regular build
    return await this.getBuildCommand();
  }

  /**
   * Generate build plan for Electron project
   * @returns {Promise<Object>} Build plan
   */
  async generatePlan() {
    logger.debug('Generating Electron build plan', {
      packageManager: this.detected.packageManager,
      version: this.detected.version
    });

    const electronConfig = await this.detectElectronConfig();
    const buildCommand = await this.getElectronBuildCommand();
    const systemDeps = await this.getElectronSystemDeps();
    const port = await this.detectPort();

    const plan = {
      provider: 'electron',
      version: this.detected.version || '18',
      packageManager: this.detected.packageManager || 'npm',
      electronConfig,
      systemDependencies: systemDeps,
      phases: [
        {
          name: 'install',
          commands: [this.getInstallCommand()],
          cacheDirectories: ['node_modules', '.npm', '.yarn', '.pnpm', '.electron'],
          environment: {
            NODE_ENV: 'development',
            ELECTRON_CACHE: '/app/.electron',
            ELECTRON_BUILDER_CACHE: '/app/.electron-builder'
          }
        }
      ]
    };

    // Add build phase for Electron packaging
    if (buildCommand) {
      plan.phases.push({
        name: 'build',
        commands: [buildCommand],
        environment: {
          NODE_ENV: 'production',
          ELECTRON_ENABLE_LOGGING: 'true',
          DISPLAY: ':99' // Xvfb display for headless
        },
        outputDirectory: 'dist' // Electron builder default
      });
    }

    // Add start phase - Electron apps run differently
    plan.phases.push({
      name: 'start',
      command: 'xvfb-run --auto-servernum npm start',
      port,
      environment: {
        NODE_ENV: 'production',
        DISPLAY: ':99',
        ELECTRON_ENABLE_LOGGING: 'true'
      }
    });

    logger.debug('Electron build plan generated', {
      phases: plan.phases.length,
      hasBuild: !!buildCommand,
      builder: electronConfig.hasElectronBuilder ? 'electron-builder' :
               electronConfig.hasElectronForge ? 'electron-forge' :
               electronConfig.hasElectronPackager ? 'electron-packager' : 'none'
    });

    return plan;
  }
}

export default ElectronProvider;
