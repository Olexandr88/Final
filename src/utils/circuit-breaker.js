/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascade failures by monitoring client health
 */

export class CircuitBreaker {
  constructor({
    failureThreshold = 5,
    resetTimeout = 60000, // 60s
    halfOpenRequests = 3,
    name = 'unnamed',
  } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenRequests = halfOpenRequests;

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.halfOpenAttempts = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenRequests) {
        this.state = 'CLOSED';
        this.successes++;
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      healthy: this.state === 'CLOSED',
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.halfOpenAttempts = 0;
  }
}

export class CircuitBreakerManager {
  constructor(defaultOptions = {}) {
    this.breakers = new Map();
    this.defaultOptions = defaultOptions;
  }

  getBreaker(clientId) {
    if (!this.breakers.has(clientId)) {
      this.breakers.set(
        clientId,
        new CircuitBreaker({
          ...this.defaultOptions,
          name: clientId,
        })
      );
    }
    return this.breakers.get(clientId);
  }

  async execute(clientId, fn) {
    const breaker = this.getBreaker(clientId);
    return breaker.execute(fn);
  }

  getAllStatuses() {
    return Array.from(this.breakers.values()).map((b) => b.getStatus());
  }

  remove(clientId) {
    this.breakers.delete(clientId);
  }

  getMetrics() {
    const statuses = this.getAllStatuses();
    return {
      total: statuses.length,
      healthy: statuses.filter((s) => s.state === 'CLOSED').length,
      halfOpen: statuses.filter((s) => s.state === 'HALF_OPEN').length,
      open: statuses.filter((s) => s.state === 'OPEN').length,
      totalFailures: statuses.reduce((sum, s) => sum + s.failures, 0),
      totalSuccesses: statuses.reduce((sum, s) => sum + s.successes, 0),
    };
  }
}
