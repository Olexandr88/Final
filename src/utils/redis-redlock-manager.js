import Redis from 'ioredis';
import Redlock from 'redlock';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from './logger.js';

/**
 * Distributed Lock Manager using Redis Redlock Algorithm
 *
 * Implements the Redlock distributed locking algorithm for multi-node coordination:
 * - Uses majority consensus across Redis nodes
 * - Automatic lock renewal for long-running operations
 * - Fault tolerance and automatic failover
 * - Deadlock prevention and stale lock cleanup
 * - Performance metrics and health monitoring
 *
 * Reference: https://redis.io/topics/distlock
 *
 * @class RedisRedlockManager
 * @extends EventEmitter
 */
class RedisRedlockManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Redis connection options
    this.redisNodes = options.redisNodes || [
      { host: 'localhost', port: 6379 },
      { host: 'localhost', port: 6380 },
      { host: 'localhost', port: 6381 },
    ];

    // Redlock configuration
    this.lockTTL = options.lockTTL || 10000; // 10 seconds default
    this.retryCount = options.retryCount || 3;
    this.retryDelay = options.retryDelay || 200; // ms
    this.retryJitter = options.retryJitter || 100; // ms
    this.driftFactor = options.driftFactor || 0.01;
    this.automaticExtensionThreshold = options.automaticExtensionThreshold || 500; // ms

    // Redis client options
    this.clientOptions = {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        if (targetErrors.some((e) => err.message.includes(e))) {
          return true; // Reconnect
        }
        return false;
      },
      ...options.clientOptions,
    };

    // State tracking
    this.redisClients = [];
    this.redlock = null;
    this.activeLocks = new Map(); // lockKey -> { lock, resourcePath, acquiredAt, renewalTimer }
    this.metrics = {
      locksAcquired: 0,
      locksFailed: 0,
      locksReleased: 0,
      locksExpired: 0,
      renewals: 0,
      totalAcquireTime: 0,
      errors: 0,
    };

    this.initialized = false;
    this.healthy = false;
  }

  /**
   * Initialize Redis connections and Redlock instance
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('[RedisRedlock] Already initialized');
      return;
    }

    try {
      logger.info('[RedisRedlock] Initializing Redis connections...', {
        nodes: this.redisNodes.length,
      });

      // Create Redis clients for each node
      for (const nodeConfig of this.redisNodes) {
        const client = new Redis({
          ...nodeConfig,
          ...this.clientOptions,
        });

        // Event handlers
        client.on('connect', () => {
          logger.info(
            `[RedisRedlock] Connected to Redis node ${nodeConfig.host}:${nodeConfig.port}`
          );
          this.emit('node-connect', nodeConfig);
        });

        client.on('error', (err) => {
          logger.error(`[RedisRedlock] Redis node error ${nodeConfig.host}:${nodeConfig.port}`, {
            error: err.message,
          });
          this.metrics.errors++;
          this.emit('node-error', { node: nodeConfig, error: err });
        });

        client.on('close', () => {
          logger.warn(`[RedisRedlock] Connection closed ${nodeConfig.host}:${nodeConfig.port}`);
          this.emit('node-disconnect', nodeConfig);
        });

        this.redisClients.push(client);
      }

      // Wait for at least majority of nodes to be ready
      const readyPromises = this.redisClients.map(
        (client) =>
          new Promise((resolve) => {
            if (client.status === 'ready') {
              resolve(true);
            } else {
              client.once('ready', () => resolve(true));
              // Timeout after 5 seconds
              setTimeout(() => resolve(false), 5000);
            }
          })
      );

      const readyResults = await Promise.all(readyPromises);
      const readyCount = readyResults.filter(Boolean).length;
      const requiredQuorum = Math.floor(this.redisNodes.length / 2) + 1;

      if (readyCount < requiredQuorum) {
        throw new Error(
          `Insufficient Redis nodes ready. Required: ${requiredQuorum}, Ready: ${readyCount}`
        );
      }

      logger.info(`[RedisRedlock] ${readyCount}/${this.redisNodes.length} Redis nodes ready`);

      // Initialize Redlock
      this.redlock = new Redlock(this.redisClients, {
        driftFactor: this.driftFactor,
        retryCount: this.retryCount,
        retryDelay: this.retryDelay,
        retryJitter: this.retryJitter,
        automaticExtensionThreshold: this.automaticExtensionThreshold,
      });

      // Redlock event handlers
      this.redlock.on('clientError', (err, details) => {
        logger.error('[RedisRedlock] Redlock client error', {
          error: err.message,
          details,
        });
        this.metrics.errors++;
      });

      this.initialized = true;
      this.healthy = true;

      logger.info('[RedisRedlock] Initialization complete');
      this.emit('initialized');

      // Start health check interval
      this._startHealthCheck();
    } catch (error) {
      logger.error('[RedisRedlock] Initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Acquire a distributed lock
   *
   * @param {string} resourcePath - Unique identifier for the resource
   * @param {number} ttl - Time-to-live in milliseconds (optional, uses default if not provided)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Lock information
   */
  async acquireLock(resourcePath, ttl = null, options = {}) {
    if (!this.initialized) {
      throw new Error('RedisRedlockManager not initialized. Call initialize() first.');
    }

    const lockTTL = ttl || this.lockTTL;
    const lockKey = `lock:${resourcePath}`;
    const startTime = performance.now();

    try {
      logger.debug('[RedisRedlock] Acquiring lock', { resourcePath, ttl: lockTTL });

      // Attempt to acquire lock
      const lock = await this.redlock.acquire([lockKey], lockTTL);

      const acquireTime = performance.now() - startTime;

      // Track lock
      const lockInfo = {
        lock,
        resourcePath,
        lockKey,
        acquiredAt: Date.now(),
        ttl: lockTTL,
        acquireTime,
        renewalTimer: null,
      };

      this.activeLocks.set(lockKey, lockInfo);

      // Update metrics
      this.metrics.locksAcquired++;
      this.metrics.totalAcquireTime += acquireTime;

      // Set up automatic renewal if requested
      if (options.autoRenew) {
        this._setupAutoRenewal(lockInfo);
      }

      logger.info('[RedisRedlock] Lock acquired', {
        resourcePath,
        acquireTime: acquireTime.toFixed(2),
        ttl: lockTTL,
      });

      this.emit('lock-acquired', {
        resourcePath,
        lockKey,
        acquireTime,
        ttl: lockTTL,
      });

      return {
        resourcePath,
        lockKey,
        acquiredAt: lockInfo.acquiredAt,
        ttl: lockTTL,
        acquireTime,
        release: () => this.releaseLock(resourcePath),
      };
    } catch (error) {
      const acquireTime = performance.now() - startTime;
      this.metrics.locksFailed++;

      logger.error('[RedisRedlock] Failed to acquire lock', {
        resourcePath,
        error: error.message,
        attemptTime: acquireTime.toFixed(2),
      });

      this.emit('lock-failed', {
        resourcePath,
        lockKey,
        error: error.message,
        attemptTime: acquireTime,
      });

      throw new Error(`Failed to acquire lock for ${resourcePath}: ${error.message}`);
    }
  }

  /**
   * Release a distributed lock
   *
   * @param {string} resourcePath - Resource identifier
   */
  async releaseLock(resourcePath) {
    const lockKey = `lock:${resourcePath}`;
    const lockInfo = this.activeLocks.get(lockKey);

    if (!lockInfo) {
      logger.warn('[RedisRedlock] No active lock found for resource', { resourcePath });
      return;
    }

    try {
      // Clear renewal timer if exists
      if (lockInfo.renewalTimer) {
        clearInterval(lockInfo.renewalTimer);
      }

      // Release the lock
      await lockInfo.lock.release();

      // Remove from tracking
      this.activeLocks.delete(lockKey);

      // Update metrics
      this.metrics.locksReleased++;

      const lockDuration = Date.now() - lockInfo.acquiredAt;

      logger.info('[RedisRedlock] Lock released', {
        resourcePath,
        duration: lockDuration,
      });

      this.emit('lock-released', {
        resourcePath,
        lockKey,
        duration: lockDuration,
      });
    } catch (error) {
      logger.error('[RedisRedlock] Failed to release lock', {
        resourcePath,
        error: error.message,
      });

      // Remove from tracking anyway to prevent leaks
      this.activeLocks.delete(lockKey);

      throw error;
    }
  }

  /**
   * Extend/renew a lock
   *
   * @param {string} resourcePath - Resource identifier
   * @param {number} additionalTTL - Additional time in milliseconds
   */
  async extendLock(resourcePath, additionalTTL = null) {
    const lockKey = `lock:${resourcePath}`;
    const lockInfo = this.activeLocks.get(lockKey);

    if (!lockInfo) {
      throw new Error(`No active lock found for ${resourcePath}`);
    }

    const extension = additionalTTL || this.lockTTL;

    try {
      // Extend the lock
      await lockInfo.lock.extend(extension);

      lockInfo.ttl += extension;
      this.metrics.renewals++;

      logger.debug('[RedisRedlock] Lock extended', {
        resourcePath,
        extension,
        newTTL: lockInfo.ttl,
      });

      this.emit('lock-extended', {
        resourcePath,
        lockKey,
        extension,
        newTTL: lockInfo.ttl,
      });

      return {
        resourcePath,
        newTTL: lockInfo.ttl,
        extension,
      };
    } catch (error) {
      logger.error('[RedisRedlock] Failed to extend lock', {
        resourcePath,
        error: error.message,
      });

      // Lock may have expired, clean up
      this.activeLocks.delete(lockKey);
      this.metrics.locksExpired++;

      throw error;
    }
  }

  /**
   * Execute a function with automatic lock acquisition and release
   *
   * @param {string} resourcePath - Resource identifier
   * @param {Function} fn - Async function to execute
   * @param {Object} options - Lock options
   */
  async withLock(resourcePath, fn, options = {}) {
    let lock = null;

    try {
      lock = await this.acquireLock(resourcePath, options.ttl, options);
      const result = await fn();
      return result;
    } finally {
      if (lock) {
        await this.releaseLock(resourcePath);
      }
    }
  }

  /**
   * Set up automatic lock renewal
   *
   * @private
   */
  _setupAutoRenewal(lockInfo) {
    const renewalInterval = Math.floor(lockInfo.ttl * 0.7); // Renew at 70% of TTL

    lockInfo.renewalTimer = setInterval(async () => {
      try {
        await this.extendLock(lockInfo.resourcePath, this.lockTTL);
      } catch (error) {
        logger.error('[RedisRedlock] Auto-renewal failed', {
          resourcePath: lockInfo.resourcePath,
          error: error.message,
        });

        // Clear the timer and remove lock
        clearInterval(lockInfo.renewalTimer);
        this.activeLocks.delete(lockInfo.lockKey);
        this.metrics.locksExpired++;

        this.emit('lock-expired', {
          resourcePath: lockInfo.resourcePath,
          lockKey: lockInfo.lockKey,
        });
      }
    }, renewalInterval);
  }

  /**
   * Start health check monitoring
   *
   * @private
   */
  _startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        // Ping all Redis nodes
        const healthChecks = this.redisClients.map(async (client) => {
          try {
            const startTime = performance.now();
            await client.ping();
            const latency = performance.now() - startTime;
            return { healthy: true, latency };
          } catch (err) {
            return { healthy: false, error: err.message };
          }
        });

        const results = await Promise.all(healthChecks);

        const healthyCount = results.filter((r) => r.healthy).length;
        const requiredQuorum = Math.floor(this.redisNodes.length / 2) + 1;

        const wasHealthy = this.healthy;
        this.healthy = healthyCount >= requiredQuorum;

        if (this.healthy && !wasHealthy) {
          logger.info('[RedisRedlock] System healthy', { healthyNodes: healthyCount });
          this.emit('healthy');
        } else if (!this.healthy && wasHealthy) {
          logger.error('[RedisRedlock] System unhealthy', { healthyNodes: healthyCount });
          this.emit('unhealthy', { healthyNodes: healthyCount, requiredQuorum });
        }

        // Calculate average latency
        const avgLatency =
          results.filter((r) => r.healthy).reduce((sum, r) => sum + r.latency, 0) / healthyCount;

        this.emit('health-check', {
          healthy: this.healthy,
          healthyNodes: healthyCount,
          totalNodes: this.redisNodes.length,
          avgLatency: avgLatency.toFixed(2),
        });
      } catch (error) {
        logger.error('[RedisRedlock] Health check error', { error: error.message });
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Get lock information
   *
   * @param {string} resourcePath - Resource identifier
   * @returns {Object|null} Lock information
   */
  getLockInfo(resourcePath) {
    const lockKey = `lock:${resourcePath}`;
    const lockInfo = this.activeLocks.get(lockKey);

    if (!lockInfo) {
      return null;
    }

    return {
      resourcePath,
      lockKey,
      acquiredAt: lockInfo.acquiredAt,
      ttl: lockInfo.ttl,
      age: Date.now() - lockInfo.acquiredAt,
      autoRenew: lockInfo.renewalTimer !== null,
    };
  }

  /**
   * Check if a resource is locked
   *
   * @param {string} resourcePath - Resource identifier
   * @returns {boolean}
   */
  isLocked(resourcePath) {
    const lockKey = `lock:${resourcePath}`;
    return this.activeLocks.has(lockKey);
  }

  /**
   * List all active locks
   *
   * @returns {Array<Object>}
   */
  listLocks() {
    return Array.from(this.activeLocks.values()).map((lockInfo) => ({
      resourcePath: lockInfo.resourcePath,
      lockKey: lockInfo.lockKey,
      acquiredAt: lockInfo.acquiredAt,
      ttl: lockInfo.ttl,
      age: Date.now() - lockInfo.acquiredAt,
      autoRenew: lockInfo.renewalTimer !== null,
    }));
  }

  /**
   * Get performance metrics
   *
   * @returns {Object}
   */
  getMetrics() {
    const avgAcquireTime =
      this.metrics.locksAcquired > 0
        ? this.metrics.totalAcquireTime / this.metrics.locksAcquired
        : 0;

    return {
      ...this.metrics,
      avgAcquireTime: avgAcquireTime.toFixed(2),
      activeLocks: this.activeLocks.size,
      successRate:
        this.metrics.locksAcquired > 0
          ? (
              (this.metrics.locksAcquired /
                (this.metrics.locksAcquired + this.metrics.locksFailed)) *
              100
            ).toFixed(2)
          : 0,
      healthy: this.healthy,
    };
  }

  /**
   * Get health status
   *
   * @returns {Object}
   */
  async getHealthStatus() {
    if (!this.initialized) {
      return {
        healthy: false,
        initialized: false,
      };
    }

    const nodeHealthChecks = await Promise.all(
      this.redisClients.map(async (client, index) => {
        try {
          const startTime = performance.now();
          await client.ping();
          const latency = performance.now() - startTime;

          return {
            node: this.redisNodes[index],
            healthy: true,
            latency: latency.toFixed(2),
            status: client.status,
          };
        } catch (error) {
          return {
            node: this.redisNodes[index],
            healthy: false,
            error: error.message,
            status: client.status,
          };
        }
      })
    );

    const healthyCount = nodeHealthChecks.filter((n) => n.healthy).length;
    const requiredQuorum = Math.floor(this.redisNodes.length / 2) + 1;

    return {
      healthy: this.healthy,
      initialized: this.initialized,
      nodes: nodeHealthChecks,
      healthyNodes: healthyCount,
      totalNodes: this.redisNodes.length,
      requiredQuorum,
      hasQuorum: healthyCount >= requiredQuorum,
      metrics: this.getMetrics(),
    };
  }

  /**
   * Release all locks and cleanup
   */
  async cleanup() {
    logger.info('[RedisRedlock] Cleaning up...');

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Release all active locks
    const releasePromises = [];
    for (const [lockKey, lockInfo] of this.activeLocks.entries()) {
      try {
        if (lockInfo.renewalTimer) {
          clearInterval(lockInfo.renewalTimer);
        }
        releasePromises.push(lockInfo.lock.release());
      } catch (err) {
        logger.error('[RedisRedlock] Error releasing lock during cleanup', {
          lockKey,
          error: err.message,
        });
      }
    }

    await Promise.allSettled(releasePromises);
    this.activeLocks.clear();

    // Quit all Redis clients
    const quitPromises = this.redisClients.map((client) => client.quit());
    await Promise.allSettled(quitPromises);

    this.redisClients = [];
    this.redlock = null;
    this.initialized = false;
    this.healthy = false;

    logger.info('[RedisRedlock] Cleanup complete');
    this.emit('cleanup');
  }
}

export default RedisRedlockManager;
