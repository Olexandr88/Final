/**
 * LRU Cache for Message Deduplication
 * Prevents duplicate LLM requests and improves response time
 */

import crypto from 'crypto';
import { LLM } from '../config/constants.js';

export class MessageCache {
  constructor({ maxSize = LLM.CACHE.MAX_SIZE, ttl = LLM.CACHE.TTL_MS } = {}) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map(); // key -> { value, timestamp, accessCount }
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Generate cache key from message content using fast FNV-1a hash
   * @param {string} message - User message
   * @param {object} options - Additional parameters (model, temperature, etc.)
   * @returns {string} Cache key
   */
  generateKey(message, options = {}) {
    // OPTIMIZED: Fast FNV-1a hash instead of SHA-256 (10x faster)
    const content = `${message}|${options.model || ''}`;
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
    }
    return (hash >>> 0).toString(36);
  }

  /**
   * Get value from cache if exists and not expired
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const age = Date.now() - entry.timestamp;

    // Check if expired
    if (age > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Update access count and move to end (LRU)
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   */
  set(key, value) {
    // If at capacity, evict oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      accessCount: 0
    });
  }

  /**
   * Check if key exists in cache (without updating stats)
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries from cache
   */
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: `${hitRate}%`,
      ttl: this.ttl
    };
  }

  /**
   * Remove expired entries (optimized to limit iterations)
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    const keysToDelete = [];

    // Collect expired keys first (don't modify while iterating)
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
        removed++;
        // Limit cleanup iterations for performance (configurable)
        const MAX_CLEANUP_PER_CYCLE = process.env.CACHE_MAX_CLEANUP || 50;
        if (removed >= MAX_CLEANUP_PER_CYCLE) break;
      }
    }

    // Batch delete collected keys
    keysToDelete.forEach(key => this.cache.delete(key));

    if (removed > 0) {
      this.stats.evictions += removed;
    }

    return removed;
  }

  /**
   * Get cache health metrics
   * @returns {object} Health status
   */
  getHealth() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) : 0;
    const utilizationPct = (this.cache.size / this.maxSize) * 100;

    return {
      healthy: hitRate > 0.2 && utilizationPct < 90,
      hitRate: hitRate.toFixed(3),
      utilization: `${utilizationPct.toFixed(1)}%`,
      size: this.cache.size,
      maxSize: this.maxSize,
      recommendations: this._getRecommendations(hitRate, utilizationPct)
    };
  }

  _getRecommendations(hitRate, utilization) {
    const recommendations = [];

    if (hitRate < 0.1) {
      recommendations.push('Low hit rate - consider reviewing cache key generation');
    }

    if (utilization > 90) {
      recommendations.push('Cache near capacity - consider increasing maxSize');
    }

    if (this.stats.evictions > this.stats.hits) {
      recommendations.push('High eviction rate - consider increasing TTL or maxSize');
    }

    return recommendations;
  }
}

export default MessageCache;
