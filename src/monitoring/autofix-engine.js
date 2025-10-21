/**
 * Autofix Engine
 * Automatically applies healing strategies to resolve detected errors
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { ErrorCategory, ErrorSeverity } from './error-detector.js';

/**
 * Healing strategy result codes
 */
export const StrategyResult = {
  SUCCESS: 'success',
  FAILED: 'failed',
  PARTIAL: 'partial',
  SKIPPED: 'skipped',
};

/**
 * Base healing strategy class
 */
class HealingStrategy {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.successCount = 0;
    this.failureCount = 0;
    this.totalAttempts = 0;
  }

  /**
   * Check if this strategy can handle the error
   * @param {Object} error - Classified error
   * @returns {boolean}
   */
  canHandle(error) {
    throw new Error('canHandle() must be implemented by subclass');
  }

  /**
   * Execute the healing strategy
   * @param {Object} error - Classified error
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result with status and details
   */
  async execute(error, context) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Verify the fix was successful
   * @param {Object} error - Original error
   * @param {Object} result - Execution result
   * @returns {Promise<boolean>}
   */
  async verify(error, result) {
    return result.status === StrategyResult.SUCCESS;
  }

  /**
   * Get strategy success rate
   * @returns {number} Success rate (0-1)
   */
  getSuccessRate() {
    if (this.totalAttempts === 0) return 0;
    return this.successCount / this.totalAttempts;
  }

  /**
   * Record execution result
   * @param {string} status - Result status
   */
  recordResult(status) {
    this.totalAttempts++;
    if (status === StrategyResult.SUCCESS) {
      this.successCount++;
    } else {
      this.failureCount++;
    }
  }
}

/**
 * Network error retry strategy
 */
class NetworkRetryStrategy extends HealingStrategy {
  constructor(config) {
    super('NetworkRetry', {
      maxRetries: 3,
      baseDelay: 1000,
      ...config,
    });
  }

  canHandle(error) {
    return error.category === ErrorCategory.NETWORK;
  }

  async execute(error, context) {
    logger.info('Applying NetworkRetry strategy', {
      error: error.message,
      maxRetries: this.config.maxRetries,
    });

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        // Exponential backoff delay
        const delay = this.config.baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Attempt to reconnect if context has connection info
        if (context.reconnect && typeof context.reconnect === 'function') {
          await context.reconnect();
          this.recordResult(StrategyResult.SUCCESS);
          return {
            status: StrategyResult.SUCCESS,
            details: `Reconnection successful after ${attempt + 1} attempts`,
            attempt: attempt + 1,
          };
        }

        this.recordResult(StrategyResult.SUCCESS);
        return {
          status: StrategyResult.SUCCESS,
          details: `Retry successful after ${attempt + 1} attempts`,
          attempt: attempt + 1,
        };
      } catch (retryError) {
        logger.warn('Retry attempt failed', {
          attempt: attempt + 1,
          error: retryError.message,
        });

        if (attempt === this.config.maxRetries - 1) {
          this.recordResult(StrategyResult.FAILED);
          return {
            status: StrategyResult.FAILED,
            details: 'All retry attempts exhausted',
            attempts: this.config.maxRetries,
          };
        }
      }
    }
  }
}

/**
 * Circuit breaker reset strategy
 */
class CircuitBreakerResetStrategy extends HealingStrategy {
  constructor(config) {
    super('CircuitBreakerReset', {
      healthCheckTimeout: 5000,
      forcedResetDelay: 30000,
      ...config,
    });
  }

  canHandle(error) {
    return error.category === ErrorCategory.CIRCUIT_BREAKER;
  }

  async execute(error, context) {
    logger.info('Applying CircuitBreakerReset strategy', {
      error: error.message,
    });

    try {
      // Wait for forced reset delay
      await new Promise((resolve) => setTimeout(resolve, this.config.forcedResetDelay));

      // Perform health check if context provides it
      if (context.healthCheck && typeof context.healthCheck === 'function') {
        const healthResult = await Promise.race([
          context.healthCheck(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Health check timeout')),
              this.config.healthCheckTimeout
            )
          ),
        ]);

        if (healthResult && healthResult.status === 'healthy') {
          // Force reset circuit breaker
          if (context.resetCircuitBreaker && typeof context.resetCircuitBreaker === 'function') {
            await context.resetCircuitBreaker();
          }

          this.recordResult(StrategyResult.SUCCESS);
          return {
            status: StrategyResult.SUCCESS,
            details: 'Circuit breaker reset after successful health check',
          };
        }
      }

      this.recordResult(StrategyResult.PARTIAL);
      return {
        status: StrategyResult.PARTIAL,
        details: 'Forced reset applied, health check unavailable',
      };
    } catch (error) {
      this.recordResult(StrategyResult.FAILED);
      return {
        status: StrategyResult.FAILED,
        details: `Reset failed: ${error.message}`,
      };
    }
  }
}

/**
 * WebSocket reconnection strategy
 */
class WebSocketReconnectStrategy extends HealingStrategy {
  constructor(config) {
    super('WebSocketReconnect', {
      maxAttempts: 5,
      baseDelay: 2000,
      ...config,
    });
  }

  canHandle(error) {
    return error.category === ErrorCategory.WEBSOCKET;
  }

  async execute(error, context) {
    logger.info('Applying WebSocketReconnect strategy', {
      error: error.message,
      maxAttempts: this.config.maxAttempts,
    });

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      try {
        const delay = this.config.baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Attempt reconnection via context
        if (context.wsClient && typeof context.wsClient.connect === 'function') {
          await context.wsClient.connect();

          // Restore session state if available
          if (context.restoreSession && typeof context.restoreSession === 'function') {
            await context.restoreSession();
          }

          this.recordResult(StrategyResult.SUCCESS);
          return {
            status: StrategyResult.SUCCESS,
            details: `WebSocket reconnected after ${attempt + 1} attempts`,
            attempt: attempt + 1,
          };
        }
      } catch (reconnectError) {
        logger.warn('WebSocket reconnection failed', {
          attempt: attempt + 1,
          error: reconnectError.message,
        });
      }
    }

    this.recordResult(StrategyResult.FAILED);
    return {
      status: StrategyResult.FAILED,
      details: 'All reconnection attempts failed',
    };
  }
}

/**
 * Memory cleanup strategy
 */
class MemoryCleanupStrategy extends HealingStrategy {
  constructor(config) {
    super('MemoryCleanup', config);
  }

  canHandle(error) {
    return (
      error.category === ErrorCategory.RESOURCE && error.message.match(/memory|heap|allocation/i)
    );
  }

  async execute(error, context) {
    logger.info('Applying MemoryCleanup strategy', {
      error: error.message,
    });

    try {
      const beforeMemory = process.memoryUsage();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Clear caches if context provides them
      if (context.clearCaches && typeof context.clearCaches === 'function') {
        await context.clearCaches();
      }

      // Drain connection pools
      if (context.drainPools && typeof context.drainPools === 'function') {
        await context.drainPools();
      }

      const afterMemory = process.memoryUsage();
      const freedMemory = beforeMemory.heapUsed - afterMemory.heapUsed;

      this.recordResult(StrategyResult.SUCCESS);
      return {
        status: StrategyResult.SUCCESS,
        details: `Freed ${Math.round(freedMemory / 1024 / 1024)}MB of memory`,
        beforeMemory,
        afterMemory,
      };
    } catch (error) {
      this.recordResult(StrategyResult.FAILED);
      return {
        status: StrategyResult.FAILED,
        details: `Memory cleanup failed: ${error.message}`,
      };
    }
  }
}

/**
 * Database retry strategy
 */
class DatabaseRetryStrategy extends HealingStrategy {
  constructor(config) {
    super('DatabaseRetry', {
      maxRetries: 3,
      baseDelay: 1000,
      timeoutAdjustment: 1.5,
      ...config,
    });
  }

  canHandle(error) {
    return error.category === ErrorCategory.DATABASE;
  }

  async execute(error, context) {
    logger.info('Applying DatabaseRetry strategy', {
      error: error.message,
    });

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const delay = this.config.baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Adjust query timeout if available
        if (context.adjustTimeout && typeof context.adjustTimeout === 'function') {
          const newTimeout = Math.round(context.currentTimeout * this.config.timeoutAdjustment);
          await context.adjustTimeout(newTimeout);
        }

        // Retry connection if available
        if (context.retryConnection && typeof context.retryConnection === 'function') {
          await context.retryConnection();

          this.recordResult(StrategyResult.SUCCESS);
          return {
            status: StrategyResult.SUCCESS,
            details: `Database retry successful after ${attempt + 1} attempts`,
            attempt: attempt + 1,
          };
        }
      } catch (retryError) {
        logger.warn('Database retry failed', {
          attempt: attempt + 1,
          error: retryError.message,
        });
      }
    }

    this.recordResult(StrategyResult.FAILED);
    return {
      status: StrategyResult.FAILED,
      details: 'All database retry attempts failed',
    };
  }
}

/**
 * Connection pool refresh strategy
 */
class ConnectionPoolRefreshStrategy extends HealingStrategy {
  constructor(config) {
    super('ConnectionPoolRefresh', config);
  }

  canHandle(error) {
    return (
      (error.category === ErrorCategory.NETWORK || error.category === ErrorCategory.DATABASE) &&
      error.message.match(/pool|connection limit|too many connections/i)
    );
  }

  async execute(error, context) {
    logger.info('Applying ConnectionPoolRefresh strategy', {
      error: error.message,
    });

    try {
      // Drain existing connections
      if (context.pool && typeof context.pool.drain === 'function') {
        await context.pool.drain();
      }

      // Clear pool
      if (context.pool && typeof context.pool.clear === 'function') {
        await context.pool.clear();
      }

      // Reinitialize pool with new connections
      if (context.pool && typeof context.pool.init === 'function') {
        await context.pool.init();
      }

      this.recordResult(StrategyResult.SUCCESS);
      return {
        status: StrategyResult.SUCCESS,
        details: 'Connection pool refreshed successfully',
      };
    } catch (error) {
      this.recordResult(StrategyResult.FAILED);
      return {
        status: StrategyResult.FAILED,
        details: `Pool refresh failed: ${error.message}`,
      };
    }
  }
}

/**
 * AutofixEngine class
 * Manages and executes healing strategies
 */
export class AutofixEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      enabled: config.enabled !== false,
      maxConcurrentFixes: config.maxConcurrentFixes || 3,
      minSuccessRate: config.minSuccessRate || 0.3, // 30% minimum success rate
      ...config,
    };

    // Initialize strategies
    this.strategies = [
      new NetworkRetryStrategy(),
      new CircuitBreakerResetStrategy(),
      new WebSocketReconnectStrategy(),
      new MemoryCleanupStrategy(),
      new DatabaseRetryStrategy(),
      new ConnectionPoolRefreshStrategy(),
    ];

    // Active fixes tracking
    this.activeFixes = new Map();
    this.fixHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Initialize autofix engine
   */
  async initialize() {
    logger.info('AutofixEngine initialized', {
      enabled: this.config.enabled,
      strategies: this.strategies.length,
      maxConcurrentFixes: this.config.maxConcurrentFixes,
    });

    this.emit('initialized');
  }

  /**
   * Attempt to fix an error
   * @param {Object} error - Classified error from ErrorDetector
   * @param {Object} context - Execution context with utility functions
   * @returns {Promise<Object>} Fix result
   */
  async attemptFix(error, context = {}) {
    if (!this.config.enabled) {
      return {
        status: StrategyResult.SKIPPED,
        details: 'Autofix engine is disabled',
      };
    }

    // Check concurrent fix limit
    if (this.activeFixes.size >= this.config.maxConcurrentFixes) {
      return {
        status: StrategyResult.SKIPPED,
        details: 'Maximum concurrent fixes reached',
      };
    }

    const fixId = `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeFixes.set(fixId, {
      error,
      startTime: Date.now(),
    });

    try {
      // Find applicable strategies
      const applicableStrategies = this.strategies.filter(
        (strategy) =>
          strategy.canHandle(error) && strategy.getSuccessRate() >= this.config.minSuccessRate
      );

      if (applicableStrategies.length === 0) {
        return {
          status: StrategyResult.SKIPPED,
          details: 'No applicable strategies found',
        };
      }

      // Sort by success rate (highest first)
      applicableStrategies.sort((a, b) => b.getSuccessRate() - a.getSuccessRate());

      // Try strategies in order until one succeeds
      for (const strategy of applicableStrategies) {
        logger.info('Attempting autofix', {
          fixId,
          strategy: strategy.name,
          error: error.message,
          successRate: strategy.getSuccessRate(),
        });

        this.emit('fix-attempt', {
          fixId,
          strategy: strategy.name,
          error,
        });

        try {
          const result = await strategy.execute(error, context);

          // Verify the fix
          const verified = await strategy.verify(error, result);

          if (verified && result.status === StrategyResult.SUCCESS) {
            const fixRecord = {
              fixId,
              error,
              strategy: strategy.name,
              result,
              verified: true,
              duration: Date.now() - this.activeFixes.get(fixId).startTime,
              timestamp: Date.now(),
            };

            this._recordFix(fixRecord);

            this.emit('fix-success', fixRecord);

            logger.info('Autofix successful', {
              fixId,
              strategy: strategy.name,
              duration: fixRecord.duration,
            });

            return result;
          } else if (result.status === StrategyResult.PARTIAL) {
            logger.warn('Partial fix applied', {
              fixId,
              strategy: strategy.name,
              details: result.details,
            });
            // Continue to next strategy
          }
        } catch (strategyError) {
          logger.error('Strategy execution failed', {
            fixId,
            strategy: strategy.name,
            error: strategyError.message,
          });
          // Continue to next strategy
        }
      }

      // All strategies failed
      const failureRecord = {
        fixId,
        error,
        result: {
          status: StrategyResult.FAILED,
          details: 'All applicable strategies failed',
        },
        duration: Date.now() - this.activeFixes.get(fixId).startTime,
        timestamp: Date.now(),
      };

      this._recordFix(failureRecord);

      this.emit('fix-failure', failureRecord);

      return failureRecord.result;
    } finally {
      this.activeFixes.delete(fixId);
    }
  }

  /**
   * Record fix in history
   * @param {Object} fixRecord - Fix execution record
   */
  _recordFix(fixRecord) {
    this.fixHistory.push(fixRecord);

    // Trim history
    if (this.fixHistory.length > this.maxHistorySize) {
      this.fixHistory.shift();
    }
  }

  /**
   * Get autofix statistics
   * @param {Object} options - Query options
   * @returns {Object} Statistics
   */
  getStatistics(options = {}) {
    const timeWindow = options.timeWindow || 3600000; // 1 hour default
    const windowStart = Date.now() - timeWindow;

    const windowFixes = this.fixHistory.filter((fix) => fix.timestamp >= windowStart);

    const successfulFixes = windowFixes.filter(
      (fix) => fix.result.status === StrategyResult.SUCCESS && fix.verified
    );

    const failedFixes = windowFixes.filter((fix) => fix.result.status === StrategyResult.FAILED);

    const strategyStats = {};
    for (const strategy of this.strategies) {
      strategyStats[strategy.name] = {
        successRate: strategy.getSuccessRate(),
        totalAttempts: strategy.totalAttempts,
        successCount: strategy.successCount,
        failureCount: strategy.failureCount,
      };
    }

    return {
      timeWindow,
      totalFixes: windowFixes.length,
      successful: successfulFixes.length,
      failed: failedFixes.length,
      successRate: windowFixes.length > 0 ? successfulFixes.length / windowFixes.length : 0,
      averageFixDuration:
        windowFixes.length > 0
          ? windowFixes.reduce((sum, fix) => sum + fix.duration, 0) / windowFixes.length
          : 0,
      activeFixes: this.activeFixes.size,
      strategyStats,
    };
  }

  /**
   * Enable autofix engine
   */
  enable() {
    this.config.enabled = true;
    this.emit('enabled');
    logger.info('AutofixEngine enabled');
  }

  /**
   * Disable autofix engine
   */
  disable() {
    this.config.enabled = false;
    this.emit('disabled');
    logger.info('AutofixEngine disabled');
  }

  /**
   * Stop autofix engine
   */
  async stop() {
    this.disable();
    logger.info('AutofixEngine stopped');
  }
}

export default AutofixEngine;
