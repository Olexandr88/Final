/**
 * Metrics Collector
 * Collects system metrics and stores them in time-series database
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import v8 from 'v8';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Metric retention buckets
 */
export const RetentionBucket = {
  ONE_HOUR: '1h', // Keep all points
  TWENTY_FOUR_HOUR: '24h', // Aggregate to 1-minute intervals
  SEVEN_DAY: '7d', // Aggregate to 5-minute intervals
};

/**
 * Alert thresholds
 */
export const DEFAULT_THRESHOLDS = {
  cpu: 80, // 80% CPU usage
  memory: 1024 * 1024 * 1024, // 1GB memory
  eventLoopLag: 50, // 50ms event loop lag
  errorRate: 5, // 5 errors per minute
};

/**
 * MetricsCollector class
 * Collects and stores system performance metrics
 */
export class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      collectionInterval: config.collectionInterval || 10000, // 10 seconds
      dbPath: config.dbPath || path.join(__dirname, '../../data/metrics.db'),
      retentionPeriods: {
        [RetentionBucket.ONE_HOUR]: 3600000, // 1 hour
        [RetentionBucket.TWENTY_FOUR_HOUR]: 86400000, // 24 hours
        [RetentionBucket.SEVEN_DAY]: 604800000, // 7 days
      },
      alertThresholds: {
        ...DEFAULT_THRESHOLDS,
        ...config.alertThresholds,
      },
      ...config,
    };

    // Database connection
    this.db = null;

    // Collection state
    this.isCollecting = false;
    this.collectionTimer = null;

    // Event loop lag measurement
    this.lastEventLoopCheck = Date.now();
    this.eventLoopLag = 0;

    // Alert state
    this.activeAlerts = new Map();
  }

  /**
   * Initialize metrics collector
   */
  async initialize() {
    try {
      // Initialize database
      await this._initializeDatabase();

      // Start event loop lag monitoring
      this._startEventLoopMonitoring();

      logger.info('MetricsCollector initialized', {
        dbPath: this.config.dbPath,
        collectionInterval: this.config.collectionInterval,
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize MetricsCollector', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize SQLite database for metrics storage
   */
  async _initializeDatabase() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.config.dbPath);
      const fs = await import('fs/promises');
      await fs.mkdir(dataDir, { recursive: true });

      this.db = new Database(this.config.dbPath);

      // Create metrics table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          bucket TEXT NOT NULL,
          metric_type TEXT NOT NULL,
          metric_value REAL NOT NULL,
          metadata TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_timestamp_bucket ON metrics(timestamp, bucket);
        CREATE INDEX IF NOT EXISTS idx_metric_type ON metrics(metric_type);
        CREATE INDEX IF NOT EXISTS idx_bucket ON metrics(bucket);
      `);

      logger.info('Metrics database initialized', { dbPath: this.config.dbPath });
    } catch (error) {
      logger.error('Failed to initialize metrics database', { error: error.message });
      throw error;
    }
  }

  /**
   * Start event loop lag monitoring
   */
  _startEventLoopMonitoring() {
    setInterval(() => {
      const now = Date.now();
      this.eventLoopLag = now - this.lastEventLoopCheck;
      this.lastEventLoopCheck = now;

      // Check event loop lag threshold
      if (this.eventLoopLag > this.config.alertThresholds.eventLoopLag) {
        this._triggerAlert('event_loop_lag', {
          value: this.eventLoopLag,
          threshold: this.config.alertThresholds.eventLoopLag,
        });
      }
    }, 1000); // Check every second
  }

  /**
   * Start periodic metrics collection
   */
  startCollection() {
    if (this.isCollecting) {
      logger.warn('Metrics collection already active');
      return;
    }

    this.isCollecting = true;

    // Run initial collection
    this.collectMetrics();

    // Schedule periodic collection
    this.collectionTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.collectionInterval);

    logger.info('Metrics collection started', {
      interval: this.config.collectionInterval,
    });

    this.emit('collection-started');
  }

  /**
   * Stop periodic metrics collection
   */
  stopCollection() {
    if (!this.isCollecting) {
      return;
    }

    this.isCollecting = false;

    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }

    logger.info('Metrics collection stopped');
    this.emit('collection-stopped');
  }

  /**
   * Collect system metrics
   */
  async collectMetrics() {
    const timestamp = Date.now();

    try {
      // CPU metrics
      const cpuUsage = process.cpuUsage();
      const cpuPercent = this._calculateCpuPercent(cpuUsage);

      // Memory metrics
      const memoryUsage = process.memoryUsage();
      const systemMemory = {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
      };

      // V8 heap statistics
      const heapStats = v8.getHeapStatistics();

      // Event loop lag (already tracked)
      const eventLoopLag = this.eventLoopLag;

      // Active connections (from process handles)
      const activeConnections = this._getActiveConnections();

      // Queue depths (placeholder - would need integration with specific queues)
      const queueDepths = this._getQueueDepths();

      // Store metrics
      this._storeMetric(timestamp, RetentionBucket.ONE_HOUR, 'cpu_percent', cpuPercent);
      this._storeMetric(
        timestamp,
        RetentionBucket.ONE_HOUR,
        'memory_heap_used',
        memoryUsage.heapUsed
      );
      this._storeMetric(
        timestamp,
        RetentionBucket.ONE_HOUR,
        'memory_heap_total',
        memoryUsage.heapTotal
      );
      this._storeMetric(
        timestamp,
        RetentionBucket.ONE_HOUR,
        'memory_external',
        memoryUsage.external
      );
      this._storeMetric(timestamp, RetentionBucket.ONE_HOUR, 'memory_rss', memoryUsage.rss);
      this._storeMetric(
        timestamp,
        RetentionBucket.ONE_HOUR,
        'system_memory_used',
        systemMemory.used
      );
      this._storeMetric(timestamp, RetentionBucket.ONE_HOUR, 'event_loop_lag', eventLoopLag);
      this._storeMetric(
        timestamp,
        RetentionBucket.ONE_HOUR,
        'active_connections',
        activeConnections
      );
      this._storeMetric(
        timestamp,
        RetentionBucket.ONE_HOUR,
        'heap_size_limit',
        heapStats.heap_size_limit
      );
      this._storeMetric(
        timestamp,
        RetentionBucket.ONE_HOUR,
        'total_heap_size',
        heapStats.total_heap_size
      );

      // Check thresholds
      this._checkThresholds({
        cpu: cpuPercent,
        memory: memoryUsage.heapUsed,
        eventLoopLag,
        activeConnections,
      });

      // Emit metrics event
      this.emit('metrics-collected', {
        timestamp,
        cpu: cpuPercent,
        memory: memoryUsage,
        systemMemory,
        eventLoopLag,
        activeConnections,
        queueDepths,
      });

      logger.debug('Metrics collected', {
        cpu: cpuPercent.toFixed(1),
        memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        eventLoopLag,
      });
    } catch (error) {
      logger.error('Failed to collect metrics', { error: error.message });
    }
  }

  /**
   * Calculate CPU usage percentage
   * @param {Object} cpuUsage - CPU usage from process.cpuUsage()
   * @returns {number} CPU percentage
   */
  _calculateCpuPercent(cpuUsage) {
    if (!this.previousCpuUsage) {
      this.previousCpuUsage = cpuUsage;
      this.previousCpuTime = Date.now();
      return 0;
    }

    const now = Date.now();
    const timeDiff = now - this.previousCpuTime;

    if (timeDiff === 0) return 0;

    const userDiff = cpuUsage.user - this.previousCpuUsage.user;
    const systemDiff = cpuUsage.system - this.previousCpuUsage.system;

    const totalDiff = userDiff + systemDiff;
    const cpuPercent = (totalDiff / (timeDiff * 1000)) * 100;

    this.previousCpuUsage = cpuUsage;
    this.previousCpuTime = now;

    return Math.min(cpuPercent, 100);
  }

  /**
   * Get active connections count
   * @returns {number} Active connection count
   */
  _getActiveConnections() {
    try {
      // This is a placeholder - would need actual connection tracking
      // In real implementation, integrate with WebSocket server, DB connections, etc.
      return process._getActiveHandles ? process._getActiveHandles().length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get queue depths
   * @returns {Object} Queue depths by queue name
   */
  _getQueueDepths() {
    // Placeholder - integrate with actual queue systems
    return {};
  }

  /**
   * Store metric in database
   * @param {number} timestamp - Metric timestamp
   * @param {string} bucket - Retention bucket
   * @param {string} type - Metric type
   * @param {number} value - Metric value
   * @param {Object} metadata - Optional metadata
   */
  _storeMetric(timestamp, bucket, type, value, metadata = null) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO metrics (timestamp, bucket, metric_type, metric_value, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(timestamp, bucket, type, value, metadata ? JSON.stringify(metadata) : null);
    } catch (error) {
      logger.error('Failed to store metric', {
        type,
        error: error.message,
      });
    }
  }

  /**
   * Check metric thresholds and trigger alerts
   * @param {Object} metrics - Current metrics
   */
  _checkThresholds(metrics) {
    // CPU threshold
    if (metrics.cpu > this.config.alertThresholds.cpu) {
      this._triggerAlert('cpu_high', {
        value: metrics.cpu,
        threshold: this.config.alertThresholds.cpu,
      });
    } else {
      this._clearAlert('cpu_high');
    }

    // Memory threshold
    if (metrics.memory > this.config.alertThresholds.memory) {
      this._triggerAlert('memory_high', {
        value: metrics.memory,
        threshold: this.config.alertThresholds.memory,
      });
    } else {
      this._clearAlert('memory_high');
    }
  }

  /**
   * Trigger an alert
   * @param {string} alertType - Alert type
   * @param {Object} data - Alert data
   */
  _triggerAlert(alertType, data) {
    if (!this.activeAlerts.has(alertType)) {
      this.activeAlerts.set(alertType, {
        type: alertType,
        startTime: Date.now(),
        data,
      });

      this.emit('alert-triggered', {
        type: alertType,
        ...data,
      });

      logger.warn('Alert triggered', {
        type: alertType,
        ...data,
      });
    }
  }

  /**
   * Clear an alert
   * @param {string} alertType - Alert type
   */
  _clearAlert(alertType) {
    if (this.activeAlerts.has(alertType)) {
      const alert = this.activeAlerts.get(alertType);
      this.activeAlerts.delete(alertType);

      this.emit('alert-cleared', {
        type: alertType,
        duration: Date.now() - alert.startTime,
      });

      logger.info('Alert cleared', {
        type: alertType,
        duration: Date.now() - alert.startTime,
      });
    }
  }

  /**
   * Get metrics for a time range
   * @param {Object} options - Query options
   * @returns {Array} Metrics
   */
  getMetrics(options = {}) {
    const {
      metricType,
      startTime = Date.now() - 3600000, // 1 hour default
      endTime = Date.now(),
      bucket = RetentionBucket.ONE_HOUR,
      limit = 1000,
    } = options;

    try {
      let query = `
        SELECT timestamp, metric_type, metric_value, metadata
        FROM metrics
        WHERE timestamp >= ? AND timestamp <= ?
      `;

      const params = [startTime, endTime];

      if (bucket) {
        query += ` AND bucket = ?`;
        params.push(bucket);
      }

      if (metricType) {
        query += ` AND metric_type = ?`;
        params.push(metricType);
      }

      query += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);

      const rows = this.db.prepare(query).all(...params);

      return rows.map((row) => ({
        timestamp: row.timestamp,
        type: row.metric_type,
        value: row.metric_value,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      }));
    } catch (error) {
      logger.error('Failed to get metrics', { error: error.message });
      return [];
    }
  }

  /**
   * Get metrics statistics
   * @param {Object} options - Query options
   * @returns {Object} Statistics
   */
  getStatistics(options = {}) {
    const {
      metricType,
      timeWindow = 3600000, // 1 hour default
    } = options;

    const startTime = Date.now() - timeWindow;

    try {
      const query = metricType
        ? `
          SELECT
            AVG(metric_value) as avg,
            MIN(metric_value) as min,
            MAX(metric_value) as max,
            COUNT(*) as count
          FROM metrics
          WHERE metric_type = ? AND timestamp >= ?
        `
        : `
          SELECT
            metric_type,
            AVG(metric_value) as avg,
            MIN(metric_value) as min,
            MAX(metric_value) as max,
            COUNT(*) as count
          FROM metrics
          WHERE timestamp >= ?
          GROUP BY metric_type
        `;

      const params = metricType ? [metricType, startTime] : [startTime];
      const rows = this.db.prepare(query).all(...params);

      if (metricType) {
        const row = rows[0];
        return row
          ? {
              type: metricType,
              avg: row.avg,
              min: row.min,
              max: row.max,
              count: row.count,
            }
          : null;
      } else {
        return rows.reduce((acc, row) => {
          acc[row.metric_type] = {
            avg: row.avg,
            min: row.min,
            max: row.max,
            count: row.count,
          };
          return acc;
        }, {});
      }
    } catch (error) {
      logger.error('Failed to get metrics statistics', { error: error.message });
      return null;
    }
  }

  /**
   * Cleanup old metrics based on retention policy
   */
  async cleanupOldMetrics() {
    try {
      const now = Date.now();

      for (const [bucket, retention] of Object.entries(this.config.retentionPeriods)) {
        const cutoffTime = now - retention;

        const result = this.db
          .prepare(
            `
          DELETE FROM metrics
          WHERE bucket = ? AND timestamp < ?
        `
          )
          .run(bucket, cutoffTime);

        logger.info('Old metrics cleaned up', {
          bucket,
          deletedCount: result.changes,
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old metrics', { error: error.message });
    }
  }

  /**
   * Stop metrics collector
   */
  async stop() {
    this.stopCollection();

    // Cleanup old metrics before shutdown
    await this.cleanupOldMetrics();

    // Close database
    if (this.db) {
      this.db.close();
    }

    logger.info('MetricsCollector stopped');
  }
}

export default MetricsCollector;
