/**
 * Agent Version Manager
 * Implements semantic versioning for agent capabilities
 * @module agent-version-manager
 */

import semver from 'semver';
import { logger } from '../utils/logger.js';

export class AgentVersionManager {
  constructor(config = {}) {
    this.config = {
      minVersion: config.minVersion || '1.0.0',
      strictMode: config.strictMode !== false,
      ...config
    };

    this.versionRegistry = new Map();
  }

  /**
   * Register agent version
   */
  registerVersion(agentId, version, capabilities = {}) {
    if (!semver.valid(version)) {
      throw new Error(`Invalid semantic version: ${version}`);
    }

    this.versionRegistry.set(agentId, {
      version,
      capabilities,
      registeredAt: Date.now()
    });

    logger.info('Agent version registered', { agentId, version });
  }

  /**
   * Check version compatibility
   */
  async checkCompatibility(agentVersion, requiredVersion) {
    try {
      if (!semver.valid(agentVersion)) {
        logger.error('Invalid agent version', { agentVersion });
        return false;
      }

      if (!semver.valid(requiredVersion)) {
        logger.error('Invalid required version', { requiredVersion });
        return false;
      }

      const compatible = semver.satisfies(agentVersion, `>=${requiredVersion}`);

      logger.debug('Version compatibility check', {
        agentVersion,
        requiredVersion,
        compatible
      });

      return compatible;
    } catch (error) {
      logger.error('Version compatibility check failed', {
        error: error.message,
        agentVersion,
        requiredVersion
      });
      return false;
    }
  }

  /**
   * Get migration path from one version to another
   */
  getMigrationPath(fromVersion, toVersion) {
    try {
      if (!semver.valid(fromVersion) || !semver.valid(toVersion)) {
        throw new Error('Invalid version format');
      }

      const fromMajor = semver.major(fromVersion);
      const toMajor = semver.major(toVersion);
      const fromMinor = semver.minor(fromVersion);
      const toMinor = semver.minor(toVersion);

      const migration = {
        from: fromVersion,
        to: toVersion,
        required: semver.gt(toVersion, fromVersion),
        breaking: toMajor > fromMajor,
        steps: []
      };

      // Major version change (breaking)
      if (toMajor > fromMajor) {
        for (let major = fromMajor + 1; major <= toMajor; major++) {
          migration.steps.push({
            type: 'major',
            version: `${major}.0.0`,
            breaking: true,
            description: `Upgrade to v${major}.x - Breaking changes expected`
          });
        }
      }

      // Minor version changes (features)
      if (toMajor === fromMajor && toMinor > fromMinor) {
        for (let minor = fromMinor + 1; minor <= toMinor; minor++) {
          migration.steps.push({
            type: 'minor',
            version: `${toMajor}.${minor}.0`,
            breaking: false,
            description: `Upgrade to v${toMajor}.${minor} - New features`
          });
        }
      }

      logger.debug('Migration path generated', { migration });
      return migration;
    } catch (error) {
      logger.error('Failed to generate migration path', {
        error: error.message,
        fromVersion,
        toVersion
      });
      throw error;
    }
  }

  /**
   * Compare two versions
   */
  compareVersions(version1, version2) {
    return semver.compare(version1, version2);
  }

  /**
   * Get latest version from a list
   */
  getLatestVersion(versions) {
    const validVersions = versions.filter(v => semver.valid(v));
    if (validVersions.length === 0) return null;
    return semver.sort(validVersions).pop();
  }

  /**
   * Check if version meets capability requirements
   */
  meetsRequirements(agentVersion, requirements) {
    try {
      for (const [capability, requiredVersion] of Object.entries(requirements)) {
        if (!semver.satisfies(agentVersion, requiredVersion)) {
          logger.warn('Agent version does not meet capability requirement', {
            agentVersion,
            capability,
            requiredVersion
          });
          return false;
        }
      }
      return true;
    } catch (error) {
      logger.error('Failed to check version requirements', {
        error: error.message,
        agentVersion,
        requirements
      });
      return false;
    }
  }

  /**
   * Get all registered agent versions
   */
  getAllVersions() {
    return Array.from(this.versionRegistry.entries()).map(([agentId, info]) => ({
      agentId,
      ...info
    }));
  }

  /**
   * Get version statistics
   */
  getStatistics() {
    const versions = this.getAllVersions();
    const versionCounts = {};

    versions.forEach(({ version }) => {
      const major = semver.major(version);
      const key = `v${major}.x`;
      versionCounts[key] = (versionCounts[key] || 0) + 1;
    });

    return {
      total: versions.length,
      versionDistribution: versionCounts,
      latestVersion: this.getLatestVersion(versions.map(v => v.version)),
      minVersion: this.config.minVersion
    };
  }
}

export default AgentVersionManager;
