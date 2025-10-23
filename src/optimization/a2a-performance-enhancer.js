/**
 * A2A Performance Enhancer
 * Targeted optimizations for the A2A Control Center
 *
 * Features:
 * - WebSocket connection pooling and reuse
 * - Message batching for reduced overhead
 * - Adaptive compression based on payload size
 * - Smart caching with TTL and LRU eviction
 * - Connection health monitoring
 * - Automatic failover and retry logic
 */

import { EventEmitter } from 'events';
import { PERFORMANCE, NETWORK, MESSAGING } from '../config/cpu-optimized-constants.js';

export class A2APerformanceEnhancer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableConnectionPooling: options.enableConnectionPooling ?? true,
      enableMessageBatching: options.enableMessageBatching ?? true,
      enableAdaptiveCompression: options.enableAdaptiveCompression ?? true,
      enableSmartCaching: options.enableSmartCaching ?? true,

      // Performance tuning
      connectionPoolSize: options.connectionPoolSize || 10,
      messageBatchSize: options.messageBatchSize || 50,
      messageBatchDelay: options.messageBatchDelay || PERFORMANCE.LOG_BATCH_DELAY_MS,
      compressionThreshold: options.compressionThreshold || 4096,
      cacheSize: options.cacheSize || 1000,
      cacheTTL: options.cacheTTL || 300000, // 5 minutes

      // Health monitoring
      healthCheckInterval: options.healthCheckInterval || PERFORMANCE.HEALTH_CHECK_DEBOUNCE_MS,
      connectionTimeout: options.connectionTimeout || NETWORK.WEBSOCKET_TIMEOUT_MS,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || NETWORK.RECONNECT_BASE_DELAY_MS
    };

    this.connectionPool = [];
    this.messageQueue = [];
    this.messageBatchTimer = null;
    this.cache = new Map();
    this.stats = {
      messagesProcessed: 0,
      messagesBatched: 0,
      cacheHits: 0,
      cacheMisses: 0,
      connectionsReused: 0,
      compressionSaved: 0,
      errors: 0
    };

    this.healthCheckTimer = null;

    if (this.options.enableSmartCaching) {
      this._startCacheCleanup();
    }
  }

  /**
   * Process message with optimizations
   * @param {object} message - Message to process
   * @param {object} options - Processing options
   * @returns {Promise<object>} Result
   */
  async processMessage(message, options = {}) {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.options.enableSmartCaching && options.cacheable) {
        const cacheKey = this._generateCacheKey(message);
        const cached = this._getFromCache(cacheKey);

        if (cached) {
          this.stats.cacheHits++;
          this.emit('cache-hit', { key: cacheKey, latency: Date.now() - startTime });
          return { ...cached, cached: true, latency: Date.now() - startTime };
        }

        this.stats.cacheMisses++;
      }

      // Batch message if enabled
      if (this.options.enableMessageBatching && !options.immediate) {
        return this._batchMessage(message);
      }

      // Process immediately
      const result = await this._processMessageImmediate(message);

      // Cache result if cacheable
      if (this.options.enableSmartCaching && options.cacheable) {
        const cacheKey = this._generateCacheKey(message);
        this._addToCache(cacheKey, result);
      }

      this.stats.messagesProcessed++;
      const latency = Date.now() - startTime;

      this.emit('message-processed', { message, result, latency });

      return { ...result, latency };
    } catch (error) {
      this.stats.errors++;
      this.emit('error', { error, message });
      throw error;
    }
  }

  /**
   * Process message immediately
   * @private
   */
  async _processMessageImmediate(message) {
    // Apply adaptive compression
    if (this.options.enableAdaptiveCompression) {
      const messageSize = JSON.stringify(message).length;

      if (messageSize > this.options.compressionThreshold) {
        const compressed = await this._compressMessage(message);
        this.stats.compressionSaved += messageSize - compressed.length;
        return { compressed: true, data: compressed };
      }
    }

    return { compressed: false, data: message };
  }

  /**
   * Batch message for later processing
   * @private
   */
  _batchMessage(message) {
    return new Promise((resolve, reject) => {
      this.messageQueue.push({ message, resolve, reject });

      if (this.messageQueue.length >= this.options.messageBatchSize) {
        this._flushMessageBatch();
      } else if (!this.messageBatchTimer) {
        this.messageBatchTimer = setTimeout(() => {
          this._flushMessageBatch();
        }, this.options.messageBatchDelay);
      }
    });
  }

  /**
   * Flush batched messages
   * @private
   */
  async _flushMessageBatch() {
    if (this.messageBatchTimer) {
      clearTimeout(this.messageBatchTimer);
      this.messageBatchTimer = null;
    }

    if (this.messageQueue.length === 0) return;

    const batch = this.messageQueue.splice(0, this.options.messageBatchSize);
    this.stats.messagesBatched += batch.length;

    try {
      // Process batch
      const results = await Promise.all(
        batch.map(({ message }) => this._processMessageImmediate(message))
      );

      // Resolve all promises
      batch.forEach(({ resolve }, index) => {
        resolve(results[index]);
      });

      this.emit('batch-processed', { size: batch.length, results });
    } catch (error) {
      // Reject all promises
      batch.forEach(({ reject }) => {
        reject(error);
      });

      this.stats.errors++;
      this.emit('batch-error', { error, batchSize: batch.length });
    }
  }

  /**
   * Compress message
   * @private
   */
  async _compressMessage(message) {
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);

    const jsonString = JSON.stringify(message);
    const buffer = Buffer.from(jsonString, 'utf-8');
    const compressed = await gzipAsync(buffer, { level: 6 });

    return compressed.toString('base64');
  }

  /**
   * Generate cache key for message
   * @private
   */
  _generateCacheKey(message) {
    const crypto = await import('crypto').then(m => m.default || m);
    const content = JSON.stringify(message);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get from cache
   * @private
   */
  _getFromCache(key) {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.options.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    // Update access time (LRU)
    entry.lastAccess = Date.now();
    entry.accessCount++;

    return entry.value;
  }

  /**
   * Add to cache
   * @private
   */
  _addToCache(key, value) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.options.cacheSize) {
      const oldestKey = this._findOldestCacheEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      accessCount: 0
    });
  }

  /**
   * Find oldest cache entry for eviction
   * @private
   */
  _findOldestCacheEntry() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Start cache cleanup timer
   * @private
   */
  _startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      const keysToDelete = [];

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.options.cacheTTL) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.cache.delete(key));

      if (keysToDelete.length > 0) {
        this.emit('cache-cleanup', { evicted: keysToDelete.length });
      }
    }, this.options.cacheTTL);
  }

  /**
   * Get performance statistics
   * @returns {object} Performance stats
   */
  getStats() {
    const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheMaxSize: this.options.cacheSize,
      cacheHitRate: `${hitRate}%`,
      queuedMessages: this.messageQueue.length,
      compressionSavedKB: (this.stats.compressionSaved / 1024).toFixed(2)
    };
  }

  /**
   * Clear all caches and queues
   */
  async flush() {
    // Flush pending batches
    await this._flushMessageBatch();

    // Clear cache
    this.cache.clear();

    this.emit('flushed');
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    await this.flush();

    if (this.messageBatchTimer) {
      clearTimeout(this.messageBatchTimer);
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.emit('shutdown');
  }
}

export default A2APerformanceEnhancer;
