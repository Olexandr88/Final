/**
 * Monitoring Coordinator
 * Orchestrates ErrorDetector, AutofixEngine, HealthMonitor, and MetricsCollector
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { ErrorDetector } from './error-detector.js';
import { AutofixEngine } from './autofix-engine.js';
import { HealthMonitor, ComponentType } from './health-monitor.js';
import { MetricsCollector } from './metrics-collector.js';

/**
 * MonitoringCoordinator class
 * Central orchestrator for all monitoring and autofix systems
 */
export class MonitoringCoordinator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      autofixEnabled: config.autofixEnabled !== false,
      errorDbPath: config.errorDbPath,
      metricsDbPath: config.metricsDbPath,
      ...config,
    };

    // Initialize subsystems
    this.errorDetector = new ErrorDetector({
      dbPath: this.config.errorDbPath,
      ...config.errorDetector,
    });

    this.autofixEngine = new AutofixEngine({
      enabled: this.config.autofixEnabled,
      ...config.autofixEngine,
    });

    this.healthMonitor = new HealthMonitor({
      ...config.healthMonitor,
    });

    this.metricsCollector = new MetricsCollector({
      dbPath: this.config.metricsDbPath,
      ...config.metricsCollector,
    });

    // Integration state
    this.isRunning = false;

    // WebSocket client for AI Bridge integration (optional)
    this.wsClient = null;
  }

  /**
   * Initialize all monitoring subsystems
   */
  async initialize() {
    try {
      logger.info('Initializing MonitoringCoordinator');

      // Initialize all subsystems in parallel
      await Promise.all([
        this.errorDetector.initialize(),
        this.autofixEngine.initialize(),
        this.healthMonitor.initialize(),
        this.metricsCollector.initialize(),
      ]);

      // Set up event handlers for integration
      this._setupEventHandlers();

      logger.info('MonitoringCoordinator initialized successfully');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize MonitoringCoordinator', { error: error.message });
      throw error;
    }
  }

  /**
   * Set up event handlers for subsystem integration
   */
  _setupEventHandlers() {
    // ErrorDetector → AutofixEngine integration
    this.errorDetector.on('error-detected', async (error) => {
      // Emit to external listeners
      this.emit('error-detected', error);

      // Attempt autofix if enabled
      if (this.config.autofixEnabled && error.severity !== 'low') {
        try {
          const fixResult = await this.autofixEngine.attemptFix(error, this._buildFixContext());

          if (fixResult.status === 'success') {
            // Mark error as resolved in ErrorDetector
            // Note: Would need error ID from ErrorDetector.recordError() return value
            logger.info('Error automatically fixed', {
              error: error.message,
              strategy: fixResult.strategy,
            });
          }
        } catch (fixError) {
          logger.error('Autofix attempt failed', {
            error: error.message,
            fixError: fixError.message,
          });
        }
      }
    });

    // ErrorDetector → HealthMonitor integration
    this.errorDetector.on('error-storm-start', (data) => {
      this.emit('error-storm', data);
      logger.error('Error storm detected', data);
    });

    this.errorDetector.on('pattern-detected', (pattern) => {
      this.emit('error-pattern', pattern);
      logger.warn('Error pattern detected', pattern);
    });

    // AutofixEngine events
    this.autofixEngine.on('fix-success', (fix) => {
      this.emit('autofix-success', fix);
      logger.info('Autofix successful', {
        fixId: fix.fixId,
        strategy: fix.strategy,
        duration: fix.duration,
      });
    });

    this.autofixEngine.on('fix-failure', (fix) => {
      this.emit('autofix-failure', fix);
      logger.warn('Autofix failed', {
        fixId: fix.fixId,
        error: fix.error.message,
      });
    });

    // HealthMonitor events
    this.healthMonitor.on('health-status-change', (change) => {
      this.emit('health-status-change', change);
      logger.warn('System health status changed', change);
    });

    this.healthMonitor.on('component-health', (health) => {
      // Broadcast component health updates
      this.emit('component-health', health);
    });

    // MetricsCollector events
    this.metricsCollector.on('alert-triggered', (alert) => {
      this.emit('metric-alert', alert);
      logger.warn('Metric alert triggered', alert);
    });

    this.metricsCollector.on('metrics-collected', (metrics) => {
      // Broadcast metrics (throttled via collection interval)
      this.emit('metrics-update', metrics);
    });

    logger.info('Event handlers configured for subsystem integration');
  }

  /**
   * Build fix context for AutofixEngine
   * @returns {Object} Context with utility functions
   */
  _buildFixContext() {
    return {
      // WebSocket reconnection
      wsClient: this.wsClient,
      reconnect: async () => {
        if (this.wsClient && typeof this.wsClient.connect === 'function') {
          await this.wsClient.connect();
        }
      },

      // Health check
      healthCheck: async () => {
        await this.healthMonitor.performHealthCheck();
        return this.healthMonitor.getCurrentHealth();
      },

      // Circuit breaker reset (placeholder - needs actual circuit breaker instance)
      resetCircuitBreaker: async () => {
        logger.info('Circuit breaker reset requested');
        // Would need access to actual circuit breaker instances
      },

      // Cache clearing
      clearCaches: async () => {
        logger.info('Cache clearing requested');
        // Would integrate with actual cache instances
      },

      // Connection pool management
      drainPools: async () => {
        logger.info('Connection pool drain requested');
        // Would integrate with actual connection pools
      },

      pool: {
        drain: async () => {},
        clear: async () => {},
        init: async () => {},
      },
    };
  }

  /**
   * Start all monitoring systems
   */
  async start() {
    if (this.isRunning) {
      logger.warn('MonitoringCoordinator already running');
      return;
    }

    try {
      logger.info('Starting MonitoringCoordinator');

      // Start health monitoring
      this.healthMonitor.startMonitoring();

      // Start metrics collection
      this.metricsCollector.startCollection();

      this.isRunning = true;

      logger.info('MonitoringCoordinator started successfully');
      this.emit('started');
    } catch (error) {
      logger.error('Failed to start MonitoringCoordinator', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop all monitoring systems
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping MonitoringCoordinator');

      // Stop health monitoring
      this.healthMonitor.stopMonitoring();

      // Stop metrics collection
      this.metricsCollector.stopCollection();

      // Stop all subsystems
      await Promise.all([
        this.errorDetector.stop(),
        this.autofixEngine.stop(),
        this.healthMonitor.stop(),
        this.metricsCollector.stop(),
      ]);

      this.isRunning = false;

      logger.info('MonitoringCoordinator stopped successfully');
      this.emit('stopped');
    } catch (error) {
      logger.error('Error stopping MonitoringCoordinator', { error: error.message });
      throw error;
    }
  }

  /**
   * Register a component for health monitoring
   * @param {string} id - Component identifier
   * @param {Object} component - Component configuration
   */
  registerComponent(id, component) {
    this.healthMonitor.registerComponent(id, component);
  }

  /**
   * Unregister a component from health monitoring
   * @param {string} id - Component identifier
   */
  unregisterComponent(id) {
    this.healthMonitor.unregisterComponent(id);
  }

  /**
   * Attach WebSocket client for AI Bridge integration
   * @param {Object} wsClient - WebSocket client instance
   */
  attachWebSocketClient(wsClient) {
    this.wsClient = wsClient;
    logger.info('WebSocket client attached to MonitoringCoordinator');
  }

  /**
   * Get comprehensive system status
   * @returns {Object} Complete system status
   */
  getSystemStatus() {
    const errorStats = this.errorDetector.getStatistics();
    const autofixStats = this.autofixEngine.getStatistics();
    const healthStats = this.healthMonitor.getStatistics();
    const metricsStats = this.metricsCollector.getStatistics();
    const currentHealth = this.healthMonitor.getCurrentHealth();

    return {
      timestamp: Date.now(),
      isRunning: this.isRunning,
      health: currentHealth,
      errors: errorStats,
      autofixes: autofixStats,
      healthMonitoring: healthStats,
      metrics: metricsStats,
    };
  }

  /**
   * Get real-time dashboard data
   * @returns {Object} Dashboard data
   */
  getDashboardData() {
    const systemStatus = this.getSystemStatus();

    // Recent errors (last 10)
    const recentErrors = this.errorDetector.recentErrors.slice(-10).reverse();

    // Recent autofixes (last 10)
    const recentFixes = this.autofixEngine.fixHistory.slice(-10).reverse();

    // Active alerts
    const activeAlerts = Array.from(this.metricsCollector.activeAlerts.values());

    // Recent metrics (last 60 data points = 10 minutes at 10s interval)
    const recentMetrics = {
      cpu: this.metricsCollector
        .getMetrics({
          metricType: 'cpu_percent',
          limit: 60,
        })
        .reverse(),
      memory: this.metricsCollector
        .getMetrics({
          metricType: 'memory_heap_used',
          limit: 60,
        })
        .reverse(),
      eventLoopLag: this.metricsCollector
        .getMetrics({
          metricType: 'event_loop_lag',
          limit: 60,
        })
        .reverse(),
    };

    return {
      ...systemStatus,
      recentErrors,
      recentFixes,
      activeAlerts,
      recentMetrics,
    };
  }

  /**
   * Broadcast system status via WebSocket (for dashboard integration)
   */
  broadcastStatus() {
    if (!this.wsClient) {
      return;
    }

    try {
      const dashboardData = this.getDashboardData();

      // Send via WebSocket if client has send method
      if (typeof this.wsClient.send === 'function') {
        this.wsClient.send(
          JSON.stringify({
            type: 'system.health',
            data: dashboardData,
          })
        );
      }
    } catch (error) {
      logger.error('Failed to broadcast system status', { error: error.message });
    }
  }

  /**
   * Enable autofix engine
   */
  enableAutofix() {
    this.autofixEngine.enable();
    this.config.autofixEnabled = true;
    logger.info('Autofix enabled');
    this.emit('autofix-enabled');
  }

  /**
   * Disable autofix engine
   */
  disableAutofix() {
    this.autofixEngine.disable();
    this.config.autofixEnabled = false;
    logger.info('Autofix disabled');
    this.emit('autofix-disabled');
  }
}

export default MonitoringCoordinator;
