/**
 * Error Detector
 * Monitors, classifies, and tracks errors across the entire system
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  CRITICAL: 'critical', // System-threatening errors
  HIGH: 'high', // Service degradation
  MEDIUM: 'medium', // Recoverable errors
  LOW: 'low', // Minor issues
};

/**
 * Error categories for classification
 */
export const ErrorCategory = {
  NETWORK: 'network',
  DATABASE: 'database',
  AUTHENTICATION: 'authentication',
  RESOURCE: 'resource',
  LOGIC: 'logic',
  EXTERNAL_API: 'external_api',
  WEBSOCKET: 'websocket',
  CIRCUIT_BREAKER: 'circuit_breaker',
};

/**
 * ErrorDetector class
 * Monitors multiple error sources and classifies errors
 */
export class ErrorDetector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      errorStormThreshold: config.errorStormThreshold || 10, // errors per minute
      errorStormWindow: config.errorStormWindow || 60000, // 1 minute
      patternDetectionWindow: config.patternDetectionWindow || 300000, // 5 minutes
      maxErrorHistory: config.maxErrorHistory || 1000,
      dbPath: config.dbPath || path.join(__dirname, '../../data/errors.db'),
      ...config,
    };

    // In-memory error tracking
    this.recentErrors = [];
    this.errorPatterns = new Map();
    this.errorStormActive = false;

    // Database for persistent error history
    this.db = null;

    // Error listeners
    this.listeners = {
      uncaughtException: this._handleUncaughtException.bind(this),
      unhandledRejection: this._handleUnhandledRejection.bind(this),
    };
  }

  /**
   * Initialize error detector
   */
  async initialize() {
    try {
      // Initialize database
      await this._initializeDatabase();

      // Set up global error listeners
      this._setupGlobalListeners();

      // Start periodic cleanup
      this._startCleanupInterval();

      logger.info('ErrorDetector initialized', {
        dbPath: this.config.dbPath,
        errorStormThreshold: this.config.errorStormThreshold,
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize ErrorDetector', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize SQLite database for error storage
   */
  async _initializeDatabase() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.config.dbPath);
      const fs = await import('fs/promises');
      await fs.mkdir(dataDir, { recursive: true });

      this.db = new Database(this.config.dbPath);

      // Create errors table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS errors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          severity TEXT NOT NULL,
          category TEXT NOT NULL,
          message TEXT NOT NULL,
          stack TEXT,
          context TEXT,
          resolved INTEGER DEFAULT 0,
          resolution_strategy TEXT,
          resolution_timestamp INTEGER,
          UNIQUE(timestamp, message, category)
        );

        CREATE INDEX IF NOT EXISTS idx_timestamp ON errors(timestamp);
        CREATE INDEX IF NOT EXISTS idx_severity ON errors(severity);
        CREATE INDEX IF NOT EXISTS idx_category ON errors(category);
        CREATE INDEX IF NOT EXISTS idx_resolved ON errors(resolved);
      `);

      logger.info('Error database initialized', { dbPath: this.config.dbPath });
    } catch (error) {
      logger.error('Failed to initialize error database', { error: error.message });
      throw error;
    }
  }

  /**
   * Set up global error listeners
   */
  _setupGlobalListeners() {
    // Uncaught exceptions
    process.on('uncaughtException', this.listeners.uncaughtException);

    // Unhandled promise rejections
    process.on('unhandledRejection', this.listeners.unhandledRejection);

    logger.info('Global error listeners registered');
  }

  /**
   * Handle uncaught exception
   */
  _handleUncaughtException(error) {
    const classifiedError = this.classifyError(error, {
      source: 'uncaughtException',
    });

    this.recordError(classifiedError);

    logger.error('Uncaught exception detected', {
      severity: classifiedError.severity,
      category: classifiedError.category,
      message: error.message,
    });
  }

  /**
   * Handle unhandled promise rejection
   */
  _handleUnhandledRejection(reason, promise) {
    const error = reason instanceof Error ? reason : new Error(String(reason));

    const classifiedError = this.classifyError(error, {
      source: 'unhandledRejection',
      promise: String(promise),
    });

    this.recordError(classifiedError);

    logger.error('Unhandled promise rejection detected', {
      severity: classifiedError.severity,
      category: classifiedError.category,
      message: error.message,
    });
  }

  /**
   * Classify error by severity and category
   * @param {Error} error - The error to classify
   * @param {Object} context - Additional context
   * @returns {Object} Classified error
   */
  classifyError(error, context = {}) {
    const message = error.message || String(error);
    const stack = error.stack || '';

    // Determine category
    let category = ErrorCategory.LOGIC;
    if (message.match(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up/i)) {
      category = ErrorCategory.NETWORK;
    } else if (message.match(/database|sqlite|sql|query/i)) {
      category = ErrorCategory.DATABASE;
    } else if (message.match(/auth|unauthorized|forbidden|token/i)) {
      category = ErrorCategory.AUTHENTICATION;
    } else if (message.match(/ENOMEM|out of memory|heap|allocation failed/i)) {
      category = ErrorCategory.RESOURCE;
    } else if (message.match(/websocket|ws|connection closed/i)) {
      category = ErrorCategory.WEBSOCKET;
    } else if (message.match(/circuit breaker|breaker open/i)) {
      category = ErrorCategory.CIRCUIT_BREAKER;
    } else if (message.match(/api|fetch|request failed/i)) {
      category = ErrorCategory.EXTERNAL_API;
    }

    // Determine severity
    let severity = ErrorSeverity.MEDIUM;
    if (category === ErrorCategory.RESOURCE || message.match(/fatal|critical/i)) {
      severity = ErrorSeverity.CRITICAL;
    } else if (category === ErrorCategory.DATABASE || category === ErrorCategory.AUTHENTICATION) {
      severity = ErrorSeverity.HIGH;
    } else if (category === ErrorCategory.NETWORK || category === ErrorCategory.WEBSOCKET) {
      severity = ErrorSeverity.MEDIUM;
    } else {
      severity = ErrorSeverity.LOW;
    }

    return {
      timestamp: Date.now(),
      severity,
      category,
      message,
      stack,
      context,
      original: error,
    };
  }

  /**
   * Record error to database and memory
   * @param {Object} classifiedError - The classified error
   */
  recordError(classifiedError) {
    try {
      // Store in database
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO errors (timestamp, severity, category, message, stack, context)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        classifiedError.timestamp,
        classifiedError.severity,
        classifiedError.category,
        classifiedError.message,
        classifiedError.stack,
        JSON.stringify(classifiedError.context)
      );

      // Add to in-memory tracking
      this.recentErrors.push(classifiedError);

      // Trim to max history
      if (this.recentErrors.length > this.config.maxErrorHistory) {
        this.recentErrors.shift();
      }

      // Detect patterns
      this._detectPatterns();

      // Check for error storm
      this._checkErrorStorm();

      // Emit error event
      this.emit('error-detected', classifiedError);

      logger.debug('Error recorded', {
        severity: classifiedError.severity,
        category: classifiedError.category,
      });
    } catch (error) {
      logger.error('Failed to record error', { error: error.message });
    }
  }

  /**
   * Detect error patterns
   */
  _detectPatterns() {
    const now = Date.now();
    const windowStart = now - this.config.patternDetectionWindow;

    // Filter recent errors within window
    const windowErrors = this.recentErrors.filter((e) => e.timestamp >= windowStart);

    // Group by category + message prefix (first 50 chars)
    const patterns = new Map();
    for (const error of windowErrors) {
      const key = `${error.category}:${error.message.substring(0, 50)}`;
      if (!patterns.has(key)) {
        patterns.set(key, []);
      }
      patterns.get(key).push(error);
    }

    // Detect patterns with 3+ occurrences
    for (const [key, errors] of patterns.entries()) {
      if (errors.length >= 3) {
        if (!this.errorPatterns.has(key) || this.errorPatterns.get(key).count !== errors.length) {
          this.errorPatterns.set(key, {
            pattern: key,
            count: errors.length,
            firstSeen: errors[0].timestamp,
            lastSeen: errors[errors.length - 1].timestamp,
            severity: errors[0].severity,
            category: errors[0].category,
            sample: errors[0],
          });

          this.emit('pattern-detected', this.errorPatterns.get(key));

          logger.warn('Error pattern detected', {
            pattern: key,
            count: errors.length,
            category: errors[0].category,
          });
        }
      }
    }

    // Clean up old patterns
    for (const [key, pattern] of this.errorPatterns.entries()) {
      if (pattern.lastSeen < windowStart) {
        this.errorPatterns.delete(key);
      }
    }
  }

  /**
   * Check for error storm (high error rate)
   */
  _checkErrorStorm() {
    const now = Date.now();
    const windowStart = now - this.config.errorStormWindow;

    const recentErrorCount = this.recentErrors.filter((e) => e.timestamp >= windowStart).length;

    const wasInStorm = this.errorStormActive;
    this.errorStormActive = recentErrorCount >= this.config.errorStormThreshold;

    // Emit event on state change
    if (this.errorStormActive && !wasInStorm) {
      this.emit('error-storm-start', {
        errorCount: recentErrorCount,
        threshold: this.config.errorStormThreshold,
        window: this.config.errorStormWindow,
      });

      logger.error('Error storm detected', {
        errorCount: recentErrorCount,
        threshold: this.config.errorStormThreshold,
      });
    } else if (!this.errorStormActive && wasInStorm) {
      this.emit('error-storm-end', {
        errorCount: recentErrorCount,
      });

      logger.info('Error storm ended', {
        errorCount: recentErrorCount,
      });
    }
  }

  /**
   * Mark error as resolved
   * @param {number} errorId - Database error ID
   * @param {string} strategy - Resolution strategy used
   */
  async markResolved(errorId, strategy) {
    try {
      const stmt = this.db.prepare(`
        UPDATE errors
        SET resolved = 1,
            resolution_strategy = ?,
            resolution_timestamp = ?
        WHERE id = ?
      `);

      stmt.run(strategy, Date.now(), errorId);

      this.emit('error-resolved', { errorId, strategy });

      logger.info('Error marked as resolved', { errorId, strategy });
    } catch (error) {
      logger.error('Failed to mark error as resolved', { error: error.message });
    }
  }

  /**
   * Get error statistics
   * @param {Object} options - Query options
   * @returns {Object} Statistics
   */
  getStatistics(options = {}) {
    const timeWindow = options.timeWindow || 3600000; // 1 hour default
    const windowStart = Date.now() - timeWindow;

    try {
      const stats = this.db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low,
          SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved
        FROM errors
        WHERE timestamp >= ?
      `
        )
        .get(windowStart);

      const byCategoryStats = this.db
        .prepare(
          `
        SELECT category, COUNT(*) as count
        FROM errors
        WHERE timestamp >= ?
        GROUP BY category
        ORDER BY count DESC
      `
        )
        .all(windowStart);

      return {
        timeWindow,
        windowStart,
        total: stats.total,
        bySeverity: {
          critical: stats.critical,
          high: stats.high,
          medium: stats.medium,
          low: stats.low,
        },
        byResolution: {
          resolved: stats.resolved,
          unresolved: stats.unresolved,
        },
        byCategory: byCategoryStats.reduce((acc, row) => {
          acc[row.category] = row.count;
          return acc;
        }, {}),
        patterns: Array.from(this.errorPatterns.values()),
        errorStormActive: this.errorStormActive,
      };
    } catch (error) {
      logger.error('Failed to get error statistics', { error: error.message });
      return null;
    }
  }

  /**
   * Start periodic cleanup of old errors
   */
  _startCleanupInterval() {
    // Clean up errors older than 7 days every hour
    this.cleanupInterval = setInterval(() => {
      this._cleanupOldErrors();
    }, 3600000); // 1 hour
  }

  /**
   * Clean up old errors from database
   */
  _cleanupOldErrors() {
    const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoffTimestamp = Date.now() - retentionPeriod;

    try {
      const result = this.db
        .prepare(
          `
        DELETE FROM errors
        WHERE timestamp < ? AND resolved = 1
      `
        )
        .run(cutoffTimestamp);

      logger.info('Old errors cleaned up', { deletedCount: result.changes });
    } catch (error) {
      logger.error('Failed to cleanup old errors', { error: error.message });
    }
  }

  /**
   * Stop error detector and cleanup
   */
  async stop() {
    try {
      // Remove global listeners
      process.off('uncaughtException', this.listeners.uncaughtException);
      process.off('unhandledRejection', this.listeners.unhandledRejection);

      // Stop cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Close database
      if (this.db) {
        this.db.close();
      }

      logger.info('ErrorDetector stopped');
    } catch (error) {
      logger.error('Error stopping ErrorDetector', { error: error.message });
    }
  }
}

export default ErrorDetector;
