/**
 * Optimized LRU Cache Implementation
 * Provides bounded memory caching with automatic eviction
 */
import { LRUCache } from 'lru-cache';
import { logger } from './logger.js';

export class OptimizedCache {
  constructor(options = {}) {
    this.name = options.name || 'cache';

    this.cache = new LRUCache({
      max: options.maxSize || 500,
      maxSize: options.maxMemory || 10000, // KB
      sizeCalculation:
        options.sizeCalculation ||
        ((value) => {
          const size = JSON.stringify(value).length / 1024;
          return Math.max(1, Math.ceil(size)); // Ensure at least 1 KB and an integer
        }),
      ttl: options.ttl || 60000, // 1 minute default
      ttlAutopurge: true,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      dispose: (value, key) => {
        if (options.onEvict) {
          options.onEvict(key, value);
        }
      },
    });

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      errors: 0,
    };
  }

  /**
   * Get value from cache
   */
  get(key) {
    try {
      const value = this.cache.get(key);

      if (value !== undefined) {
        this.stats.hits++;
        return value;
      }

      this.stats.misses++;
      return undefined;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Cache ${this.name} get error:`, error);
      return undefined;
    }
  }

  /**
   * Set value in cache
   */
  set(key, value, ttl) {
    try {
      const options = ttl ? { ttl } : undefined;
      this.cache.set(key, value, options);
      this.stats.sets++;
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Cache ${this.name} set error:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete key
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    logger.info(`Cache ${this.name} cleared`);
  }

  /**
   * Get or compute value
   */
  async getOrCompute(key, computeFn, ttl) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const value = await computeFn();
      this.set(key, value, ttl);
      return value;
    } catch (error) {
      logger.error(`Cache ${this.name} compute error for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      name: this.name,
      size: this.cache.size,
      hitRate: hitRate.toFixed(2) + '%',
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      evictions: this.stats.evictions,
      errors: this.stats.errors,
    };
  }

  /**
   * Get cache info
   */
  getInfo() {
    return {
      name: this.name,
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
      max: this.cache.max,
      maxSize: this.cache.maxSize,
    };
  }

  /**
   * Dump cache contents (for debugging)
   */
  dump() {
    return this.cache.dump();
  }

  /**
   * Load cache from dump
   */
  load(dump) {
    this.cache.load(dump);
  }
}

/**
 * File Content Cache
 * Specialized cache for file contents
 */
export class FileContentCache extends OptimizedCache {
  constructor(options = {}) {
    super({
      name: 'file-content',
      maxSize: options.maxSize || 500,
      maxMemory: options.maxMemory || 50000, // 50MB
      ttl: options.ttl || 300000, // 5 minutes
      ...options,
    });
  }

  /**
   * Generate cache key from file path and mtime
   */
  generateKey(filePath, mtime) {
    return `${filePath}:${mtime}`;
  }
}

/**
 * Response Cache
 * Specialized cache for API responses
 */
export class ResponseCache extends OptimizedCache {
  constructor(options = {}) {
    super({
      name: 'response',
      maxSize: options.maxSize || 1000,
      maxMemory: options.maxMemory || 10000, // 10MB
      ttl: options.ttl || 60000, // 1 minute
      ...options,
    });
  }

  /**
   * Generate cache key from request
   */
  generateKey(request) {
    const parts = [
      request.method || 'GET',
      request.url || request.path,
      JSON.stringify(request.query || {}),
      JSON.stringify(request.body || {}),
    ];
    return parts.join('::');
  }
}

export default OptimizedCache;
