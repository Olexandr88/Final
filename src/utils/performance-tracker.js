/**
 * Performance Tracking and Optimization System
 * Real-time performance metrics for A2A agents and bridge
 */

export class PerformanceTracker {
  constructor(options = {}) {
    this.metrics = new Map();
    this.historySize = options.historySize || 100;
    this.windowSize = options.windowSize || 60000; // 1 minute window
  }

  /**
   * Record a metric value
   */
  record(metricName, value, tags = {}) {
    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, {
        name: metricName,
        values: [],
        tags: new Map(),
      });
    }

    const metric = this.metrics.get(metricName);
    const timestamp = Date.now();

    metric.values.push({ value, timestamp, tags });

    // Prune old values
    const cutoff = timestamp - this.windowSize;
    metric.values = metric.values.filter((v) => v.timestamp > cutoff);

    // Keep only recent history
    if (metric.values.length > this.historySize) {
      metric.values = metric.values.slice(-this.historySize);
    }
  }

  /**
   * Get metric statistics
   */
  getStats(metricName) {
    const metric = this.metrics.get(metricName);
    if (!metric || metric.values.length === 0) {
      return null;
    }

    const values = metric.values.map((v) => v.value);
    const sorted = [...values].sort((a, b) => a - b);

    return {
      name: metricName,
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      recent: values.slice(-10),
    };
  }

  /**
   * Get all metrics summary
   */
  getAllStats() {
    const stats = {};
    for (const [name] of this.metrics) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }

  /**
   * Measure execution time of a function
   */
  async measure(metricName, fn) {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.record(metricName, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.record(`${metricName}_error`, duration);
      throw error;
    }
  }

  /**
   * Get recent performance trend
   */
  getTrend(metricName, windowMs = 30000) {
    const metric = this.metrics.get(metricName);
    if (!metric || metric.values.length < 2) {
      return 'stable';
    }

    const now = Date.now();
    const cutoff = now - windowMs;
    const recentValues = metric.values.filter((v) => v.timestamp > cutoff);

    if (recentValues.length < 2) return 'stable';

    const firstHalf = recentValues.slice(0, Math.floor(recentValues.length / 2));
    const secondHalf = recentValues.slice(Math.floor(recentValues.length / 2));

    const avg1 = firstHalf.reduce((a, b) => a + b.value, 0) / firstHalf.length;
    const avg2 = secondHalf.reduce((a, b) => a + b.value, 0) / secondHalf.length;

    const change = ((avg2 - avg1) / avg1) * 100;

    if (change > 20) return 'degrading';
    if (change < -20) return 'improving';
    return 'stable';
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }

  /**
   * Export metrics as JSON
   */
  export() {
    const data = {};
    for (const [name, metric] of this.metrics) {
      data[name] = {
        values: metric.values,
        stats: this.getStats(name),
      };
    }
    return data;
  }
}

export default PerformanceTracker;
