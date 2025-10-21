/**
 * Type-Safe Environment Configuration System
 * Cycle 5 Optimization: Centralized, validated configuration
 *
 * @module config/env-config
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

/**
 * Environment variable schema with validation and defaults
 */
const envSchema = z.object({
  // AI Bridge Configuration
  AI_BRIDGE_PORT: z.coerce.number().int().positive().default(65028),
  AI_BRIDGE_HTTP_PORT: z.coerce.number().int().positive().default(65029),
  AI_BRIDGE_HOST: z.string().default('localhost'),
  AI_BRIDGE_TIMEOUT: z.coerce.number().positive().default(30000),
  AI_BRIDGE_MAX_CONNECTIONS: z.coerce.number().positive().default(10000),
  AI_BRIDGE_HISTORY_LIMIT: z.coerce.number().positive().default(1000),
  AI_BRIDGE_WS_HEARTBEAT: z.coerce.number().positive().default(30000),

  // Database Configuration
  DATABASE_URL: z.string().optional(),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT: z.coerce.number().positive().default(10000),

  // LLM API Keys
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),

  // Ollama Configuration
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama2'),
  OLLAMA_TIMEOUT: z.coerce.number().positive().default(120000),

  // WebSocket Configuration
  BRIDGE_WS: z.string().url().optional(),
  WS_MAX_PAYLOAD: z.coerce.number().positive().default(10485760), // 10MB
  WS_COMPRESSION: z.boolean().default(true),

  // Performance & Optimization
  ENABLE_CLUSTERING: z.boolean().default(false),
  ENABLE_MEMORY_MONITORING: z.boolean().default(true),
  ENABLE_METRICS: z.boolean().default(true),
  ENABLE_COMPRESSION: z.boolean().default(true),
  ENABLE_CACHING: z.boolean().default(true),
  CACHE_TTL: z.coerce.number().positive().default(300000), // 5 minutes
  CACHE_MAX_SIZE: z.coerce.number().positive().default(1000),

  // Memory Configuration
  MAX_OLD_SPACE_SIZE: z.coerce.number().int().positive().default(4096),
  MEMORY_MONITOR_INTERVAL: z.coerce.number().positive().default(60000),
  MEMORY_THRESHOLD_WARNING: z.coerce.number().min(0).max(1).default(0.8),
  MEMORY_THRESHOLD_CRITICAL: z.coerce.number().min(0).max(1).default(0.9),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  LOG_FILE: z.string().optional(),
  LOG_MAX_SIZE: z.coerce.number().positive().default(10485760), // 10MB
  LOG_MAX_FILES: z.coerce.number().int().positive().default(5),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Security
  RATE_LIMIT_WINDOW: z.coerce.number().positive().default(60000), // 1 minute
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  CORS_ORIGIN: z.string().default('*'),
  ENABLE_HELMET: z.boolean().default(true),

  // Redis Configuration (for distributed locks)
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),

  // Feature Flags
  ENABLE_VIBE_CODING: z.boolean().default(true),
  ENABLE_A2A_PROTOCOL: z.boolean().default(true),
  ENABLE_RAG_PIPELINE: z.boolean().default(false),
  ENABLE_VISUAL_TESTING: z.boolean().default(false),

  // Testing Configuration
  TEST_TIMEOUT: z.coerce.number().positive().default(30000),
  TEST_CONCURRENCY: z.coerce.number().int().positive().default(4)
});

/**
 * Configuration Manager
 * Provides type-safe access to environment variables
 */
class ConfigManager {
  constructor() {
    this._config = null;
    this._errors = [];
    this._loaded = false;
  }

  /**
   * Load and validate configuration
   * @returns {Object} Result object with success status
   */
  load() {
    if (this._loaded) {
      return { success: true, config: this._config };
    }

    try {
      this._config = envSchema.parse(process.env);
      this._loaded = true;
      return { success: true, config: this._config };
    } catch (error) {
      this._errors = error.errors || [{ message: error.message }];
      return { success: false, errors: this._errors };
    }
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    if (!this._loaded) {
      this.validate();
    }
    return this._config[key];
  }

  /**
   * Get all configuration values
   * @returns {Object} All configuration
   */
  getAll() {
    if (!this._loaded) {
      this.validate();
    }
    return { ...this._config };
  }

  /**
   * Check if a configuration key exists
   * @param {string} key - Configuration key
   * @returns {boolean} True if key exists
   */
  has(key) {
    if (!this._loaded) {
      this.validate();
    }
    return key in this._config;
  }

  /**
   * Validate configuration and exit on error
   * @returns {Object} Validated configuration
   */
  validate() {
    const result = this.load();

    if (!result.success) {
      console.error('❌ Configuration Validation Errors:');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      result.errors.forEach(err => {
        const path = err.path?.join('.') || 'unknown';
        console.error(`  • ${path}: ${err.message}`);
      });

      console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('\nPlease check your .env file and try again.\n');
      process.exit(1);
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log('✅ Configuration validated successfully');
    }

    return result.config;
  }

  /**
   * Get configuration summary for debugging
   * @param {boolean} includeSecrets - Whether to include sensitive values
   * @returns {Object} Configuration summary
   */
  getSummary(includeSecrets = false) {
    if (!this._loaded) {
      this.validate();
    }

    const summary = { ...this._config };

    if (!includeSecrets) {
      // Mask sensitive values
      const sensitiveKeys = [
        'ANTHROPIC_API_KEY',
        'GROQ_API_KEY',
        'DEEPSEEK_API_KEY',
        'GITHUB_TOKEN',
        'REDIS_PASSWORD',
        'DATABASE_URL'
      ];

      sensitiveKeys.forEach(key => {
        if (summary[key]) {
          summary[key] = '***REDACTED***';
        }
      });
    }

    return summary;
  }

  /**
   * Check if running in production
   * @returns {boolean} True if production
   */
  isProduction() {
    return this.get('NODE_ENV') === 'production';
  }

  /**
   * Check if running in development
   * @returns {boolean} True if development
   */
  isDevelopment() {
    return this.get('NODE_ENV') === 'development';
  }

  /**
   * Check if running in test
   * @returns {boolean} True if test
   */
  isTest() {
    return this.get('NODE_ENV') === 'test';
  }
}

// Create singleton instance
export const config = new ConfigManager();

// Auto-validate on import (except in tests)
if (process.env.NODE_ENV !== 'test') {
  config.validate();
}

// Export schema for external use
export { envSchema };
