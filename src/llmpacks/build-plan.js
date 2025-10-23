/**
 * Build plan generator
 * Creates multi-phase build plans for Docker image construction
 *
 * @module llmpacks/build-plan
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

// Import provider implementations
import { NodeJSProvider } from './providers/nodejs.js';
import { ElectronProvider } from './providers/electron.js';
import { PythonProvider } from './providers/python.js';
import { GoProvider } from './providers/go.js';
import { StaticProvider } from './providers/static.js';

/**
 * Provider registry mapping provider IDs to implementations
 */
const PROVIDER_REGISTRY = {
  nodejs: NodeJSProvider,
  electron: ElectronProvider,
  python: PythonProvider,
  go: GoProvider,
  static: StaticProvider
};

/**
 * Generate cache key from build plan configuration
 * @param {Object} config - Build configuration
 * @returns {string} Cache key hash
 */
function generateCacheKey(config) {
  const hashInput = JSON.stringify({
    provider: config.detected.provider.id,
    version: config.detected.version,
    packageManager: config.detected.packageManager,
    configVars: config.config.variables || {}
  });

  return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 12);
}

/**
 * Merge user configuration with provider defaults
 * @param {Object} providerPlan - Provider-generated plan
 * @param {Object} userConfig - User configuration from llmpacks.toml
 * @returns {Object} Merged build plan
 */
function mergeConfiguration(providerPlan, userConfig) {
  const merged = { ...providerPlan };

  // Override provider settings if user specified
  if (userConfig.providers?.length > 0) {
    const userProvider = userConfig.providers.find(p => p.name === providerPlan.provider);
    if (userProvider) {
      logger.debug('Merging user provider config', { provider: providerPlan.provider });
      merged.version = userProvider.version || merged.version;
    }
  }

  // Merge environment variables
  if (userConfig.variables) {
    merged.phases = merged.phases.map(phase => ({
      ...phase,
      environment: {
        ...phase.environment,
        ...userConfig.variables
      }
    }));
  }

  // Override phases if user specified
  if (userConfig.phases) {
    for (const [phaseName, userPhase] of Object.entries(userConfig.phases)) {
      const phaseIndex = merged.phases.findIndex(p => p.name === phaseName);
      if (phaseIndex >= 0) {
        logger.debug('Overriding phase with user config', { phase: phaseName });

        if (userPhase.commands) {
          merged.phases[phaseIndex].commands = userPhase.commands;
        }
        if (userPhase.environment) {
          merged.phases[phaseIndex].environment = {
            ...merged.phases[phaseIndex].environment,
            ...userPhase.environment
          };
        }
        if (userPhase.cacheDirectories) {
          merged.phases[phaseIndex].cacheDirectories = userPhase.cacheDirectories;
        }
      }
    }
  }

  // Override start command if user specified
  if (userConfig.start) {
    const startPhase = merged.phases.find(p => p.name === 'start');
    if (startPhase) {
      startPhase.command = userConfig.start.command || startPhase.command;
      startPhase.port = userConfig.start.port || startPhase.port;
    }
  }

  return merged;
}

/**
 * Validate build plan structure
 * @param {Object} plan - Build plan to validate
 * @throws {Error} If plan is invalid
 */
function validateBuildPlan(plan) {
  if (!plan.provider) {
    throw new Error('Build plan missing provider');
  }

  if (!plan.phases || !Array.isArray(plan.phases)) {
    throw new Error('Build plan missing phases array');
  }

  if (plan.phases.length === 0) {
    throw new Error('Build plan has no phases');
  }

  for (const phase of plan.phases) {
    if (!phase.name) {
      throw new Error('Phase missing name');
    }

    if (phase.name !== 'start' && (!phase.commands || phase.commands.length === 0)) {
      throw new Error(`Phase "${phase.name}" has no commands`);
    }

    if (phase.name === 'start' && !phase.command) {
      throw new Error('Start phase missing command');
    }
  }

  logger.debug('Build plan validated successfully');
}

/**
 * Generate build plan from detected project and configuration
 * @param {Object} options - Generation options
 * @param {string} options.projectPath - Path to project directory
 * @param {Object} options.detected - Detection result from detector
 * @param {Object} options.config - User configuration from llmpacks.toml
 * @returns {Promise<Object>} Build plan with phases, environment, cache keys
 */
export async function generateBuildPlan(options) {
  const { projectPath, detected, config } = options;

  logger.debug('Generating build plan', {
    provider: detected.provider.id,
    version: detected.version
  });

  // Get provider implementation
  const ProviderClass = PROVIDER_REGISTRY[detected.provider.id];

  if (!ProviderClass) {
    throw new Error(`No provider found for "${detected.provider.id}"`);
  }

  // Instantiate provider
  const provider = new ProviderClass({
    projectPath,
    detected,
    config
  });

  // Generate provider-specific build plan
  let providerPlan;
  try {
    providerPlan = await provider.generatePlan();
  } catch (error) {
    logger.error('Provider plan generation failed', {
      provider: detected.provider.id,
      error: error.message
    });
    throw new Error(`Failed to generate ${detected.provider.id} plan: ${error.message}`);
  }

  // Merge with user configuration
  const mergedPlan = mergeConfiguration(providerPlan, config);

  // Add metadata
  const buildPlan = {
    ...mergedPlan,
    cacheKey: generateCacheKey({ detected, config }),
    generatedAt: new Date().toISOString(),
    llmpacksVersion: '1.0.0'
  };

  // Validate final plan
  validateBuildPlan(buildPlan);

  logger.debug('Build plan generated', {
    provider: buildPlan.provider,
    phases: buildPlan.phases.length,
    cacheKey: buildPlan.cacheKey
  });

  return buildPlan;
}

/**
 * Get provider instance for a detected project
 * @param {string} providerId - Provider ID (nodejs, electron, etc.)
 * @param {Object} options - Provider options
 * @returns {Object} Provider instance
 */
export function getProvider(providerId, options) {
  const ProviderClass = PROVIDER_REGISTRY[providerId];

  if (!ProviderClass) {
    throw new Error(`No provider found for "${providerId}"`);
  }

  return new ProviderClass(options);
}

/**
 * List all available providers
 * @returns {Array<string>} Provider IDs
 */
export function listProviders() {
  return Object.keys(PROVIDER_REGISTRY);
}

export default generateBuildPlan;
