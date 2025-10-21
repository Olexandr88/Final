/**
 * Performance Monitoring Utilities
 * Track and report performance metrics for optimization
 */
import { performance, PerformanceObserver } from 'perf_hooks';
import { logger } from './logger.js';

export class PerformanceMonitor {
  constructor(options = {}) {
    this.name = options.name || 'monitor';
    this.slowThreshold = options.slowThreshold || 100; // ms
    this.metrics = new Map();
    this.enabled = options.enabled !== false;

    if (this.enabled) {
      this.setupObserver();
    }
  }

  setupObserver() {
    try {
      this.obs = new PerformanceObserver((items) => {
        for (const entry of items.getEntries()) {
          if (entry.duration > this.slowThreshold) {
            logger.warn(`Slow operation: ${entry.name} took ${entry.duration.toFixed(2)}ms`);
          }

          this.recordMetric(entry.name, entry.duration);
        }
      });

      this.obs.observe({ entryTypes: ['measure'] });
    } catch (error) {
      logger.error('Failed to setup performance observer:', error);
      this.enabled = false;
    }
  }

  /**
   * Start timing an operation
   */
  start(name) {
    if (!this.enabled) return null;

    const markName = `${name}-start`;
    performance.mark(markName);
    return markName;
  }

  /**
   * End timing an operation
   */
  end(name, startMark) {
    if (!this.enabled) return null;

    const endMarkName = `${name}-end`;
    performance.mark(endMarkName);

    try {
      performance.measure(name, startMark || `${name}-start`, endMarkName);
    } catch (error) {
      // Mark might not exist, ignore
    }

    return performance.now();
  }

  /**
   * Time an async function
   */
  async timeAsync(name, fn) {
    if (!this.enabled) {
      return await fn();
    }

    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);

      if (duration > this.slowThreshold) {
        logger.warn(`Slow operation: ${name} took ${duration.toFixed(2)}ms`);
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}:error`, duration);
      throw error;
    }
  }

  /**
   * Time a sync function
   */
  timeSync(name, fn) {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration);

      if (duration > this.slowThreshold) {
        logger.warn(`Slow operation: ${name} took ${duration.toFixed(2)}ms`);
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${name}:error`, duration);
      throw error;
    }
  }

  /**
   * Record a metric manually
   */
  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity,
        values: [],
      });
    }

    const metric = this.metrics.get(name);
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);

    // Keep last 100 values for percentile calculation
    metric.values.push(value);
    if (metric.values.length > 100) {
      metric.values.shift();
    }
  }

  /**
   * Get statistics for a metric
   */
  getMetricStats(name) {
    const metric = this.metrics.get(name);
    if (!metric) return null;

    const avg = metric.total / metric.count;
    const sorted = [...metric.values].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

    return {
      name,
      count: metric.count,
      avg: avg.toFixed(2),
      min: metric.min.toFixed(2),
      max: metric.max.toFixed(2),
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2),
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result = {};
    for (const name of this.metrics.keys()) {
      result[name] = this.getMetricStats(name);
    }
    return result;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const metrics = this.getAllMetrics();
    const report = {
      monitor: this.name,
      timestamp: new Date().toISOString(),
      metrics: metrics,
      summary: {
        totalOperations: 0,
        slowOperations: 0,
        averageDuration: 0,
      },
    };

    let totalDuration = 0;
    for (const metric of Object.values(metrics)) {
      report.summary.totalOperations += parseInt(metric.count);
      if (parseFloat(metric.avg) > this.slowThreshold) {
        report.summary.slowOperations++;
      }
      totalDuration += parseFloat(metric.avg) * parseInt(metric.count);
    }

    if (report.summary.totalOperations > 0) {
      report.summary.averageDuration = (totalDuration / report.summary.totalOperations).toFixed(2);
    }

    return report;
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.obs) {
      this.obs.disconnect();
    }
    this.reset();
  }
}

/**
 * Global performance monitor instance
 */
export const globalPerformanceMonitor = new PerformanceMonitor({
  name: 'global',
  slowThreshold: 100,
});

export default PerformanceMonitor;
