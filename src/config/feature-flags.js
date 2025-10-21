// src/config/feature-flags.js
// Feature flag system for gradual ORM rollout

import { logger } from '../utils/logger.js';

/**
 * Feature flags for ORM migration
 * Control which modules use ORM vs raw SQL
 */
export const FEATURE_FLAGS = {
  // Master ORM switch
  USE_ORM: process.env.ENABLE_ORM === 'true' || false,

  // Per-module flags
  ORM_MODULE_SELECTION_STORE: process.env.ORM_SELECTION_STORE === 'true' || false,
  ORM_MODULE_SESSION_MANAGER: process.env.ORM_SESSION_MANAGER === 'true' || false,
  ORM_MODULE_LOCK_MANAGER: process.env.ORM_LOCK_MANAGER === 'true' || false,

  // Rollout percentage (0-100)
  ORM_ROLLOUT_PERCENTAGE: parseInt(process.env.ORM_ROLLOUT_PERCENTAGE || '0', 10),

  // Debug mode (logs which implementation is used)
  ORM_DEBUG: process.env.ORM_DEBUG === 'true' || false
};

/**
 * Check if ORM should be used for a specific module
 * @param {string} module - Module name (e.g., 'SELECTION_STORE')
 * @returns {boolean} True if ORM should be used
 */
export function shouldUseORM(module) {
  // Master switch off
  if (!FEATURE_FLAGS.USE_ORM) {
    return false;
  }

  // Check module-specific flag
  const flagKey = `ORM_MODULE_${module}`;
  if (FEATURE_FLAGS[flagKey] !== undefined) {
    return FEATURE_FLAGS[flagKey];
  }

  // Percentage-based rollout
  if (FEATURE_FLAGS.ORM_ROLLOUT_PERCENTAGE > 0) {
    const randomValue = Math.random() * 100;
    return randomValue < FEATURE_FLAGS.ORM_ROLLOUT_PERCENTAGE;
  }

  return false;
}

/**
 * Log which implementation is being used
 * @param {string} module - Module name
 * @param {boolean} usingORM - Whether ORM is being used
 */
export function logImplementation(module, usingORM) {
  if (FEATURE_FLAGS.ORM_DEBUG) {
    logger.debug(`Module: ${module}`, {
      implementation: usingORM ? 'Prisma ORM' : 'Raw SQL',
      masterSwitch: FEATURE_FLAGS.USE_ORM,
      moduleFlag: FEATURE_FLAGS[`ORM_MODULE_${module}`],
      rolloutPercentage: FEATURE_FLAGS.ORM_ROLLOUT_PERCENTAGE
    });
  }
}

/**
 * Get feature flag status summary
 * @returns {Object} Summary of all feature flags
 */
export function getFeatureFlagStatus() {
  return {
    masterSwitch: FEATURE_FLAGS.USE_ORM,
    modules: {
      selectionStore: FEATURE_FLAGS.ORM_MODULE_SELECTION_STORE,
      sessionManager: FEATURE_FLAGS.ORM_MODULE_SESSION_MANAGER,
      lockManager: FEATURE_FLAGS.ORM_MODULE_LOCK_MANAGER
    },
    rolloutPercentage: FEATURE_FLAGS.ORM_ROLLOUT_PERCENTAGE,
    debug: FEATURE_FLAGS.ORM_DEBUG
  };
}

// Log feature flag status on startup
if (FEATURE_FLAGS.ORM_DEBUG || FEATURE_FLAGS.USE_ORM) {
  logger.info('ORM Feature Flags', getFeatureFlagStatus());
}

export default FEATURE_FLAGS;
