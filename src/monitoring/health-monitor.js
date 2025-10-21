/**
 * Health Monitor
 * Performs periodic health checks on system components and tracks overall health
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import http from 'http';
import https from 'https';

/**
 * Health status levels
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
};

/**
 * Component types for health monitoring
 */
export const ComponentType = {
  AI_BRIDGE: 'ai_bridge',
  AGENT: 'agent',
  DATABASE: 'database',
  EXTERNAL_API: 'external_api',
  SYSTEM: 'system',
};

/**
 * HealthMonitor class
 * Orchestrates periodic health checks across all system components
 */
export class HealthMonitor extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      checkInterval: config.checkInterval || 30000, // 30 seconds
      healthTimeout: config.healthTimeout || 5000, // 5 seconds
      degradedThreshold: config.degradedThreshold || 0.7, // 70% = degraded
      downThreshold: config.downThreshold || 0.3, // 30% = down
      componentWeights: {
        [ComponentType.AI_BRIDGE]: 0.4,
        [ComponentType.AGENT]: 0.3,
        [ComponentType.DATABASE]: 0.2,
        [ComponentType.EXTERNAL_API]: 0.1,
      },
      ...config,
    };

    // Registered components for health monitoring
    this.components = new Map();

    // Health history
    this.healthHistory = [];
    this.maxHistorySize = 100;

    // Monitoring state
    this.isMonitoring = false;
    this.checkTimer = null;

    // Current aggregated health
    this.currentHealth = {
      status: HealthStatus.HEALTHY,
      score: 1.0,
      timestamp: Date.now(),
      components: {},
    };
  }

  /**
   * Initialize health monitor
   */
  async initialize() {
    logger.info('HealthMonitor initialized', {
      checkInterval: this.config.checkInterval,
      healthTimeout: this.config.healthTimeout,
    });

    this.emit('initialized');
  }

  /**
   * Register a component for health monitoring
   * @param {string} id - Unique component identifier
   * @param {Object} component - Component configuration
   */
  registerComponent(id, component) {
    this.components.set(id, {
      id,
      type: component.type || ComponentType.AGENT,
      healthCheck: component.healthCheck, // Function or URL
      weight: component.weight || this.config.componentWeights[component.type] || 0.1,
      lastCheck: null,
      lastStatus: null,
      consecutiveFailures: 0,
      enabled: component.enabled !== false,
    });

    logger.info('Component registered for health monitoring', {
      id,
      type: component.type,
      weight: this.components.get(id).weight,
    });

    this.emit('component-registered', { id, component });
  }

  /**
   * Unregister a component
   * @param {string} id - Component identifier
   */
  unregisterComponent(id) {
    if (this.components.has(id)) {
      this.components.delete(id);
      logger.info('Component unregistered', { id });
      this.emit('component-unregistered', { id });
    }
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('Health monitoring already active');
      return;
    }

    this.isMonitoring = true;

    // Run initial check
    this.performHealthCheck();

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkInterval);

    logger.info('Health monitoring started', {
      interval: this.config.checkInterval,
    });

    this.emit('monitoring-started');
  }

  /**
   * Stop periodic health monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    logger.info('Health monitoring stopped');
    this.emit('monitoring-stopped');
  }

  /**
   * Perform health check on all components
   */
  async performHealthCheck() {
    const checkStartTime = Date.now();

    logger.debug('Performing system health check');

    const componentResults = {};

    // Check all enabled components in parallel
    const checks = Array.from(this.components.entries())
      .filter(([_, component]) => component.enabled)
      .map(async ([id, component]) => {
        try {
          const result = await this._checkComponent(component);
          componentResults[id] = result;

          // Update component state
          component.lastCheck = Date.now();
          component.lastStatus = result.status;

          if (result.status === HealthStatus.DOWN) {
            component.consecutiveFailures++;
          } else {
            component.consecutiveFailures = 0;
          }

          // Emit component health event
          this.emit('component-health', {
            id,
            ...result,
          });

          return { id, result };
        } catch (error) {
          logger.error('Component health check failed', {
            component: id,
            error: error.message,
          });

          component.consecutiveFailures++;

          const failureResult = {
            status: HealthStatus.DOWN,
            latency: -1,
            error: error.message,
            timestamp: Date.now(),
          };

          componentResults[id] = failureResult;

          this.emit('component-health', {
            id,
            ...failureResult,
          });

          return { id, result: failureResult };
        }
      });

    await Promise.all(checks);

    // Calculate aggregated health score
    const aggregatedHealth = this._calculateAggregatedHealth(componentResults);

    // Update current health
    const previousHealth = this.currentHealth;
    this.currentHealth = {
      ...aggregatedHealth,
      timestamp: Date.now(),
      checkDuration: Date.now() - checkStartTime,
    };

    // Record in history
    this._recordHealth(this.currentHealth);

    // Emit health update
    this.emit('health-update', this.currentHealth);

    // Detect status changes
    if (previousHealth.status !== this.currentHealth.status) {
      this.emit('health-status-change', {
        from: previousHealth.status,
        to: this.currentHealth.status,
        score: this.currentHealth.score,
      });

      logger.warn('System health status changed', {
        from: previousHealth.status,
        to: this.currentHealth.status,
        score: this.currentHealth.score,
      });
    }

    logger.debug('Health check completed', {
      status: this.currentHealth.status,
      score: this.currentHealth.score,
      duration: this.currentHealth.checkDuration,
    });
  }

  /**
   * Check individual component health
   * @param {Object} component - Component configuration
   * @returns {Promise<Object>} Health check result
   */
  async _checkComponent(component) {
    const startTime = Date.now();

    try {
      let healthResult;

      if (typeof component.healthCheck === 'function') {
        // Function-based health check
        healthResult = await Promise.race([
          component.healthCheck(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), this.config.healthTimeout)
          ),
        ]);
      } else if (typeof component.healthCheck === 'string') {
        // URL-based health check
        healthResult = await this._checkHttpEndpoint(component.healthCheck);
      } else {
        throw new Error('Invalid health check configuration');
      }

      const latency = Date.now() - startTime;

      // Normalize health result
      const status = healthResult.status || HealthStatus.HEALTHY;

      return {
        status,
        latency,
        details: healthResult.details || {},
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        status: HealthStatus.DOWN,
        latency: Date.now() - startTime,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check HTTP/HTTPS endpoint health
   * @param {string} url - Endpoint URL
   * @returns {Promise<Object>} Health result
   */
  _checkHttpEndpoint(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const startTime = Date.now();

      const request = client.get(url, { timeout: this.config.healthTimeout }, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          const latency = Date.now() - startTime;

          if (response.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              resolve({
                status: parsed.status || HealthStatus.HEALTHY,
                latency,
                details: parsed,
              });
            } catch {
              // Plain text response
              resolve({
                status: HealthStatus.HEALTHY,
                latency,
                details: { response: data },
              });
            }
          } else {
            reject(new Error(`HTTP ${response.statusCode}`));
          }
        });
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Calculate aggregated health from component results
   * @param {Object} componentResults - Component health results
   * @returns {Object} Aggregated health
   */
  _calculateAggregatedHealth(componentResults) {
    let totalWeight = 0;
    let weightedScore = 0;

    const components = {};

    for (const [id, component] of this.components.entries()) {
      if (!component.enabled || !componentResults[id]) continue;

      const result = componentResults[id];

      // Convert status to score
      let componentScore = 0;
      if (result.status === HealthStatus.HEALTHY) {
        componentScore = 1.0;
      } else if (result.status === HealthStatus.DEGRADED) {
        componentScore = 0.5;
      } else {
        componentScore = 0;
      }

      weightedScore += componentScore * component.weight;
      totalWeight += component.weight;

      components[id] = {
        status: result.status,
        score: componentScore,
        latency: result.latency,
        consecutiveFailures: component.consecutiveFailures,
        lastCheck: component.lastCheck,
      };
    }

    // Calculate overall score
    const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Determine overall status
    let status;
    if (score >= this.config.degradedThreshold) {
      status = HealthStatus.HEALTHY;
    } else if (score >= this.config.downThreshold) {
      status = HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.DOWN;
    }

    return {
      status,
      score,
      components,
    };
  }

  /**
   * Record health in history
   * @param {Object} health - Health snapshot
   */
  _recordHealth(health) {
    this.healthHistory.push(health);

    // Trim history
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }
  }

  /**
   * Get current health status
   * @returns {Object} Current health
   */
  getCurrentHealth() {
    return { ...this.currentHealth };
  }

  /**
   * Get health statistics
   * @param {Object} options - Query options
   * @returns {Object} Statistics
   */
  getStatistics(options = {}) {
    const timeWindow = options.timeWindow || 3600000; // 1 hour default
    const windowStart = Date.now() - timeWindow;

    const windowHealth = this.healthHistory.filter((h) => h.timestamp >= windowStart);

    if (windowHealth.length === 0) {
      return {
        timeWindow,
        dataPoints: 0,
        averageScore: 0,
        uptimePercentage: 0,
        componentStats: {},
      };
    }

    const healthyCount = windowHealth.filter((h) => h.status === HealthStatus.HEALTHY).length;
    const degradedCount = windowHealth.filter((h) => h.status === HealthStatus.DEGRADED).length;
    const downCount = windowHealth.filter((h) => h.status === HealthStatus.DOWN).length;

    const averageScore = windowHealth.reduce((sum, h) => sum + h.score, 0) / windowHealth.length;

    // Component-specific stats
    const componentStats = {};
    for (const [id, component] of this.components.entries()) {
      if (!component.enabled) continue;

      const componentHealth = windowHealth.map((h) => h.components[id]).filter((c) => c);

      if (componentHealth.length > 0) {
        const componentHealthyCount = componentHealth.filter(
          (c) => c.status === HealthStatus.HEALTHY
        ).length;

        componentStats[id] = {
          type: component.type,
          uptime: componentHealthyCount / componentHealth.length,
          averageLatency:
            componentHealth.filter((c) => c.latency >= 0).reduce((sum, c) => sum + c.latency, 0) /
            Math.max(componentHealth.length, 1),
          consecutiveFailures: component.consecutiveFailures,
          lastCheck: component.lastCheck,
          lastStatus: component.lastStatus,
        };
      }
    }

    return {
      timeWindow,
      dataPoints: windowHealth.length,
      averageScore,
      uptimePercentage: healthyCount / windowHealth.length,
      statusDistribution: {
        healthy: healthyCount,
        degraded: degradedCount,
        down: downCount,
      },
      componentStats,
    };
  }

  /**
   * Stop health monitor
   */
  async stop() {
    this.stopMonitoring();
    logger.info('HealthMonitor stopped');
  }
}

export default HealthMonitor;
