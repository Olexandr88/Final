/**
 * Comprehensive System Monitor
 * Tracks CPU, memory, network, and application metrics
 */

import { EventEmitter } from 'node:events';
import os from 'node:os';
import { PERFORMANCE } from '../config/constants.js';

export class SystemMonitor extends EventEmitter {
  constructor({ updateInterval = PERFORMANCE.METRICS_UPDATE_INTERVAL_MS } = {}) {
    super();
    this.updateInterval = updateInterval;
    this.metrics = {
      cpu: { usage: 0, cores: os.cpus().length },
      memory: { used: 0, total: os.totalmem(), percent: 0 },
      process: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        uptime: 0
      },
      network: { connections: 0, throughput: 0 },
      application: {}
    };

    this.history = {
      cpu: [],
      memory: [],
      throughput: []
    };

    this.historyLimit = 60; // Keep last 60 readings
    this.lastCpuUsage = process.cpuUsage();
    this.lastUpdateTime = Date.now();

    // Start monitoring
    this.monitorTimer = setInterval(() => this._collect(), this.updateInterval);
    this.monitorTimer.unref?.();
  }

  /**
   * Collect all metrics
   */
  _collect() {
    const now = Date.now();

    // CPU Usage
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    const elapsedTime = (now - this.lastUpdateTime) * 1000; // Convert to microseconds
    const cpuPercent = ((currentCpuUsage.user + currentCpuUsage.system) / elapsedTime) * 100;

    this.metrics.cpu.usage = Math.min(cpuPercent, 100);
    this.lastCpuUsage = process.cpuUsage();
    this.lastUpdateTime = now;

    // Memory Usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    this.metrics.memory = {
      used: usedMem,
      free: freeMem,
      total: totalMem,
      percent: (usedMem / totalMem) * 100
    };

    // Process Memory
    const memUsage = process.memoryUsage();
    this.metrics.process = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      uptime: process.uptime()
    };

    // Update history
    this.history.cpu.push({ timestamp: now, value: this.metrics.cpu.usage });
    this.history.memory.push({ timestamp: now, value: this.metrics.memory.percent });

    // Trim history
    if (this.history.cpu.length > this.historyLimit) {
      this.history.cpu.shift();
    }
    if (this.history.memory.length > this.historyLimit) {
      this.history.memory.shift();
    }

    // Emit metrics update
    this.emit('metricsUpdated', this.getMetrics());

    // Alert on high resource usage
    if (this.metrics.cpu.usage > 80) {
      this.emit('highCpuUsage', { usage: this.metrics.cpu.usage });
    }
    if (this.metrics.memory.percent > 85) {
      this.emit('highMemoryUsage', { usage: this.metrics.memory.percent });
    }
  }

  /**
   * Update application-specific metrics
   * @param {Object} appMetrics - Application metrics
   */
  updateApplicationMetrics(appMetrics) {
    this.metrics.application = {
      ...this.metrics.application,
      ...appMetrics,
      timestamp: Date.now()
    };
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      system: {
        platform: os.platform(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        uptime: os.uptime()
      },
      timestamp: Date.now()
    };
  }

  /**
   * Get metrics history
   * @param {string} type - Metric type ('cpu', 'memory', 'throughput')
   * @param {number} limit - Number of entries to return
   * @returns {Array} Historical data
   */
  getHistory(type, limit = 60) {
    const history = this.history[type] || [];
    return history.slice(-limit);
  }

  /**
   * Get performance summary
   * @returns {Object} Performance summary
   */
  getSummary() {
    const cpuHistory = this.history.cpu.map(h => h.value);
    const memHistory = this.history.memory.map(h => h.value);

    return {
      cpu: {
        current: this.metrics.cpu.usage.toFixed(2),
        avg: (cpuHistory.reduce((a, b) => a + b, 0) / cpuHistory.length || 0).toFixed(2),
        max: Math.max(...cpuHistory, 0).toFixed(2),
        cores: this.metrics.cpu.cores
      },
      memory: {
        current: this.metrics.memory.percent.toFixed(2),
        avg: (memHistory.reduce((a, b) => a + b, 0) / memHistory.length || 0).toFixed(2),
        max: Math.max(...memHistory, 0).toFixed(2),
        totalGB: (this.metrics.memory.total / 1024 / 1024 / 1024).toFixed(2)
      },
      process: {
        heapUsedMB: (this.metrics.process.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (this.metrics.process.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: (this.metrics.process.rss / 1024 / 1024).toFixed(2),
        uptimeHours: (this.metrics.process.uptime / 3600).toFixed(2)
      },
      health: this._calculateHealth()
    };
  }

  /**
   * Calculate overall system health score (0-100)
   * @returns {Object} Health score and status
   */
  _calculateHealth() {
    const cpuScore = Math.max(0, 100 - this.metrics.cpu.usage);
    const memScore = Math.max(0, 100 - this.metrics.memory.percent);
    const heapPercent = (this.metrics.process.heapUsed / this.metrics.process.heapTotal) * 100;
    const heapScore = Math.max(0, 100 - heapPercent);

    const overallScore = (cpuScore + memScore + heapScore) / 3;

    let status = 'healthy';
    if (overallScore < 30) status = 'critical';
    else if (overallScore < 60) status = 'degraded';
    else if (overallScore < 80) status = 'warning';

    return {
      score: overallScore.toFixed(2),
      status,
      components: {
        cpu: cpuScore.toFixed(2),
        memory: memScore.toFixed(2),
        heap: heapScore.toFixed(2)
      }
    };
  }

  /**
   * Export metrics as JSON
   * @returns {string} JSON metrics
   */
  exportMetrics() {
    return JSON.stringify({
      current: this.getMetrics(),
      summary: this.getSummary(),
      history: {
        cpu: this.history.cpu,
        memory: this.history.memory
      },
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    clearInterval(this.monitorTimer);
    this.removeAllListeners();
  }
}

export default SystemMonitor;
