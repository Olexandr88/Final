import Database from 'better-sqlite3';
import { logger } from './logger.js';

/**
 * Database connection pool for better-sqlite3
 * Manages a pool of reusable database connections with automatic cleanup
 * @module database-pool
 */

export class DatabasePool {
  /**
   * Create a database connection pool
   * @param {string} dbPath - Path to SQLite database file
   * @param {Object} options - Pool configuration options
   * @param {number} options.poolSize - Maximum number of connections (default: 10)
   * @param {number} options.maxWaitTime - Max time to wait for connection in ms (default: 5000)
   * @param {boolean} options.enableWAL - Enable WAL mode for connections (default: true)
   * @param {Object} options.pragmas - Additional PRAGMA settings
   */
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.poolSize = options.poolSize || 10;
    this.maxWaitTime = options.maxWaitTime || 5000;
    this.enableWAL = options.enableWAL !== false;
    this.pragmas = options.pragmas || {};

    // Connection pools
    this.pool = [];
    this.available = [];
    this.waiting = [];
    this.activeConnections = 0;

    // Statistics
    this.stats = {
      totalAcquired: 0,
      totalReleased: 0,
      totalCreated: 0,
      totalErrors: 0,
      peakActive: 0
    };

    // Initialize pool
    this._initializePool();

    logger.info('DatabasePool initialized', {
      dbPath: this.dbPath,
      poolSize: this.poolSize,
      enableWAL: this.enableWAL
    });
  }

  /**
   * Initialize connection pool
   * @private
   */
  _initializePool() {
    for (let i = 0; i < this.poolSize; i++) {
      try {
        const conn = this._createConnection();
        this.pool.push(conn);
        this.available.push(conn);
        this.stats.totalCreated++;
      } catch (error) {
        logger.error('Failed to create database connection', {
          error: error.message,
          poolIndex: i
        });
        throw error;
      }
    }
  }

  /**
   * Create a new database connection with configured settings
   * @private
   * @returns {Database} SQLite database connection
   */
  _createConnection() {
    const db = new Database(this.dbPath);

    // OPTIMIZED: Performance pragmas for maximum throughput
    if (this.enableWAL) {
      db.pragma('journal_mode = WAL'); // Write-Ahead Logging
    }
    db.pragma('synchronous = NORMAL'); // Balance safety and speed
    db.pragma('cache_size = 10000'); // 10,000 pages in memory
    db.pragma('temp_store = MEMORY'); // Temp tables in memory
    db.pragma('mmap_size = 30000000000'); // 30GB memory-mapped I/O
    db.pragma('busy_timeout = 5000'); // Wait 5s for locks

    // Apply custom pragmas (override defaults)
    for (const [pragma, value] of Object.entries(this.pragmas)) {
      db.pragma(`${pragma} = ${value}`);
    }

    // Prepared statement cache
    db._preparedStatements = new Map();

    // Add metadata
    db._poolCreatedAt = Date.now();
    db._poolUsageCount = 0;

    return db;
  }

  /**
   * Acquire a connection from the pool
   * @returns {Promise<Database>} Database connection
   * @throws {Error} If no connection available within maxWaitTime
   */
  async acquire() {
    return new Promise((resolve, reject) => {
      // Check if connection is immediately available
      if (this.available.length > 0) {
        const conn = this.available.shift();
        this.activeConnections++;
        this.stats.totalAcquired++;
        this.stats.peakActive = Math.max(this.stats.peakActive, this.activeConnections);
        conn._poolUsageCount++;

        logger.debug('Connection acquired immediately', {
          available: this.available.length,
          active: this.activeConnections
        });

        return resolve(conn);
      }

      // Add to waiting queue
      const timeout = setTimeout(() => {
        const index = this.waiting.indexOf(waitObj);
        if (index > -1) {
          this.waiting.splice(index, 1);
        }
        this.stats.totalErrors++;
        reject(new Error(
          `Database connection timeout after ${this.maxWaitTime}ms. ` +
          `Active: ${this.activeConnections}, Waiting: ${this.waiting.length}`
        ));
      }, this.maxWaitTime);

      const waitObj = { resolve, reject, timeout };
      this.waiting.push(waitObj);

      logger.debug('Connection request queued', {
        waitingCount: this.waiting.length,
        available: this.available.length,
        active: this.activeConnections
      });
    });
  }

  /**
   * Release a connection back to the pool
   * @param {Database} conn - Connection to release
   */
  release(conn) {
    if (!conn || !this.pool.includes(conn)) {
      logger.warn('Attempted to release invalid connection');
      return;
    }

    this.activeConnections--;
    this.stats.totalReleased++;

    // If there are waiting requests, give them the connection
    if (this.waiting.length > 0) {
      const waitObj = this.waiting.shift();
      clearTimeout(waitObj.timeout);
      this.activeConnections++;
      conn._poolUsageCount++;

      logger.debug('Connection passed to waiting request', {
        waitingCount: this.waiting.length,
        active: this.activeConnections
      });

      waitObj.resolve(conn);
    } else {
      // Return to available pool
      this.available.push(conn);

      logger.debug('Connection returned to pool', {
        available: this.available.length,
        active: this.activeConnections
      });
    }
  }

  /**
   * Execute a function with an automatically managed connection
   * Connection is acquired before execution and released after
   * @param {Function} fn - Function to execute (receives connection as parameter)
   * @returns {Promise<*>} Result of function execution
   */
  async execute(fn) {
    let conn = null;
    try {
      conn = await this.acquire();
      const result = await fn(conn);
      return result;
    } catch (error) {
      this.stats.totalErrors++;
      logger.error('Error executing database operation', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      if (conn) {
        this.release(conn);
      }
    }
  }

  /**
   * Get pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      poolSize: this.poolSize,
      available: this.available.length,
      active: this.activeConnections,
      waiting: this.waiting.length,
      utilization: (this.activeConnections / this.poolSize * 100).toFixed(2) + '%'
    };
  }

  /**
   * Get a single connection for long-running operations
   * WARNING: You must manually release this connection!
   * Prefer execute() for most use cases
   * @returns {Promise<Database>} Database connection
   */
  async getConnection() {
    logger.warn('Manual connection acquired - remember to release it!');
    return this.acquire();
  }

  /**
   * Release a manually acquired connection
   * @param {Database} conn - Connection to release
   */
  releaseConnection(conn) {
    this.release(conn);
  }

  /**
   * Clean up all connections and close the pool
   * Waits for active connections to be released
   * @param {number} timeout - Max time to wait for cleanup in ms (default: 10000)
   */
  async cleanup(timeout = 10000) {
    logger.info('Starting database pool cleanup', {
      active: this.activeConnections,
      available: this.available.length,
      waiting: this.waiting.length
    });

    const startTime = Date.now();

    // Reject all waiting requests
    while (this.waiting.length > 0) {
      const waitObj = this.waiting.shift();
      clearTimeout(waitObj.timeout);
      waitObj.reject(new Error('Database pool is shutting down'));
    }

    // Wait for active connections to be released
    while (this.activeConnections > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeConnections > 0) {
      logger.warn('Force closing pool with active connections', {
        active: this.activeConnections
      });
    }

    // Close all connections
    const allConnections = [...this.available, ...this.pool.filter(c => !this.available.includes(c))];
    for (const conn of allConnections) {
      try {
        if (conn.open) {
          conn.close();
        }
      } catch (error) {
        logger.error('Error closing connection', {
          error: error.message
        });
      }
    }

    // Clear pools
    this.pool = [];
    this.available = [];
    this.activeConnections = 0;

    logger.info('Database pool cleanup complete', {
      stats: this.getStats()
    });
  }

  /**
   * Check if pool is healthy
   * @returns {boolean} True if pool is operational
   */
  isHealthy() {
    return this.pool.length > 0 &&
           this.available.length + this.activeConnections === this.poolSize;
  }
}

/**
 * Create a singleton database pool instance
 * @param {string} dbPath - Database path
 * @param {Object} options - Pool options
 * @returns {DatabasePool} Pool instance
 */
export function createDatabasePool(dbPath, options = {}) {
  return new DatabasePool(dbPath, options);
}

export default DatabasePool;
