/**
 * Docker Stats Collector - Aggregates and manages container statistics
 * @module docker-stats-collector
 */

import { logger } from '../utils/logger.js';

/**
 * Docker Stats Collector class - Manages historical stats with sliding window
 */
export class DockerStatsCollector {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 60; // 60 data points (1 minute at 1s intervals)
    this.maxConcurrent = options.maxConcurrent || 10; // Max concurrent stats collections

    // Storage: containerId -> array of stats
    this.statsHistory = new Map();

    // Rate limiting
    this.lastCollection = new Map(); // containerId -> timestamp
    this.minInterval = options.minInterval || 500; // Minimum 500ms between collections
  }

  /**
   * Add stats for a container
   * @param {string} containerId - Container ID
   * @param {Object} stats - Stats object
   */
  addStats(containerId, stats) {
    // Check rate limiting
    const lastTime = this.lastCollection.get(containerId);
    const now = Date.now();

    if (lastTime && (now - lastTime) < this.minInterval) {
      logger.debug('Rate limit: skipping stats collection', { containerId });
      return;
    }

    // Initialize history array if needed
    if (!this.statsHistory.has(containerId)) {
      this.statsHistory.set(containerId, []);
    }

    const history = this.statsHistory.get(containerId);

    // Add timestamp if not present
    const statsWithTime = {
      ...stats,
      timestamp: stats.timestamp || new Date().toISOString()
    };

    // Add to history
    history.push(statsWithTime);

    // Maintain sliding window
    if (history.length > this.windowSize) {
      history.shift(); // Remove oldest
    }

    // Update last collection time
    this.lastCollection.set(containerId, now);

    logger.debug('Stats added', {
      containerId,
      historySize: history.length,
      cpu: statsWithTime.cpu?.percent,
      memory: statsWithTime.memory?.percent
    });
  }

  /**
   * Get stats history for a container
   * @param {string} containerId - Container ID
   * @returns {Array} Array of stats objects
   */
  getHistory(containerId) {
    return this.statsHistory.get(containerId) || [];
  }

  /**
   * Get latest stats for a container
   * @param {string} containerId - Container ID
   * @returns {Object|null} Latest stats or null
   */
  getLatest(containerId) {
    const history = this.getHistory(containerId);
    return history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Get aggregated stats for a container
   * @param {string} containerId - Container ID
   * @returns {Object} Aggregated stats (avg, min, max)
   */
  getAggregated(containerId) {
    const history = this.getHistory(containerId);

    if (history.length === 0) {
      return null;
    }

    // Extract metrics
    const cpuPercents = history.map(s => parseFloat(s.cpu?.percent || 0));
    const memPercents = history.map(s => parseFloat(s.memory?.percent || 0));
    const memUsages = history.map(s => parseFloat(s.memory?.usageMB || 0));

    return {
      cpu: {
        avg: this._avg(cpuPercents),
        min: this._min(cpuPercents),
        max: this._max(cpuPercents),
        current: cpuPercents[cpuPercents.length - 1]
      },
      memory: {
        avgPercent: this._avg(memPercents),
        minPercent: this._min(memPercents),
        maxPercent: this._max(memPercents),
        currentPercent: memPercents[memPercents.length - 1],
        avgMB: this._avg(memUsages),
        minMB: this._min(memUsages),
        maxMB: this._max(memUsages),
        currentMB: memUsages[memUsages.length - 1]
      },
      dataPoints: history.length,
      timeRange: {
        start: history[0].timestamp,
        end: history[history.length - 1].timestamp
      }
    };
  }

  /**
   * Get time-series data for charts
   * @param {string} containerId - Container ID
   * @param {string} metric - Metric name (cpu, memory, network, blockIO)
   * @returns {Object} Time-series data with labels and values
   */
  getTimeSeries(containerId, metric = 'cpu') {
    const history = this.getHistory(containerId);

    if (history.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = history.map(s => {
      const time = new Date(s.timestamp);
      return time.toLocaleTimeString();
    });

    let datasets = [];

    switch (metric) {
      case 'cpu':
        datasets = [{
          label: 'CPU %',
          data: history.map(s => parseFloat(s.cpu?.percent || 0)),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1
        }];
        break;

      case 'memory':
        datasets = [
          {
            label: 'Memory MB',
            data: history.map(s => parseFloat(s.memory?.usageMB || 0)),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.1
          },
          {
            label: 'Memory %',
            data: history.map(s => parseFloat(s.memory?.percent || 0)),
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
            tension: 0.1,
            yAxisID: 'percentage'
          }
        ];
        break;

      case 'network':
        datasets = [
          {
            label: 'RX (MB)',
            data: history.map(s => parseFloat(s.network?.rxMB || 0)),
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            tension: 0.1
          },
          {
            label: 'TX (MB)',
            data: history.map(s => parseFloat(s.network?.txMB || 0)),
            borderColor: 'rgb(153, 102, 255)',
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            tension: 0.1
          }
        ];
        break;

      case 'blockIO':
        datasets = [
          {
            label: 'Read (MB)',
            data: history.map(s => parseFloat(s.blockIO?.readMB || 0)),
            borderColor: 'rgb(255, 205, 86)',
            backgroundColor: 'rgba(255, 205, 86, 0.2)',
            tension: 0.1
          },
          {
            label: 'Write (MB)',
            data: history.map(s => parseFloat(s.blockIO?.writeMB || 0)),
            borderColor: 'rgb(201, 203, 207)',
            backgroundColor: 'rgba(201, 203, 207, 0.2)',
            tension: 0.1
          }
        ];
        break;

      default:
        logger.warn('Unknown metric type', { metric });
    }

    return { labels, datasets };
  }

  /**
   * Clear stats for a container
   * @param {string} containerId - Container ID
   */
  clearStats(containerId) {
    this.statsHistory.delete(containerId);
    this.lastCollection.delete(containerId);
    logger.debug('Stats cleared', { containerId });
  }

  /**
   * Clear all stats
   */
  clearAll() {
    const count = this.statsHistory.size;
    this.statsHistory.clear();
    this.lastCollection.clear();
    logger.info('All stats cleared', { count });
  }

  /**
   * Get stats for all containers
   * @returns {Map} Map of containerId -> latest stats
   */
  getAllLatest() {
    const result = new Map();

    for (const [containerId, history] of this.statsHistory.entries()) {
      if (history.length > 0) {
        result.set(containerId, history[history.length - 1]);
      }
    }

    return result;
  }

  /**
   * Get memory usage summary
   * @returns {Object} Memory usage by stats collector
   */
  getMemoryUsage() {
    let totalDataPoints = 0;
    let totalContainers = this.statsHistory.size;

    for (const history of this.statsHistory.values()) {
      totalDataPoints += history.length;
    }

    // Rough estimate: each data point ~500 bytes
    const estimatedBytes = totalDataPoints * 500;

    return {
      containers: totalContainers,
      dataPoints: totalDataPoints,
      estimatedBytes,
      estimatedMB: (estimatedBytes / 1024 / 1024).toFixed(2),
      windowSize: this.windowSize
    };
  }

  /**
   * Cleanup old containers (not updated in last N minutes)
   * @param {number} minutes - Minutes threshold
   * @returns {number} Number of containers cleaned up
   */
  cleanup(minutes = 10) {
    const threshold = Date.now() - (minutes * 60 * 1000);
    let removed = 0;

    for (const [containerId, lastTime] of this.lastCollection.entries()) {
      if (lastTime < threshold) {
        this.clearStats(containerId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Stats cleanup completed', { removed, threshold: `${minutes} minutes` });
    }

    return removed;
  }

  // Helper methods

  _avg(arr) {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return (sum / arr.length).toFixed(2);
  }

  _min(arr) {
    if (arr.length === 0) return 0;
    return Math.min(...arr).toFixed(2);
  }

  _max(arr) {
    if (arr.length === 0) return 0;
    return Math.max(...arr).toFixed(2);
  }
}

export default DockerStatsCollector;
