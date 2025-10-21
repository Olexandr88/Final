/**
 * Performance Monitoring Endpoint
 * Real-time system metrics for A2A Control Center
 */

import { performance } from 'perf_hooks';
import os from 'os';

export class PerformanceMonitorEndpoint {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      requests: 0,
      errors: 0,
      avgResponseTime: 0,
      responseTimes: [],
    };

    this.systemMetrics = {
      cpuHistory: [],
      memoryHistory: [],
      maxHistoryLength: 60, // Keep last 60 data points
    };

    // Start periodic system metrics collection
    this.metricsInterval = setInterval(() => this._collectSystemMetrics(), 5000);
  }

  /**
   * Collect system-level metrics
   */
  _collectSystemMetrics() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // CPU usage (simplified)
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const cpuUsage = 100 - ~~((100 * totalIdle) / totalTick);

    // Memory usage
    const memoryUsage = (usedMemory / totalMemory) * 100;

    // Store in history
    this.systemMetrics.cpuHistory.push({
      timestamp: Date.now(),
      value: cpuUsage,
    });

    this.systemMetrics.memoryHistory.push({
      timestamp: Date.now(),
      value: memoryUsage,
    });

    // Trim history
    if (this.systemMetrics.cpuHistory.length > this.systemMetrics.maxHistoryLength) {
      this.systemMetrics.cpuHistory.shift();
    }
    if (this.systemMetrics.memoryHistory.length > this.systemMetrics.maxHistoryLength) {
      this.systemMetrics.memoryHistory.shift();
    }
  }

  /**
   * Record request metrics
   */
  recordRequest(responseTime, isError = false) {
    this.metrics.requests++;
    if (isError) this.metrics.errors++;

    this.metrics.responseTimes.push(responseTime);

    // Keep last 100 response times
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes.shift();
    }

    // Calculate average
    this.metrics.avgResponseTime =
      this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;
  }

  /**
   * Get comprehensive performance metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    const processMemory = process.memoryUsage();

    return {
      system: {
        uptime: Math.floor(uptime / 1000),
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        loadAverage: os.loadavg(),
      },
      process: {
        pid: process.pid,
        memoryUsage: {
          rss: processMemory.rss,
          heapTotal: processMemory.heapTotal,
          heapUsed: processMemory.heapUsed,
          external: processMemory.external,
          arrayBuffers: processMemory.arrayBuffers,
        },
        cpuUsage: process.cpuUsage(),
        uptime: Math.floor(process.uptime()),
      },
      application: {
        requests: this.metrics.requests,
        errors: this.metrics.errors,
        errorRate:
          this.metrics.requests > 0
            ? ((this.metrics.errors / this.metrics.requests) * 100).toFixed(2) + '%'
            : '0%',
        avgResponseTime: Math.round(this.metrics.avgResponseTime),
        p95ResponseTime: this._calculatePercentile(this.metrics.responseTimes, 95),
        p99ResponseTime: this._calculatePercentile(this.metrics.responseTimes, 99),
      },
      trends: {
        cpu: this.systemMetrics.cpuHistory,
        memory: this.systemMetrics.memoryHistory,
      },
    };
  }

  /**
   * Calculate percentile from array
   */
  _calculatePercentile(arr, percentile) {
    if (arr.length === 0) return 0;

    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return Math.round(sorted[index] || 0);
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const memoryUsagePercent =
      (metrics.process.memoryUsage.heapUsed / metrics.process.memoryUsage.heapTotal) * 100;
    const errorRate = parseFloat(metrics.application.errorRate);

    let status = 'healthy';
    const issues = [];

    if (memoryUsagePercent > 90) {
      status = 'critical';
      issues.push('High memory usage');
    } else if (memoryUsagePercent > 75) {
      status = 'warning';
      issues.push('Elevated memory usage');
    }

    if (errorRate > 10) {
      status = 'critical';
      issues.push('High error rate');
    } else if (errorRate > 5) {
      if (status !== 'critical') status = 'warning';
      issues.push('Elevated error rate');
    }

    if (metrics.application.avgResponseTime > 5000) {
      status = 'warning';
      issues.push('Slow response times');
    }

    return {
      status,
      issues,
      metrics: {
        memoryUsage: memoryUsagePercent.toFixed(2) + '%',
        errorRate: metrics.application.errorRate,
        avgResponseTime: metrics.application.avgResponseTime + 'ms',
      },
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }
}

/**
 * Express middleware for performance monitoring
 */
export function performanceMiddleware(monitor) {
  return (req, res, next) => {
    const start = performance.now();

    res.on('finish', () => {
      const duration = performance.now() - start;
      const isError = res.statusCode >= 400;
      monitor.recordRequest(duration, isError);
    });

    next();
  };
}

export default PerformanceMonitorEndpoint;
