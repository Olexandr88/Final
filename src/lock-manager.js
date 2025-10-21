import lockfile from 'proper-lockfile';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import RedisRedlockManager from './utils/redis-redlock-manager.js';

class LockManager {
  constructor(sessionManager, options = {}) {
    this.sessionManager = sessionManager;
    this.locks = new Map(); // Track active locks for this session

    const lockDir = path.join(process.cwd(), '.claude-sessions', 'locks');
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true }); // Keep sync for constructor
    }
    this.lockDir = lockDir;

    // Distributed locking configuration
    this.useDistributed = false; // Start with false until initialized
    this.distributedLockManager = null;
    this.initializationPromise = null; // Track async initialization

    // Initialize distributed lock manager if enabled (async)
    if (options.useDistributed || process.env.USE_DISTRIBUTED_LOCKS === 'true') {
      this.initializationPromise = this._initializeDistributedLocks(options.redisConfig);
    }
  }

  /**
   * Initialize distributed lock manager (Redis Redlock)
   * @private
   */
  async _initializeDistributedLocks(redisConfig = {}) {
    try {
      const defaultRedisNodes = [
        {
          host: process.env.REDIS_HOST_1 || 'localhost',
          port: parseInt(process.env.REDIS_PORT_1 || '6379'),
        },
        {
          host: process.env.REDIS_HOST_2 || 'localhost',
          port: parseInt(process.env.REDIS_PORT_2 || '6380'),
        },
        {
          host: process.env.REDIS_HOST_3 || 'localhost',
          port: parseInt(process.env.REDIS_PORT_3 || '6381'),
        },
      ];

      this.distributedLockManager = new RedisRedlockManager({
        redisNodes: redisConfig.nodes || defaultRedisNodes,
        lockTTL: redisConfig.lockTTL || 10000,
        retryCount: redisConfig.retryCount || 3,
        retryDelay: redisConfig.retryDelay || 200,
        ...redisConfig,
      });

      await this.distributedLockManager.initialize();

      console.log('[LockManager] Distributed locks initialized (Redis Redlock)');

      // Set up event listeners
      this.distributedLockManager.on('unhealthy', () => {
        console.warn(
          '[LockManager] Distributed lock system unhealthy, falling back to local locks'
        );
        this.useDistributed = false;
      });

      this.distributedLockManager.on('healthy', () => {
        console.log('[LockManager] Distributed lock system healthy');
        this.useDistributed = true;
      });
    } catch (error) {
      console.error(
        '[LockManager] Failed to initialize distributed locks, using local locks:',
        error.message
      );
      this.useDistributed = false;
      this.distributedLockManager = null;
    }
  }

  _getLockFilePath(resourcePath) {
    // Create a hash of the resource path for the lock file name
    const hash = crypto.createHash('md5').update(resourcePath).digest('hex');
    return path.join(this.lockDir, `${hash}.lock`);
  }

  async acquireLock(resourcePath, lockType = 'write', timeout = 5000) {
    // Wait for initialization to complete if still in progress
    if (this.initializationPromise) {
      await this.initializationPromise;
      this.initializationPromise = null; // Clear after first wait
    }

    const sessionId = this.sessionManager.getCurrentSessionId();
    if (!sessionId) {
      throw new Error('Session not registered. Call sessionManager.register() first.');
    }

    // Use distributed locks if available and healthy
    if (this.useDistributed && this.distributedLockManager) {
      return this._acquireDistributedLock(resourcePath, lockType, timeout);
    }

    // Fallback to local file-based locking
    return this._acquireLocalLock(resourcePath, lockType, timeout);
  }

  /**
   * Acquire distributed lock via Redis Redlock
   * @private
   */
  async _acquireDistributedLock(resourcePath, lockType, timeout) {
    try {
      const lock = await this.distributedLockManager.acquireLock(resourcePath, timeout);

      const sessionId = this.sessionManager.getCurrentSessionId();
      const now = Date.now();

      // Record lock in database for tracking
      this.sessionManager.db
        .prepare(
          `
        INSERT INTO locks (resource_path, session_id, acquired_at, lock_type)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(resourcePath, sessionId, now, lockType);

      // Store lock info
      const lockInfo = {
        resourcePath,
        lockType,
        distributed: true,
        lock,
        acquiredAt: now,
        release: () => this.distributedLockManager.releaseLock(resourcePath),
      };

      this.locks.set(resourcePath, lockInfo);

      return lockInfo;
    } catch (error) {
      // If distributed lock fails, fall back to local
      console.warn(
        `[LockManager] Distributed lock failed for ${resourcePath}, falling back to local: ${error.message}`
      );
      return this._acquireLocalLock(resourcePath, lockType, timeout);
    }
  }

  /**
   * Acquire local file-based lock
   * @private
   */
  async _acquireLocalLock(resourcePath, lockType, timeout) {
    const sessionId = this.sessionManager.getCurrentSessionId();
    const lockFilePath = this._getLockFilePath(resourcePath);
    const lockKey = resourcePath;

    // Check if we already have this lock
    if (this.locks.has(lockKey)) {
      const existingLock = this.locks.get(lockKey);
      if (existingLock.type === 'write' || lockType === 'write') {
        return existingLock; // Already have sufficient lock
      }
    }

    // Create lock file if it doesn't exist
    if (!fs.existsSync(lockFilePath)) {
      await fs.promises.writeFile(lockFilePath, '');
    }

    const options = {
      retries: {
        retries: 3,
        minTimeout: 500,
        maxTimeout: 2000,
      },
      stale: 30000, // Consider lock stale after 30 seconds
      realpath: false,
    };

    try {
      const startTime = Date.now();

      // Try to acquire lock with timeout
      while (Date.now() - startTime < timeout) {
        try {
          const release = await lockfile.lock(lockFilePath, options);

          // Record lock in database
          const now = Date.now();
          this.sessionManager.db
            .prepare(
              `
            INSERT INTO locks (resource_path, session_id, acquired_at, lock_type)
            VALUES (?, ?, ?, ?)
          `
            )
            .run(resourcePath, sessionId, now, lockType);

          // Store lock info
          const lockInfo = {
            resourcePath,
            lockType,
            distributed: false,
            release,
            acquiredAt: now,
          };
          this.locks.set(lockKey, lockInfo);

          return lockInfo;
        } catch (err) {
          if (err.code !== 'ELOCKED') {
            throw err;
          }
          // Wait a bit before retrying
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Timeout - check who has the lock
      const lockHolder = this._getLockHolder(resourcePath);
      throw new Error(
        `Timeout acquiring lock for ${resourcePath}. ` +
          `Lock held by session: ${lockHolder?.session_id || 'unknown'} ` +
          `(PID: ${lockHolder?.pid || 'unknown'})`
      );
    } catch (err) {
      throw new Error(`Failed to acquire lock for ${resourcePath}: ${err.message}`);
    }
  }

  async releaseLock(resourcePath) {
    const lockKey = resourcePath;
    const lockInfo = this.locks.get(lockKey);

    if (!lockInfo) {
      return; // No lock to release
    }

    try {
      // Release distributed or local lock
      if (lockInfo.distributed && this.distributedLockManager) {
        await this.distributedLockManager.releaseLock(resourcePath);
      } else if (lockInfo.release) {
        await lockInfo.release();
      }

      // Remove from database
      const sessionId = this.sessionManager.getCurrentSessionId();
      this.sessionManager.db
        .prepare(
          `
        DELETE FROM locks
        WHERE resource_path = ? AND session_id = ?
      `
        )
        .run(resourcePath, sessionId);

      // Remove from local tracking
      this.locks.delete(lockKey);
    } catch (err) {
      console.error(`Error releasing lock for ${resourcePath}:`, err.message);
    }
  }

  async releaseAllLocks() {
    const lockKeys = Array.from(this.locks.keys());
    for (const lockKey of lockKeys) {
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Get lock statistics and health status
   * @returns {Object} Lock statistics
   */
  getStats() {
    const stats = {
      localLocks: Array.from(this.locks.values()).filter((l) => !l.distributed).length,
      distributedLocks: Array.from(this.locks.values()).filter((l) => l.distributed).length,
      totalLocks: this.locks.size,
      distributedEnabled: this.useDistributed,
      distributedHealthy: this.distributedLockManager?.healthy || false,
    };

    if (this.distributedLockManager) {
      stats.distributedMetrics = this.distributedLockManager.getMetrics();
    }

    return stats;
  }

  /**
   * Get health status of lock system
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    const status = {
      healthy: true,
      localLocks: this.locks.size,
      distributedEnabled: this.useDistributed,
    };

    if (this.useDistributed && this.distributedLockManager) {
      const distributedHealth = await this.distributedLockManager.getHealthStatus();
      status.distributedHealth = distributedHealth;
      status.healthy = distributedHealth.healthy;
    }

    return status;
  }

  /**
   * Cleanup lock manager and release all resources
   */
  async cleanup() {
    // Release all locks
    await this.releaseAllLocks();

    // Cleanup distributed lock manager
    if (this.distributedLockManager) {
      await this.distributedLockManager.cleanup();
      this.distributedLockManager = null;
    }
  }

  _getLockHolder(resourcePath) {
    const lock = this.sessionManager.db
      .prepare(
        `
      SELECT l.*, s.pid
      FROM locks l
      JOIN sessions s ON l.session_id = s.id
      WHERE l.resource_path = ?
      ORDER BY l.acquired_at DESC
      LIMIT 1
    `
      )
      .get(resourcePath);

    return lock;
  }

  isLocked(resourcePath) {
    const lock = this._getLockHolder(resourcePath);
    return lock !== undefined;
  }

  getLockInfo(resourcePath) {
    return this._getLockHolder(resourcePath);
  }

  async withLock(resourcePath, lockType, callback) {
    let lock = null;
    try {
      lock = await this.acquireLock(resourcePath, lockType);
      return await callback();
    } finally {
      if (lock) {
        await this.releaseLock(resourcePath);
      }
    }
  }

  listLocks() {
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (!sessionId) return [];

    const locks = this.sessionManager.db
      .prepare(
        `
      SELECT resource_path, lock_type, acquired_at
      FROM locks
      WHERE session_id = ?
      ORDER BY acquired_at DESC
    `
      )
      .all(sessionId);

    return locks;
  }
}

export default LockManager;
