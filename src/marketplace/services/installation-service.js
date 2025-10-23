/**
 * Installation Service
 * Handles package installation and uninstallation
 * @module marketplace/services/installation-service
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

class InstallationService {
  constructor() {
    this.installBasePath = path.join(process.cwd(), 'marketplace-packages');
  }

  /**
   * Install a package
   * @param {Object} pkg - Package data
   * @param {string} version - Version to install
   * @param {Object} config - Installation config
   * @returns {Promise<Object>} Installation result
   */
  async install(pkg, version = null, config = {}) {
    try {
      logger.info('Installing package', {
        id: pkg.id,
        name: pkg.name,
        version: version || pkg.version,
        type: pkg.install_type,
      });

      // Ensure install directory exists
      await fs.mkdir(this.installBasePath, { recursive: true });

      let result;

      switch (pkg.install_type) {
        case 'npm':
          result = await this.installNpm(pkg, version, config);
          break;
        case 'git':
          result = await this.installGit(pkg, version, config);
          break;
        case 'local':
          result = await this.installLocal(pkg, version, config);
          break;
        case 'url':
          result = await this.installUrl(pkg, version, config);
          break;
        default:
          throw new Error(`Unsupported install type: ${pkg.install_type}`);
      }

      return result;
    } catch (error) {
      logger.error('Package installation failed', {
        id: pkg.id,
        error: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Install NPM package
   * @param {Object} pkg - Package data
   * @param {string} version - Version to install
   * @param {Object} config - Installation config
   * @returns {Promise<Object>} Installation result
   */
  async installNpm(pkg, version, config) {
    try {
      const packageSpec = version ? `${pkg.install_command}@${version}` : pkg.install_command;
      const installPath = path.join(this.installBasePath, 'npm', pkg.id);

      await fs.mkdir(installPath, { recursive: true });

      // Initialize package.json if it doesn't exist
      const packageJsonPath = path.join(installPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
      } catch {
        await fs.writeFile(
          packageJsonPath,
          JSON.stringify({ name: pkg.id, version: '1.0.0', private: true }, null, 2)
        );
      }

      // Run npm install
      const { stdout, stderr } = await execAsync(`npm install ${packageSpec}`, {
        cwd: installPath,
        timeout: 300000, // 5 minute timeout
      });

      logger.debug('NPM install output', { stdout, stderr });

      return {
        success: true,
        installPath,
        method: 'npm',
      };
    } catch (error) {
      logger.error('NPM installation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Install from Git repository
   * @param {Object} pkg - Package data
   * @param {string} version - Version/branch/tag to install
   * @param {Object} config - Installation config
   * @returns {Promise<Object>} Installation result
   */
  async installGit(pkg, version, config) {
    try {
      const installPath = path.join(this.installBasePath, 'git', pkg.id);
      const repoUrl = pkg.install_command;

      // Clone repository
      const branch = version || 'main';
      const { stdout, stderr } = await execAsync(
        `git clone --depth 1 --branch ${branch} ${repoUrl} ${installPath}`,
        {
          timeout: 300000, // 5 minute timeout
        }
      );

      logger.debug('Git clone output', { stdout, stderr });

      // Install dependencies if package.json exists
      const packageJsonPath = path.join(installPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
        await execAsync('npm install --production', {
          cwd: installPath,
          timeout: 300000,
        });
        logger.info('Installed npm dependencies', { path: installPath });
      } catch {
        // No package.json, skip npm install
      }

      return {
        success: true,
        installPath,
        method: 'git',
      };
    } catch (error) {
      logger.error('Git installation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Install from local path
   * @param {Object} pkg - Package data
   * @param {string} version - Not used for local installs
   * @param {Object} config - Installation config
   * @returns {Promise<Object>} Installation result
   */
  async installLocal(pkg, version, config) {
    try {
      const sourcePath = pkg.install_command;
      const installPath = path.join(this.installBasePath, 'local', pkg.id);

      // Copy files from source to install path
      await fs.cp(sourcePath, installPath, { recursive: true });

      // Install dependencies if package.json exists
      const packageJsonPath = path.join(installPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
        await execAsync('npm install --production', {
          cwd: installPath,
          timeout: 300000,
        });
      } catch {
        // No package.json, skip npm install
      }

      return {
        success: true,
        installPath,
        method: 'local',
      };
    } catch (error) {
      logger.error('Local installation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Install from URL (download and extract)
   * @param {Object} pkg - Package data
   * @param {string} version - Not used for URL installs
   * @param {Object} config - Installation config
   * @returns {Promise<Object>} Installation result
   */
  async installUrl(pkg, version, config) {
    try {
      const url = pkg.install_command;
      const installPath = path.join(this.installBasePath, 'url', pkg.id);

      await fs.mkdir(installPath, { recursive: true });

      // Download file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const downloadPath = path.join(installPath, 'package.tar.gz');
      await fs.writeFile(downloadPath, Buffer.from(buffer));

      // Extract archive
      await execAsync(`tar -xzf package.tar.gz`, {
        cwd: installPath,
        timeout: 60000,
      });

      // Clean up archive
      await fs.unlink(downloadPath);

      // Install dependencies if package.json exists
      const packageJsonPath = path.join(installPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
        await execAsync('npm install --production', {
          cwd: installPath,
          timeout: 300000,
        });
      } catch {
        // No package.json, skip npm install
      }

      return {
        success: true,
        installPath,
        method: 'url',
      };
    } catch (error) {
      logger.error('URL installation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Uninstall a package
   * @param {Object} installation - Installation record
   * @returns {Promise<Object>} Uninstallation result
   */
  async uninstall(installation) {
    try {
      logger.info('Uninstalling package', {
        id: installation.package_id,
        path: installation.install_path,
      });

      if (installation.install_path) {
        // Remove installation directory
        await fs.rm(installation.install_path, { recursive: true, force: true });
        logger.info('Removed installation directory', { path: installation.install_path });
      }

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Package uninstallation failed', {
        id: installation.package_id,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify package installation
   * @param {string} installPath - Installation path
   * @returns {Promise<boolean>} True if valid
   */
  async verifyInstallation(installPath) {
    try {
      await fs.access(installPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get installed package info
   * @param {string} installPath - Installation path
   * @returns {Promise<Object|null>} Package info or null
   */
  async getInstalledInfo(installPath) {
    try {
      const packageJsonPath = path.join(installPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Failed to read package info', { installPath, error: error.message });
      return null;
    }
  }
}

// Singleton instance
export const installationService = new InstallationService();
