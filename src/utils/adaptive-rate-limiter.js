/**
 * Adaptive Rate Limiter with Circuit Breaker
 * Dynamically adjusts rate limits based on system load
 */

import { EventEmitter } from 'node:events';
import { PERFORMANCE } from '../config/cpu-optimized-constants.js';

// Keep SECURITY from original constants (not CPU-related)
import { SECURITY } from '../config/constants.js';

export class AdaptiveRateLimiter extends EventEmitter {
  constructor({
    baseWindowMs = SECURITY.RATE_LIMIT_WINDOW_MS,
    baseMaxRequests = SECURITY.RATE_LIMIT_MAX_REQUESTS,
    adaptiveEnabled = true,
    circuitBreakerThreshold = 10,
  } = {}) {
    super();
    this.baseWindowMs = baseWindowMs;
    this.baseMaxRequests = baseMaxRequests;
    this.adaptiveEnabled = adaptiveEnabled;
    this.circuitBreakerThreshold = circuitBreakerThreshold;

    // Client request tracking
    this.clientRequests = new Map(); // clientId -> [timestamps]

    // System load metrics
    this.systemLoad = {
      cpuUsage: 0,
      memoryUsage: 0,
      requestsPerSecond: 0,
      avgResponseTime: 0,
    };

    // Circuit breaker state
    this.circuitBreaker = new Map(); // clientId -> { failures: number, lastFailure: timestamp, state: 'closed'|'open'|'half-open' }

    // Dynamic rate limit multiplier (1.0 = base rate)
    this.rateLimitMultiplier = 1.0;

    // Cleanup old entries every minute
    this.cleanupTimer = setInterval(() => this._cleanup(), 60000);
    this.cleanupTimer.unref?.();
  }

  /**
   * Check if request is allowed
   * @param {string} clientId - Client identifier
   * @param {Object} options - Additional options
   * @returns {Object} { allowed: boolean, retryAfter: number, reason: string }
   */
  checkRateLimit(clientId, options = {}) {
    const now = Date.now();

    // Check circuit breaker first
    const breakerState = this._checkCircuitBreaker(clientId, now);
    if (breakerState.state === 'open') {
      this.emit('circuitBreakerOpen', { clientId, retryAfter: breakerState.retryAfter });
      return {
        allowed: false,
        retryAfter: breakerState.retryAfter,
        reason: 'circuit_breaker_open',
        state: breakerState.state,
      };
    }

    // Get or create client request history
    if (!this.clientRequests.has(clientId)) {
      this.clientRequests.set(clientId, []);
    }

    const requests = this.clientRequests.get(clientId);

    // Calculate current window and max requests (adaptive)
    const currentWindowMs = this.baseWindowMs;
    const currentMaxRequests = Math.floor(this.baseMaxRequests * this.rateLimitMultiplier);

    // Remove requests outside current window
    const windowStart = now - currentWindowMs;
    const recentRequests = requests.filter((timestamp) => timestamp > windowStart);

    // Update client request history
    this.clientRequests.set(clientId, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= currentMaxRequests) {
      const oldestRequest = recentRequests[0];
      const retryAfter = Math.ceil((oldestRequest + currentWindowMs - now) / 1000);

      this.emit('rateLimitExceeded', {
        clientId,
        requests: recentRequests.length,
        limit: currentMaxRequests,
        retryAfter,
      });

      // Record failure for circuit breaker
      this._recordFailure(clientId, now);

      return {
        allowed: false,
        retryAfter,
        reason: 'rate_limit_exceeded',
        current: recentRequests.length,
        limit: currentMaxRequests,
      };
    }

    // Allow request
    recentRequests.push(now);
    this.clientRequests.set(clientId, recentRequests);

    // Reset circuit breaker on success
    if (breakerState.state === 'half-open') {
      this._resetCircuitBreaker(clientId);
    }

    return {
      allowed: true,
      remaining: currentMaxRequests - recentRequests.length,
      limit: currentMaxRequests,
      resetAt: windowStart + currentWindowMs,
    };
  }

  /**
   * Update system load metrics for adaptive rate limiting
   * @param {Object} metrics - System metrics
   */
  updateSystemLoad(metrics) {
    this.systemLoad = { ...this.systemLoad, ...metrics };

    if (!this.adaptiveEnabled) return;

    // Adjust rate limit multiplier based on system load
    const { cpuUsage = 0, memoryUsage = 0, requestsPerSecond = 0 } = metrics;

    // Calculate load factor (0-1, where 1 is max load)
    const cpuFactor = Math.min(cpuUsage / 80, 1); // 80% CPU = max
    const memoryFactor = Math.min(memoryUsage / 85, 1); // 85% memory = max
    const rpsTarget = 100; // Target RPS
    const rpsFactor = Math.min(requestsPerSecond / rpsTarget, 1);

    const avgLoadFactor = (cpuFactor + memoryFactor + rpsFactor) / 3;

    // Adjust multiplier (reduce rate limit when load is high)
    if (avgLoadFactor > 0.7) {
      this.rateLimitMultiplier = Math.max(0.5, this.rateLimitMultiplier - 0.1); // Reduce
    } else if (avgLoadFactor < 0.3) {
      this.rateLimitMultiplier = Math.min(1.5, this.rateLimitMultiplier + 0.05); // Increase
    }

    this.emit('rateLimitAdjusted', {
      multiplier: this.rateLimitMultiplier,
      loadFactor: avgLoadFactor,
    });
  }

  /**
   * Check circuit breaker state
   * @param {string} clientId - Client ID
   * @param {number} now - Current timestamp
   * @returns {Object} Circuit breaker state
   */
  _checkCircuitBreaker(clientId, now) {
    const breaker = this.circuitBreaker.get(clientId);

    if (!breaker) {
      return { state: 'closed', retryAfter: 0 };
    }

    // Open -> Half-open after timeout (30 seconds)
    if (breaker.state === 'open') {
      const timeoutDuration = 30000; // 30 seconds
      const timeSinceFailure = now - breaker.lastFailure;

      if (timeSinceFailure >= timeoutDuration) {
        breaker.state = 'half-open';
        this.circuitBreaker.set(clientId, breaker);
        return { state: 'half-open', retryAfter: 0 };
      }

      const retryAfter = Math.ceil((timeoutDuration - timeSinceFailure) / 1000);
      return { state: 'open', retryAfter };
    }

    return { state: breaker.state, retryAfter: 0 };
  }

  /**
   * Record a failure for circuit breaker
   * @param {string} clientId - Client ID
   * @param {number} now - Current timestamp
   */
  _recordFailure(clientId, now) {
    const breaker = this.circuitBreaker.get(clientId) || {
      failures: 0,
      lastFailure: now,
      state: 'closed',
    };

    breaker.failures++;
    breaker.lastFailure = now;

    // Open circuit if threshold exceeded
    if (breaker.failures >= this.circuitBreakerThreshold) {
      breaker.state = 'open';
      this.emit('circuitBreakerTripped', { clientId, failures: breaker.failures });
    }

    this.circuitBreaker.set(clientId, breaker);
  }

  /**
   * Reset circuit breaker on successful request
   * @param {string} clientId - Client ID
   */
  _resetCircuitBreaker(clientId) {
    this.circuitBreaker.delete(clientId);
    this.emit('circuitBreakerReset', { clientId });
  }

  /**
   * Cleanup old entries
   */
  _cleanup() {
    const now = Date.now();
    const maxAge = this.baseWindowMs * 2; // Keep 2x window for safety

    // Cleanup request history
    for (const [clientId, requests] of this.clientRequests.entries()) {
      const recentRequests = requests.filter((timestamp) => now - timestamp < maxAge);
      if (recentRequests.length === 0) {
        this.clientRequests.delete(clientId);
      } else {
        this.clientRequests.set(clientId, recentRequests);
      }
    }

    // Cleanup circuit breakers (after 5 minutes of inactivity)
    for (const [clientId, breaker] of this.circuitBreaker.entries()) {
      if (now - breaker.lastFailure > 5 * 60 * 1000) {
        this.circuitBreaker.delete(clientId);
      }
    }
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      trackedClients: this.clientRequests.size,
      circuitBreakers: {
        total: this.circuitBreaker.size,
        open: Array.from(this.circuitBreaker.values()).filter((b) => b.state === 'open').length,
        halfOpen: Array.from(this.circuitBreaker.values()).filter((b) => b.state === 'half-open')
          .length,
      },
      rateLimitMultiplier: this.rateLimitMultiplier.toFixed(2),
      currentMaxRequests: Math.floor(this.baseMaxRequests * this.rateLimitMultiplier),
      systemLoad: this.systemLoad,
    };
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    clearInterval(this.cleanupTimer);
    this.clientRequests.clear();
    this.circuitBreaker.clear();
  }
}

export default AdaptiveRateLimiter;
