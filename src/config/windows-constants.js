// src/config/windows-constants.js

/**
 * Windows Development Environment Configuration Constants
 * @module windows-constants
 */

export const WINDOWS_CONFIG = {
  // WinGet Configuration
  WINGET: {
    COMMAND_TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3,
    CACHE_TTL: 300000, // 5 minutes
    CACHE_ENABLED: true,
  },

  // WSL Configuration
  WSL: {
    COMMAND_TIMEOUT: 30000,
    RETRY_ATTEMPTS: 2,
    DEFAULT_DISTRO: null, // Use WSL default
    AUTO_SHUTDOWN: false,
  },

  // PowerShell Configuration
  POWERSHELL: {
    COMMAND_TIMEOUT: 30000,
    EXECUTION_POLICY: 'Bypass',
    FALLBACK_TO_WINDOWS_PS: true,
    PWSH_PATH: 'pwsh',
    SESSION_ENABLED: false,
  },

  // Windows Dev Agent Configuration
  AGENT: {
    BRIDGE_URL: process.env.WINDOWS_DEV_AGENT_URL || 'ws://localhost:65028',
    RECONNECT_INTERVAL: 5000,
    HEARTBEAT_INTERVAL: 30000,
  },

  // Performance Thresholds
  PERFORMANCE: {
    CACHE_HIT_TARGET: 0.75, // 75% cache hit rate
    MAX_COMMAND_TIME: 2000, // 2 seconds
    CACHED_OPERATION_TIME: 500, // 500ms
  },
};

/**
 * Validate Windows environment configuration
 * @returns {Object} Validation result
 */
export function validateWindowsConfig() {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Check if running on Windows
  if (process.platform !== 'win32') {
    result.warnings.push('Not running on Windows platform - Windows features will be limited');
  }

  // Validate environment variables
  if (!process.env.WINGET_ENABLED && process.env.WINGET_ENABLED !== undefined) {
    result.warnings.push('WINGET_ENABLED is set but false');
  }

  if (!process.env.WSL_ENABLED && process.env.WSL_ENABLED !== undefined) {
    result.warnings.push('WSL_ENABLED is set but false');
  }

  return result;
}

export default WINDOWS_CONFIG;
