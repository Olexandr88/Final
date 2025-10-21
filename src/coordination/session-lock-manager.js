/**
 * Session Lock Manager
 * Prevents multiple AI sessions from conflicting via file-based locking
 * Uses atomic file operations for cross-process coordination
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

const LOCK_DIR = path.join(process.cwd(), '.ai-session-locks');
const LOCK_TIMEOUT = 30000; // 30 seconds
const HEARTBEAT_INTERVAL = 5000; // 5 seconds

export class SessionLockManager {
  constructor(sessionId = null) {
    this.sessionId = sessionId || `session-${randomUUID()}`;
    this.locks = new Map(); // resource -> lockInfo
    this.heartbeatTimer = null;
  }

  /**
   * Initialize lock directory
   */
  async initialize() {
    try {
      await fs.mkdir(LOCK_DIR, { recursive: true });
      logger.info('Session lock manager initialized', {
        sessionId: this.sessionId,
        lockDir: LOCK_DIR
      });

      // Start heartbeat to keep locks alive
      this.startHeartbeat();
    } catch (error) {
      logger.error('Failed to initialize lock manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Acquire lock on a resource (file, directory, operation)
   * @param {string} resourcePath - Resource identifier
   * @param {Object} options - Lock options
   * @returns {Promise<boolean>} True if lock acquired
   */
  async acquireLock(resourcePath, options = {}) {
    const {
      timeout = LOCK_TIMEOUT,
      mode = 'exclusive', // 'exclusive' or 'shared'
      retries = 3
    } = options;

    const lockId = this._getLockId(resourcePath);
    const lockFile = path.join(LOCK_DIR, `${lockId}.lock`);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Check if lock exists and is valid
        const existingLock = await this._readLock(lockFile);

        if (existingLock) {
          const lockAge = Date.now() - existingLock.timestamp;

          // If lock is stale, force remove it
          if (lockAge > LOCK_TIMEOUT) {
            logger.warn('Removing stale lock', {
              resource: resourcePath,
              staleLockSession: existingLock.sessionId,
              age: lockAge
            });
            await this._removeLock(lockFile);
          } else if (existingLock.sessionId !== this.sessionId) {
            // Lock held by another session
            if (attempt < retries - 1) {
              logger.info('Lock held by another session, retrying...', {
                resource: resourcePath,
                holder: existingLock.sessionId,
                attempt: attempt + 1
              });
              await this._sleep(1000 * (attempt + 1)); // Exponential backoff
              continue;
            } else {
              logger.error('Failed to acquire lock after retries', {
                resource: resourcePath,
                holder: existingLock.sessionId
              });
              return false;
            }
          } else {
            // We already hold this lock
            logger.debug('Lock already held by current session', {
              resource: resourcePath
            });
            await this._updateLockHeartbeat(lockFile);
            return true;
          }
        }

        // Create new lock
        const lockData = {
          sessionId: this.sessionId,
          resourcePath,
          mode,
          timestamp: Date.now(),
          pid: process.pid
        };

        await fs.writeFile(lockFile, JSON.stringify(lockData, null, 2));

        // Verify lock (handle race condition)
        const verifyLock = await this._readLock(lockFile);
        if (!verifyLock || verifyLock.sessionId !== this.sessionId) {
          logger.warn('Lock verification failed (race condition)', {
            resource: resourcePath
          });
          continue;
        }

        this.locks.set(resourcePath, {
          lockFile,
          lockData,
          acquiredAt: Date.now()
        });

        logger.info('Lock acquired', {
          resource: resourcePath,
          sessionId: this.sessionId
        });

        return true;

      } catch (error) {
        logger.error('Error acquiring lock', {
          resource: resourcePath,
          attempt: attempt + 1,
          error: error.message
        });

        if (attempt === retries - 1) {
          throw error;
        }
      }
    }

    return false;
  }

  /**
   * Release lock on a resource
   * @param {string} resourcePath - Resource identifier
   */
  async releaseLock(resourcePath) {
    const lockInfo = this.locks.get(resourcePath);

    if (!lockInfo) {
      logger.warn('Attempted to release non-existent lock', {
        resource: resourcePath
      });
      return;
    }

    try {
      await this._removeLock(lockInfo.lockFile);
      this.locks.delete(resourcePath);

      logger.info('Lock released', {
        resource: resourcePath,
        sessionId: this.sessionId
      });
    } catch (error) {
      logger.error('Error releasing lock', {
        resource: resourcePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute operation with automatic lock management
   * @param {string} resourcePath - Resource to lock
   * @param {Function} operation - Async function to execute
   * @param {Object} options - Lock options
   * @returns {Promise<any>} Operation result
   */
  async withLock(resourcePath, operation, options = {}) {
    const acquired = await this.acquireLock(resourcePath, options);

    if (!acquired) {
      throw new Error(`Failed to acquire lock on ${resourcePath}`);
    }

    try {
      const result = await operation();
      return result;
    } finally {
      await this.releaseLock(resourcePath);
    }
  }

  /**
   * Check if resource is locked by another session
   * @param {string} resourcePath - Resource to check
   * @returns {Promise<Object|null>} Lock info if locked, null otherwise
   */
  async isLocked(resourcePath) {
    const lockId = this._getLockId(resourcePath);
    const lockFile = path.join(LOCK_DIR, `${lockId}.lock`);

    const existingLock = await this._readLock(lockFile);

    if (!existingLock) {
      return null;
    }

    const lockAge = Date.now() - existingLock.timestamp;

    if (lockAge > LOCK_TIMEOUT) {
      // Stale lock
      return null;
    }

    return {
      ...existingLock,
      age: lockAge,
      isOwnLock: existingLock.sessionId === this.sessionId
    };
  }

  /**
   * Release all locks held by this session
   */
  async releaseAll() {
    logger.info('Releasing all locks', {
      sessionId: this.sessionId,
      count: this.locks.size
    });

    const resources = Array.from(this.locks.keys());

    for (const resource of resources) {
      try {
        await this.releaseLock(resource);
      } catch (error) {
        logger.error('Error releasing lock during cleanup', {
          resource,
          error: error.message
        });
      }
    }

    this.stopHeartbeat();
  }

  /**
   * Start heartbeat to keep locks alive
   * @private
   */
  startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(async () => {
      for (const [resource, lockInfo] of this.locks) {
        try {
          await this._updateLockHeartbeat(lockInfo.lockFile);
        } catch (error) {
          logger.error('Heartbeat failed for lock', {
            resource,
            error: error.message
          });
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat
   * @private
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Update lock timestamp (heartbeat)
   * @private
   */
  async _updateLockHeartbeat(lockFile) {
    try {
      const lockData = await this._readLock(lockFile);

      if (lockData && lockData.sessionId === this.sessionId) {
        lockData.timestamp = Date.now();
        await fs.writeFile(lockFile, JSON.stringify(lockData, null, 2));
      }
    } catch (error) {
      // Ignore errors (lock may have been released)
    }
  }

  /**
   * Read lock file
   * @private
   */
  async _readLock(lockFile) {
    try {
      const content = await fs.readFile(lockFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.debug('Error reading lock file', { error: error.message });
      }
      return null;
    }
  }

  /**
   * Remove lock file
   * @private
   */
  async _removeLock(lockFile) {
    try {
      await fs.unlink(lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Generate lock ID from resource path
   * @private
   */
  _getLockId(resourcePath) {
    return resourcePath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 200);
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up stale locks (can be run periodically)
   */
  static async cleanupStaleLocks() {
    try {
      const files = await fs.readdir(LOCK_DIR);
      let cleaned = 0;

      for (const file of files) {
        if (!file.endsWith('.lock')) continue;

        const lockFile = path.join(LOCK_DIR, file);
        const content = await fs.readFile(lockFile, 'utf-8');
        const lockData = JSON.parse(content);

        const age = Date.now() - lockData.timestamp;

        if (age > LOCK_TIMEOUT) {
          await fs.unlink(lockFile);
          cleaned++;
          logger.info('Cleaned stale lock', {
            file,
            sessionId: lockData.sessionId,
            age
          });
        }
      }

      logger.info('Stale lock cleanup complete', { cleaned });
      return cleaned;
    } catch (error) {
      logger.error('Error cleaning stale locks', { error: error.message });
      return 0;
    }
  }
}

export default SessionLockManager;
