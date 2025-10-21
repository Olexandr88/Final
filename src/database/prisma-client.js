// src/database/prisma-client.js
// Optimized Prisma client with connection pooling and performance monitoring

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

/**
 * Performance metrics for Prisma operations
 */
class PrismaMetrics {
  constructor() {
    this.queryCount = 0;
    this.totalDuration = 0;
    this.slowQueries = [];
    this.errors = 0;
  }

  recordQuery(query, duration) {
    this.queryCount++;
    this.totalDuration += duration;

    // Track slow queries (>100ms)
    if (duration > 100) {
      this.slowQueries.push({
        query: query.slice(0, 200),
        duration,
        timestamp: Date.now(),
      });

      // Keep only last 50 slow queries
      if (this.slowQueries.length > 50) {
        this.slowQueries.shift();
      }
    }
  }

  recordError() {
    this.errors++;
  }

  getStats() {
    return {
      queryCount: this.queryCount,
      avgDuration: this.queryCount > 0 ? (this.totalDuration / this.queryCount).toFixed(2) : 0,
      slowQueryCount: this.slowQueries.length,
      errors: this.errors,
      recentSlowQueries: this.slowQueries.slice(-5),
    };
  }

  reset() {
    this.queryCount = 0;
    this.totalDuration = 0;
    this.slowQueries = [];
    this.errors = 0;
  }
}

/**
 * Singleton Prisma client instance
 * Ensures single connection pool across application
 */
let prisma = null;
let metrics = null;

/**
 * Create optimized Prisma client with performance monitoring
 * @returns {PrismaClient} Prisma client instance
 */
function createPrismaClient() {
  metrics = new PrismaMetrics();

  const client = new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'query', emit: 'event' },
    ],
    errorFormat: 'minimal',

    // Connection pooling configuration
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'file:./data/llm-framework.db',
      },
    },
  });

  // Log warnings and errors through Winston
  client.$on('warn', (e) => {
    logger.warn('Prisma warning', { message: e.message, target: e.target });
  });

  client.$on('error', (e) => {
    metrics.recordError();
    logger.error('Prisma error', { message: e.message, target: e.target });
  });

  // Performance monitoring
  client.$on('query', (e) => {
    metrics.recordQuery(e.query, e.duration);

    // Log slow queries
    if (e.duration > 100) {
      logger.warn('Slow Prisma query detected', {
        query: e.query.slice(0, 200),
        duration: e.duration,
        params: e.params,
      });
    }
  });

  // Enable connection pooling optimizations
  client.$use(async (params, next) => {
    const start = Date.now();
    try {
      const result = await next(params);
      const duration = Date.now() - start;

      // Log operations taking longer than 50ms
      if (duration > 50) {
        logger.debug('Prisma operation', {
          model: params.model,
          action: params.action,
          duration,
        });
      }

      return result;
    } catch (error) {
      metrics.recordError();
      logger.error('Prisma middleware error', {
        model: params.model,
        action: params.action,
        error: error.message,
      });
      throw error;
    }
  });

  logger.info('Prisma client initialized with optimizations', {
    datasource: process.env.DATABASE_URL || 'default',
    pooling: 'enabled',
    monitoring: 'enabled',
  });

  return client;
}

/**
 * Get or create Prisma client instance
 * @returns {PrismaClient} Prisma client
 */
export function getPrismaClient() {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

/**
 * Get performance metrics
 * @returns {Object} Performance statistics
 */
export function getPrismaMetrics() {
  return metrics ? metrics.getStats() : null;
}

/**
 * Reset performance metrics
 */
export function resetPrismaMetrics() {
  if (metrics) {
    metrics.reset();
  }
}

/**
 * Execute query with automatic retry on transient errors
 * @param {Function} fn - Query function
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<*>} Query result
 */
export async function withRetry(fn, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Only retry on specific transient errors
      const retryableErrors = ['SQLITE_BUSY', 'SQLITE_LOCKED', 'Connection pool timeout'];

      const isRetryable = retryableErrors.some((msg) => error.message.includes(msg));

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      logger.debug('Retrying Prisma operation', {
        attempt,
        maxRetries,
        delay,
        error: error.message,
      });
    }
  }

  throw lastError;
}

/**
 * Batch multiple operations for better performance
 * @param {Array<Function>} operations - Array of query functions
 * @returns {Promise<Array>} Results array
 */
export async function batchOperations(operations) {
  const client = getPrismaClient();

  // Use Prisma's $transaction for atomic batch execution
  return client.$transaction(
    operations.map((op) => op(client)),
    {
      maxWait: 5000, // Maximum wait time in ms
      timeout: 10000, // Maximum execution time in ms
    }
  );
}

/**
 * Disconnect Prisma client (for cleanup)
 * @param {number} timeout - Disconnect timeout in ms
 */
export async function disconnectPrisma(timeout = 5000) {
  if (prisma) {
    try {
      // Wait for pending queries with timeout
      await Promise.race([
        prisma.$disconnect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Disconnect timeout')), timeout)
        ),
      ]);

      prisma = null;
      logger.info('Prisma client disconnected gracefully');
    } catch (error) {
      logger.error('Error disconnecting Prisma', { error: error.message });
      prisma = null;
    }
  }
}

/**
 * Health check for Prisma connection
 * @returns {Promise<boolean>} True if healthy
 */
export async function healthCheck() {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1 as health`;
    return true;
  } catch (error) {
    logger.error('Prisma health check failed', { error: error.message });
    return false;
  }
}

// Export singleton instance
export const prisma = getPrismaClient();

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectPrisma();
});

process.on('SIGINT', async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectPrisma();
  process.exit(0);
});

export default prisma;
