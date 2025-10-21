/**
 * Agent Metrics Tracker
 * Collects and aggregates performance metrics for agents
 */

export class AgentMetrics {
  constructor(agentId) {
    this.agentId = agentId;
    this.metrics = {
      requests: 0,
      responses: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      startTime: Date.now(),
      lastRequestTime: null,
      lastResponseTime: null,
    };
    this.responseTimes = []; // Last 100 response times
    this.maxResponseTimes = 100;
  }

  recordRequest() {
    this.metrics.requests++;
    this.metrics.lastRequestTime = Date.now();
  }

  recordResponse(responseTimeMs, cached = false) {
    this.metrics.responses++;
    this.metrics.lastResponseTime = Date.now();

    if (cached) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    // Update response time stats
    this.metrics.totalResponseTime += responseTimeMs;
    this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, responseTimeMs);
    this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, responseTimeMs);

    // Store for percentile calculations
    this.responseTimes.push(responseTimeMs);
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }
  }

  recordError(error) {
    this.metrics.errors++;
  }

  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    const avgResponseTime =
      this.metrics.responses > 0 ? this.metrics.totalResponseTime / this.metrics.responses : 0;

    const cacheHitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
        : 0;

    const requestsPerSecond = uptime > 0 ? this.metrics.requests / (uptime / 1000) : 0;

    // Calculate percentiles
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p50 = this._percentile(sortedTimes, 50);
    const p95 = this._percentile(sortedTimes, 95);
    const p99 = this._percentile(sortedTimes, 99);

    return {
      agentId: this.agentId,
      uptime: Math.floor(uptime / 1000),
      requests: this.metrics.requests,
      responses: this.metrics.responses,
      errors: this.metrics.errors,
      errorRate:
        this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests) * 100 : 0,
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      cacheHitRate: cacheHitRate.toFixed(2),
      responseTime: {
        avg: avgResponseTime.toFixed(2),
        min: this.metrics.minResponseTime === Infinity ? 0 : this.metrics.minResponseTime,
        max: this.metrics.maxResponseTime,
        p50: p50.toFixed(2),
        p95: p95.toFixed(2),
        p99: p99.toFixed(2),
      },
      throughput: {
        requestsPerSecond: requestsPerSecond.toFixed(2),
      },
      lastActivity: {
        lastRequest: this.metrics.lastRequestTime,
        lastResponse: this.metrics.lastResponseTime,
        timeSinceLastRequest: this.metrics.lastRequestTime
          ? Date.now() - this.metrics.lastRequestTime
          : null,
      },
    };
  }

  _percentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  reset() {
    this.metrics = {
      requests: 0,
      responses: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      startTime: Date.now(),
      lastRequestTime: null,
      lastResponseTime: null,
    };
    this.responseTimes = [];
  }

  toJSON() {
    return this.getStats();
  }
}

// Metrics registry for all agents
export class MetricsRegistry {
  constructor() {
    this.agents = new Map();
  }

  getOrCreate(agentId) {
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, new AgentMetrics(agentId));
    }
    return this.agents.get(agentId);
  }

  get(agentId) {
    return this.agents.get(agentId);
  }

  getAllStats() {
    const stats = {};
    for (const [agentId, metrics] of this.agents) {
      stats[agentId] = metrics.getStats();
    }
    return stats;
  }

  reset(agentId) {
    const metrics = this.agents.get(agentId);
    if (metrics) {
      metrics.reset();
    }
  }

  resetAll() {
    for (const metrics of this.agents.values()) {
      metrics.reset();
    }
  }
}

export const metricsRegistry = new MetricsRegistry();

export default AgentMetrics;
