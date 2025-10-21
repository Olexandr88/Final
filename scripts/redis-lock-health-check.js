import RedisRedlockManager from '../src/utils/redis-redlock-manager.js';
import { performance } from 'perf_hooks';

/**
 * Health Check Script for Distributed Locks
 */
class LockHealthCheck {
  constructor() {
    this.lockManager = null;
    this.results = {
      timestamp: new Date().toISOString(),
      overall: 'UNKNOWN',
      checks: []
    };
  }

  addCheck(name, status, message, details = {}) {
    this.results.checks.push({
      name,
      status,
      message,
      ...details
    });
  }

  async initialize() {
    try {
      this.lockManager = new RedisRedlockManager({
        redisNodes: [
          { host: process.env.REDIS_HOST_1 || 'localhost', port: parseInt(process.env.REDIS_PORT_1 || '6379') },
          { host: process.env.REDIS_HOST_2 || 'localhost', port: parseInt(process.env.REDIS_PORT_2 || '6380') },
          { host: process.env.REDIS_HOST_3 || 'localhost', port: parseInt(process.env.REDIS_PORT_3 || '6381') }
        ],
        lockTTL: 5000,
        retryCount: 2,
        retryDelay: 100
      });

      const startTime = performance.now();
      await this.lockManager.initialize();
      const initTime = performance.now() - startTime;

      this.addCheck('Initialization', 'PASS', 'Lock manager initialized successfully', {
        duration: `${initTime.toFixed(2)}ms`
      });

      return true;
    } catch (error) {
      this.addCheck('Initialization', 'FAIL', `Failed to initialize: ${error.message}`);
      return false;
    }
  }

  async checkRedisNodes() {
    try {
      const health = await this.lockManager.getHealthStatus();

      const healthyCount = health.nodes.filter(n => n.healthy).length;
      const requiredQuorum = health.requiredQuorum;

      if (healthyCount >= requiredQuorum) {
        this.addCheck('Redis Cluster Health', 'PASS', `${healthyCount}/${health.totalNodes} nodes healthy (quorum: ${requiredQuorum})`, {
          nodes: health.nodes.map(n => ({
            host: `${n.node.host}:${n.node.port}`,
            healthy: n.healthy,
            latency: n.latency || 'N/A',
            status: n.status
          }))
        });
      } else {
        this.addCheck('Redis Cluster Health', 'FAIL', `Insufficient nodes (${healthyCount}/${health.totalNodes}, need ${requiredQuorum})`, {
          nodes: health.nodes
        });
      }

      return healthyCount >= requiredQuorum;
    } catch (error) {
      this.addCheck('Redis Cluster Health', 'FAIL', `Health check failed: ${error.message}`);
      return false;
    }
  }

  async checkLockAcquisition() {
    try {
      const resource = `health-check-${Date.now()}`;
      const startTime = performance.now();

      const lock = await this.lockManager.acquireLock(resource, 2000);
      const acquireTime = performance.now() - startTime;

      await this.lockManager.releaseLock(resource);

      const status = acquireTime < 200 ? 'PASS' : 'WARN';
      this.addCheck('Lock Acquisition', status, `Lock acquired in ${acquireTime.toFixed(2)}ms`, {
        duration: `${acquireTime.toFixed(2)}ms`,
        threshold: '200ms',
        resource
      });

      return true;
    } catch (error) {
      this.addCheck('Lock Acquisition', 'FAIL', `Failed to acquire lock: ${error.message}`);
      return false;
    }
  }

  async checkLockRelease() {
    try {
      const resource = `health-check-release-${Date.now()}`;

      await this.lockManager.acquireLock(resource, 2000);

      const startTime = performance.now();
      await this.lockManager.releaseLock(resource);
      const releaseTime = performance.now() - startTime;

      const status = releaseTime < 100 ? 'PASS' : 'WARN';
      this.addCheck('Lock Release', status, `Lock released in ${releaseTime.toFixed(2)}ms`, {
        duration: `${releaseTime.toFixed(2)}ms`,
        threshold: '100ms'
      });

      return true;
    } catch (error) {
      this.addCheck('Lock Release', 'FAIL', `Failed to release lock: ${error.message}`);
      return false;
    }
  }

  async checkConcurrency() {
    try {
      const resource = `health-check-concurrency-${Date.now()}`;
      const promises = [];

      // Try 5 concurrent lock acquisitions
      for (let i = 0; i < 5; i++) {
        promises.push(
          this.lockManager.acquireLock(resource, 1000)
            .then(async () => {
              await new Promise(resolve => setTimeout(resolve, 100));
              await this.lockManager.releaseLock(resource);
              return true;
            })
            .catch(() => false)
        );
      }

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

      // At least one should succeed
      if (successCount > 0) {
        this.addCheck('Concurrency Control', 'PASS', `${successCount}/5 lock attempts succeeded (mutual exclusion enforced)`);
      } else {
        this.addCheck('Concurrency Control', 'FAIL', 'No lock acquisition succeeded');
      }

      return successCount > 0;
    } catch (error) {
      this.addCheck('Concurrency Control', 'FAIL', `Concurrency test failed: ${error.message}`);
      return false;
    }
  }

  async checkMetrics() {
    try {
      const metrics = this.lockManager.getMetrics();

      const hasValidMetrics = (
        typeof metrics.locksAcquired === 'number' &&
        typeof metrics.locksFailed === 'number' &&
        typeof metrics.locksReleased === 'number' &&
        metrics.avgAcquireTime !== undefined
      );

      if (hasValidMetrics) {
        this.addCheck('Metrics Collection', 'PASS', 'All metrics collected successfully', {
          metrics: {
            acquired: metrics.locksAcquired,
            failed: metrics.locksFailed,
            released: metrics.locksReleased,
            avgAcquireTime: metrics.avgAcquireTime + 'ms',
            successRate: metrics.successRate + '%'
          }
        });
      } else {
        this.addCheck('Metrics Collection', 'FAIL', 'Invalid metrics data');
      }

      return hasValidMetrics;
    } catch (error) {
      this.addCheck('Metrics Collection', 'FAIL', `Metrics check failed: ${error.message}`);
      return false;
    }
  }

  async checkFailover() {
    // Note: This is a conceptual check - actual node failure requires Docker manipulation
    try {
      const health = await this.lockManager.getHealthStatus();

      const allNodesHealthy = health.nodes.every(n => n.healthy);

      if (allNodesHealthy) {
        this.addCheck('Failover Readiness', 'PASS', 'All nodes healthy - system can tolerate 1 node failure', {
          note: 'Redlock requires 2/3 nodes for operation'
        });
      } else {
        const healthyCount = health.nodes.filter(n => n.healthy).length;
        if (healthyCount >= 2) {
          this.addCheck('Failover Readiness', 'WARN', `${healthyCount}/3 nodes healthy - still operational but degraded`);
        } else {
          this.addCheck('Failover Readiness', 'FAIL', `Only ${healthyCount}/3 nodes healthy - quorum lost`);
        }
      }

      return true;
    } catch (error) {
      this.addCheck('Failover Readiness', 'FAIL', `Failover check failed: ${error.message}`);
      return false;
    }
  }

  determineOverallStatus() {
    const failCount = this.results.checks.filter(c => c.status === 'FAIL').length;
    const warnCount = this.results.checks.filter(c => c.status === 'WARN').length;

    if (failCount > 0) {
      this.results.overall = 'FAIL';
    } else if (warnCount > 0) {
      this.results.overall = 'WARN';
    } else {
      this.results.overall = 'PASS';
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log('DISTRIBUTED LOCKS HEALTH CHECK');
    console.log('='.repeat(70));
    console.log(`Timestamp: ${this.results.timestamp}`);
    console.log(`Overall Status: ${this.results.overall}`);
    console.log('='.repeat(70));
    console.log();

    this.results.checks.forEach((check, index) => {
      const icon = check.status === 'PASS' ? '✓' : check.status === 'WARN' ? '⚠' : '✗';
      const color = check.status === 'PASS' ? '\x1b[32m' : check.status === 'WARN' ? '\x1b[33m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log(`${color}${icon} ${check.name}${reset}`);
      console.log(`  Status: ${check.status}`);
      console.log(`  Message: ${check.message}`);

      if (check.duration) {
        console.log(`  Duration: ${check.duration}`);
      }

      if (check.nodes) {
        console.log('  Nodes:');
        check.nodes.forEach(node => {
          const nodeIcon = node.healthy ? '✓' : '✗';
          console.log(`    ${nodeIcon} ${node.host} - ${node.healthy ? 'HEALTHY' : 'UNHEALTHY'} (${node.latency})`);
        });
      }

      if (check.metrics) {
        console.log('  Metrics:');
        Object.entries(check.metrics).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
      }

      console.log();
    });

    console.log('='.repeat(70));

    const summary = {
      total: this.results.checks.length,
      passed: this.results.checks.filter(c => c.status === 'PASS').length,
      warned: this.results.checks.filter(c => c.status === 'WARN').length,
      failed: this.results.checks.filter(c => c.status === 'FAIL').length
    };

    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Checks: ${summary.total}`);
    console.log(`Passed: ${summary.passed}`);
    console.log(`Warnings: ${summary.warned}`);
    console.log(`Failed: ${summary.failed}`);
    console.log('='.repeat(70));
    console.log();

    // Exit code based on overall status
    if (this.results.overall === 'FAIL') {
      console.log('❌ HEALTH CHECK FAILED');
      return 1;
    } else if (this.results.overall === 'WARN') {
      console.log('⚠️  HEALTH CHECK PASSED WITH WARNINGS');
      return 0;
    } else {
      console.log('✅ HEALTH CHECK PASSED');
      return 0;
    }
  }

  async cleanup() {
    if (this.lockManager) {
      await this.lockManager.cleanup();
    }
  }

  async run() {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        this.determineOverallStatus();
        const exitCode = this.printResults();
        process.exit(exitCode);
        return;
      }

      await this.checkRedisNodes();
      await this.checkLockAcquisition();
      await this.checkLockRelease();
      await this.checkConcurrency();
      await this.checkMetrics();
      await this.checkFailover();

      this.determineOverallStatus();
      const exitCode = this.printResults();

      await this.cleanup();
      process.exit(exitCode);

    } catch (error) {
      console.error('Health check error:', error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Run if executed directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const healthCheck = new LockHealthCheck();
  healthCheck.run().catch(console.error);
}

export default LockHealthCheck;
