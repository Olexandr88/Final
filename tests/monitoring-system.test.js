/**
 * Monitoring System Tests
 * Comprehensive test suite for error detection, autofix, health monitoring, and metrics collection
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorDetector, ErrorSeverity, ErrorCategory } from '../src/monitoring/error-detector.js';
import { AutofixEngine, StrategyResult } from '../src/monitoring/autofix-engine.js';
import { HealthMonitor, HealthStatus, ComponentType } from '../src/monitoring/health-monitor.js';
import { MetricsCollector } from '../src/monitoring/metrics-collector.js';
import { MonitoringCoordinator } from '../src/monitoring/monitoring-coordinator.js';
import fs from 'fs/promises';
import path from 'path';

// Test database paths
const TEST_ERROR_DB = path.join(process.cwd(), 'data', 'test-errors.db');
const TEST_METRICS_DB = path.join(process.cwd(), 'data', 'test-metrics.db');

describe('ErrorDetector', () => {
  let errorDetector;

  before(async () => {
    errorDetector = new ErrorDetector({
      dbPath: TEST_ERROR_DB,
      errorStormThreshold: 5,
    });
    await errorDetector.initialize();
  });

  after(async () => {
    await errorDetector.stop();
    // Cleanup test database
    try {
      await fs.unlink(TEST_ERROR_DB);
    } catch {}
  });

  describe('Error Classification', () => {
    it('should classify network errors correctly', () => {
      const error = new Error('ECONNREFUSED: connection refused');
      const classified = errorDetector.classifyError(error);

      assert.strictEqual(classified.category, ErrorCategory.NETWORK);
      assert.strictEqual(classified.severity, ErrorSeverity.MEDIUM);
    });

    it('should classify database errors correctly', () => {
      const error = new Error('SQLite database locked');
      const classified = errorDetector.classifyError(error);

      assert.strictEqual(classified.category, ErrorCategory.DATABASE);
      assert.strictEqual(classified.severity, ErrorSeverity.HIGH);
    });

    it('should classify resource errors as critical', () => {
      const error = new Error('Out of memory: heap allocation failed');
      const classified = errorDetector.classifyError(error);

      assert.strictEqual(classified.category, ErrorCategory.RESOURCE);
      assert.strictEqual(classified.severity, ErrorSeverity.CRITICAL);
    });

    it('should classify circuit breaker errors', () => {
      const error = new Error('Circuit breaker open - cloud endpoint unavailable');
      const classified = errorDetector.classifyError(error);

      assert.strictEqual(classified.category, ErrorCategory.CIRCUIT_BREAKER);
    });
  });

  describe('Error Recording', () => {
    it('should record error to database', async () => {
      const error = new Error('Test error');
      const classified = errorDetector.classifyError(error);

      errorDetector.recordError(classified);

      const stats = errorDetector.getStatistics({ timeWindow: 60000 });
      assert.ok(stats.total >= 1, 'Should have at least 1 error recorded');
    });

    it('should track recent errors in memory', () => {
      const error = new Error('Memory tracked error');
      const classified = errorDetector.classifyError(error);

      const initialCount = errorDetector.recentErrors.length;
      errorDetector.recordError(classified);

      assert.strictEqual(errorDetector.recentErrors.length, initialCount + 1);
    });
  });

  describe('Pattern Detection', () => {
    it('should detect error patterns', async () => {
      let patternDetected = false;

      errorDetector.once('pattern-detected', (pattern) => {
        patternDetected = true;
        assert.ok(pattern.count >= 3);
      });

      // Generate pattern (3+ identical errors)
      for (let i = 0; i < 4; i++) {
        const error = new Error('Repeated pattern error');
        const classified = errorDetector.classifyError(error);
        errorDetector.recordError(classified);
      }

      // Wait for pattern detection
      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(patternDetected, 'Pattern should be detected');
    });
  });

  describe('Error Storm Detection', () => {
    it('should detect error storm', async () => {
      let stormDetected = false;

      errorDetector.once('error-storm-start', (data) => {
        stormDetected = true;
        assert.ok(data.errorCount >= errorDetector.config.errorStormThreshold);
      });

      // Generate error storm (5+ errors in quick succession)
      for (let i = 0; i < 6; i++) {
        const error = new Error(`Storm error ${i}`);
        const classified = errorDetector.classifyError(error);
        errorDetector.recordError(classified);
      }

      assert.ok(stormDetected, 'Error storm should be detected');
    });
  });
});

describe('AutofixEngine', () => {
  let autofixEngine;

  before(async () => {
    autofixEngine = new AutofixEngine({
      enabled: true,
      maxConcurrentFixes: 2,
    });
    await autofixEngine.initialize();
  });

  after(async () => {
    await autofixEngine.stop();
  });

  describe('Strategy Selection', () => {
    it('should select correct strategy for network error', async () => {
      const error = {
        category: ErrorCategory.NETWORK,
        message: 'Connection timeout',
        severity: ErrorSeverity.MEDIUM,
      };

      const context = {
        reconnect: async () => {
          return true;
        },
      };

      const result = await autofixEngine.attemptFix(error, context);

      assert.ok(
        result.status === StrategyResult.SUCCESS || result.status === StrategyResult.FAILED
      );
    });

    it('should skip autofix when disabled', async () => {
      autofixEngine.disable();

      const error = {
        category: ErrorCategory.NETWORK,
        message: 'Test error',
      };

      const result = await autofixEngine.attemptFix(error, {});

      assert.strictEqual(result.status, StrategyResult.SKIPPED);
      assert.ok(result.details.includes('disabled'));

      autofixEngine.enable();
    });
  });

  describe('Statistics', () => {
    it('should track autofix statistics', () => {
      const stats = autofixEngine.getStatistics();

      assert.ok(typeof stats.totalFixes === 'number');
      assert.ok(typeof stats.successful === 'number');
      assert.ok(typeof stats.failed === 'number');
      assert.ok(typeof stats.successRate === 'number');
      assert.ok(stats.strategyStats);
    });
  });
});

describe('HealthMonitor', () => {
  let healthMonitor;

  before(async () => {
    healthMonitor = new HealthMonitor({
      checkInterval: 5000,
    });
    await healthMonitor.initialize();
  });

  after(async () => {
    await healthMonitor.stop();
  });

  describe('Component Registration', () => {
    it('should register a component', () => {
      healthMonitor.registerComponent('test-component', {
        type: ComponentType.AGENT,
        healthCheck: async () => ({ status: HealthStatus.HEALTHY }),
        weight: 0.5,
      });

      assert.ok(healthMonitor.components.has('test-component'));
    });

    it('should unregister a component', () => {
      healthMonitor.registerComponent('temp-component', {
        type: ComponentType.AGENT,
        healthCheck: async () => ({ status: HealthStatus.HEALTHY }),
      });

      assert.ok(healthMonitor.components.has('temp-component'));

      healthMonitor.unregisterComponent('temp-component');

      assert.ok(!healthMonitor.components.has('temp-component'));
    });
  });

  describe('Health Checks', () => {
    it('should perform health check', async () => {
      healthMonitor.registerComponent('healthy-component', {
        type: ComponentType.AGENT,
        healthCheck: async () => ({ status: HealthStatus.HEALTHY }),
      });

      await healthMonitor.performHealthCheck();

      const currentHealth = healthMonitor.getCurrentHealth();

      assert.ok(currentHealth);
      assert.ok(currentHealth.status);
      assert.ok(typeof currentHealth.score === 'number');
    });

    it('should detect unhealthy components', async () => {
      healthMonitor.registerComponent('unhealthy-component', {
        type: ComponentType.AGENT,
        healthCheck: async () => ({ status: HealthStatus.DOWN }),
      });

      await healthMonitor.performHealthCheck();

      const currentHealth = healthMonitor.getCurrentHealth();

      assert.ok(currentHealth.score < 1.0, 'Health score should be reduced');
    });
  });

  describe('Health Statistics', () => {
    it('should provide health statistics', async () => {
      const stats = healthMonitor.getStatistics();

      assert.ok(stats);
      assert.ok(typeof stats.dataPoints === 'number');
      assert.ok(typeof stats.averageScore === 'number');
      assert.ok(typeof stats.uptimePercentage === 'number');
    });
  });
});

describe('MetricsCollector', () => {
  let metricsCollector;

  before(async () => {
    metricsCollector = new MetricsCollector({
      dbPath: TEST_METRICS_DB,
      collectionInterval: 2000, // 2 seconds for testing
    });
    await metricsCollector.initialize();
  });

  after(async () => {
    await metricsCollector.stop();
    // Cleanup test database
    try {
      await fs.unlink(TEST_METRICS_DB);
    } catch {}
  });

  describe('Metrics Collection', () => {
    it('should collect metrics', async () => {
      await metricsCollector.collectMetrics();

      const metrics = metricsCollector.getMetrics({
        metricType: 'cpu_percent',
        limit: 1,
      });

      assert.ok(metrics.length > 0, 'Should have collected CPU metrics');
    });

    it('should collect multiple metric types', async () => {
      await metricsCollector.collectMetrics();

      const stats = metricsCollector.getStatistics();

      assert.ok(stats);
      assert.ok(stats.cpu_percent);
      assert.ok(stats.memory_heap_used);
      assert.ok(stats.event_loop_lag);
    });
  });

  describe('Alert Thresholds', () => {
    it('should trigger alert on threshold breach', async () => {
      let alertTriggered = false;

      metricsCollector.once('alert-triggered', (alert) => {
        alertTriggered = true;
        assert.ok(alert.type);
        assert.ok(alert.value);
        assert.ok(alert.threshold);
      });

      // Simulate threshold breach
      metricsCollector._triggerAlert('test_alert', {
        value: 100,
        threshold: 80,
      });

      assert.ok(alertTriggered, 'Alert should be triggered');
    });
  });
});

describe('MonitoringCoordinator', () => {
  let coordinator;

  before(async () => {
    coordinator = new MonitoringCoordinator({
      errorDbPath: TEST_ERROR_DB,
      metricsDbPath: TEST_METRICS_DB,
      autofixEnabled: true,
    });
    await coordinator.initialize();
  });

  after(async () => {
    await coordinator.stop();
    // Cleanup test databases
    try {
      await fs.unlink(TEST_ERROR_DB);
      await fs.unlink(TEST_METRICS_DB);
    } catch {}
  });

  describe('Initialization', () => {
    it('should initialize all subsystems', () => {
      assert.ok(coordinator.errorDetector);
      assert.ok(coordinator.autofixEngine);
      assert.ok(coordinator.healthMonitor);
      assert.ok(coordinator.metricsCollector);
    });
  });

  describe('System Status', () => {
    it('should provide comprehensive system status', () => {
      const status = coordinator.getSystemStatus();

      assert.ok(status);
      assert.ok(typeof status.isRunning === 'boolean');
      assert.ok(status.health);
      assert.ok(status.errors);
      assert.ok(status.autofixes);
      assert.ok(status.metrics);
    });
  });

  describe('Dashboard Data', () => {
    it('should provide dashboard data', () => {
      const data = coordinator.getDashboardData();

      assert.ok(data);
      assert.ok(Array.isArray(data.recentErrors));
      assert.ok(Array.isArray(data.recentFixes));
      assert.ok(Array.isArray(data.activeAlerts));
      assert.ok(data.recentMetrics);
    });
  });

  describe('Start/Stop', () => {
    it('should start monitoring systems', async () => {
      await coordinator.start();
      assert.ok(coordinator.isRunning);
    });

    it('should stop monitoring systems', async () => {
      await coordinator.stop();
      assert.ok(!coordinator.isRunning);
    });
  });
});
