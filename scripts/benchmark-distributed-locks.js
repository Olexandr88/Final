import RedisRedlockManager from '../src/utils/redis-redlock-manager.js';
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import { cpus } from 'os';

/**
 * Comprehensive Benchmark Suite for Distributed Locks
 */
class DistributedLockBenchmark {
  constructor() {
    this.lockManager = null;
    this.results = {};
  }

  async initialize() {
    console.log('Initializing Redis Redlock Manager...\n');

    this.lockManager = new RedisRedlockManager({
      redisNodes: [
        { host: process.env.REDIS_HOST_1 || 'localhost', port: parseInt(process.env.REDIS_PORT_1 || '6379') },
        { host: process.env.REDIS_HOST_2 || 'localhost', port: parseInt(process.env.REDIS_PORT_2 || '6380') },
        { host: process.env.REDIS_HOST_3 || 'localhost', port: parseInt(process.env.REDIS_PORT_3 || '6381') }
      ],
      lockTTL: 10000,
      retryCount: 3,
      retryDelay: 200
    });

    await this.lockManager.initialize();

    console.log('✓ Redis Redlock Manager initialized\n');
  }

  async benchmarkAcquisitionLatency() {
    console.log('='.repeat(70));
    console.log('1. Lock Acquisition Latency');
    console.log('='.repeat(70));

    const iterations = 100;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const resource = `bench-latency-${i}`;
      const start = performance.now();

      await this.lockManager.acquireLock(resource);
      const duration = performance.now() - start;
      times.push(duration);

      await this.lockManager.releaseLock(resource);
    }

    const sorted = times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const min = Math.min(...times);
    const max = Math.max(...times);

    this.results.acquisitionLatency = {
      iterations,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2)
    };

    console.log(`Iterations: ${iterations}`);
    console.log(`Average:    ${avg.toFixed(2)}ms`);
    console.log(`Min:        ${min.toFixed(2)}ms`);
    console.log(`Max:        ${max.toFixed(2)}ms`);
    console.log(`P50:        ${p50.toFixed(2)}ms`);
    console.log(`P95:        ${p95.toFixed(2)}ms`);
    console.log(`P99:        ${p99.toFixed(2)}ms`);
    console.log();
  }

  async benchmarkThroughput() {
    console.log('='.repeat(70));
    console.log('2. Lock Throughput');
    console.log('='.repeat(70));

    const duration = 10000; // 10 seconds
    const startTime = performance.now();
    let operations = 0;

    while (performance.now() - startTime < duration) {
      const resource = `bench-throughput-${operations}`;
      await this.lockManager.acquireLock(resource);
      await this.lockManager.releaseLock(resource);
      operations++;
    }

    const actualDuration = performance.now() - startTime;
    const opsPerSec = (operations / (actualDuration / 1000)).toFixed(2);

    this.results.throughput = {
      operations,
      duration: actualDuration.toFixed(2),
      opsPerSec
    };

    console.log(`Operations:  ${operations}`);
    console.log(`Duration:    ${actualDuration.toFixed(2)}ms`);
    console.log(`Throughput:  ${opsPerSec} ops/sec`);
    console.log();
  }

  async benchmarkContention() {
    console.log('='.repeat(70));
    console.log('3. Lock Contention (10 concurrent clients, 1 resource)');
    console.log('='.repeat(70));

    const resource = 'bench-contention';
    const clients = 10;
    const attemptsPerClient = 20;

    const startTime = performance.now();
    const promises = [];

    for (let i = 0; i < clients; i++) {
      promises.push(this._contentionClient(resource, attemptsPerClient, i));
    }

    const results = await Promise.all(promises);

    const totalDuration = performance.now() - startTime;
    const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
    const totalFailures = results.reduce((sum, r) => sum + r.failures, 0);
    const totalAttempts = totalSuccess + totalFailures;
    const avgWaitTime = results.reduce((sum, r) => sum + r.avgWaitTime, 0) / clients;

    this.results.contention = {
      clients,
      attemptsPerClient,
      totalAttempts,
      totalSuccess,
      totalFailures,
      successRate: ((totalSuccess / totalAttempts) * 100).toFixed(2),
      totalDuration: totalDuration.toFixed(2),
      avgWaitTime: avgWaitTime.toFixed(2)
    };

    console.log(`Clients:       ${clients}`);
    console.log(`Attempts:      ${totalAttempts}`);
    console.log(`Success:       ${totalSuccess}`);
    console.log(`Failures:      ${totalFailures}`);
    console.log(`Success Rate:  ${this.results.contention.successRate}%`);
    console.log(`Duration:      ${totalDuration.toFixed(2)}ms`);
    console.log(`Avg Wait:      ${avgWaitTime.toFixed(2)}ms`);
    console.log();
  }

  async _contentionClient(resource, attempts, clientId) {
    let success = 0;
    let failures = 0;
    const waitTimes = [];

    for (let i = 0; i < attempts; i++) {
      const startWait = performance.now();

      try {
        await this.lockManager.acquireLock(resource, 2000);
        const waitTime = performance.now() - startWait;
        waitTimes.push(waitTime);

        // Hold lock for 50ms
        await new Promise(resolve => setTimeout(resolve, 50));

        await this.lockManager.releaseLock(resource);
        success++;
      } catch (error) {
        failures++;
      }
    }

    return {
      clientId,
      success,
      failures,
      avgWaitTime: waitTimes.length > 0
        ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
        : 0
    };
  }

  async benchmarkLockExtension() {
    console.log('='.repeat(70));
    console.log('4. Lock Extension Performance');
    console.log('='.repeat(70));

    const iterations = 50;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const resource = `bench-extension-${i}`;

      await this.lockManager.acquireLock(resource, 2000);

      const start = performance.now();
      await this.lockManager.extendLock(resource, 3000);
      const duration = performance.now() - start;
      times.push(duration);

      await this.lockManager.releaseLock(resource);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    this.results.lockExtension = {
      iterations,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2)
    };

    console.log(`Iterations:  ${iterations}`);
    console.log(`Average:     ${avg.toFixed(2)}ms`);
    console.log(`Min:         ${min.toFixed(2)}ms`);
    console.log(`Max:         ${max.toFixed(2)}ms`);
    console.log();
  }

  async benchmarkNodeFailure() {
    console.log('='.repeat(70));
    console.log('5. Node Failure Simulation');
    console.log('='.repeat(70));

    console.log('Testing lock acquisition with full cluster...');

    const resource = 'bench-failover';
    const start = performance.now();
    await this.lockManager.acquireLock(resource);
    const fullClusterTime = performance.now() - start;

    await this.lockManager.releaseLock(resource);

    console.log(`Full cluster lock time: ${fullClusterTime.toFixed(2)}ms`);
    console.log('Note: Actual node failure testing requires manual Docker manipulation');
    console.log();

    this.results.nodeFailure = {
      fullClusterTime: fullClusterTime.toFixed(2),
      note: 'Partial failure tolerance built into Redlock algorithm'
    };
  }

  async benchmarkMemoryUsage() {
    console.log('='.repeat(70));
    console.log('6. Memory Usage Under Load');
    console.log('='.repeat(70));

    const startMem = process.memoryUsage();
    const lockCount = 1000;

    // Acquire many locks
    const locks = [];
    for (let i = 0; i < lockCount; i++) {
      const resource = `bench-memory-${i}`;
      await this.lockManager.acquireLock(resource);
      locks.push(resource);
    }

    const peakMem = process.memoryUsage();

    // Release all locks
    for (const resource of locks) {
      await this.lockManager.releaseLock(resource);
    }

    if (global.gc) global.gc();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const endMem = process.memoryUsage();

    const memoryIncrease = (peakMem.heapUsed - startMem.heapUsed) / 1024 / 1024;
    const memoryPerLock = memoryIncrease / lockCount;

    this.results.memoryUsage = {
      lockCount,
      startHeapMB: (startMem.heapUsed / 1024 / 1024).toFixed(2),
      peakHeapMB: (peakMem.heapUsed / 1024 / 1024).toFixed(2),
      endHeapMB: (endMem.heapUsed / 1024 / 1024).toFixed(2),
      totalIncreaseMB: memoryIncrease.toFixed(2),
      memoryPerLockKB: (memoryPerLock * 1024).toFixed(2)
    };

    console.log(`Locks Created:     ${lockCount}`);
    console.log(`Start Heap:        ${this.results.memoryUsage.startHeapMB}MB`);
    console.log(`Peak Heap:         ${this.results.memoryUsage.peakHeapMB}MB`);
    console.log(`End Heap:          ${this.results.memoryUsage.endHeapMB}MB`);
    console.log(`Memory Increase:   ${this.results.memoryUsage.totalIncreaseMB}MB`);
    console.log(`Memory Per Lock:   ${this.results.memoryUsage.memoryPerLockKB}KB`);
    console.log();
  }

  async benchmarkHealthCheck() {
    console.log('='.repeat(70));
    console.log('7. Health Check Performance');
    console.log('='.repeat(70));

    const iterations = 20;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.lockManager.getHealthStatus();
      const duration = performance.now() - start;
      times.push(duration);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    this.results.healthCheck = {
      iterations,
      avg: avg.toFixed(2)
    };

    console.log(`Iterations:  ${iterations}`);
    console.log(`Average:     ${avg.toFixed(2)}ms`);
    console.log();
  }

  generateReport() {
    console.log('\n');
    console.log('='.repeat(70));
    console.log('DISTRIBUTED LOCKS BENCHMARK SUMMARY');
    console.log('='.repeat(70));
    console.log();

    console.log(JSON.stringify(this.results, null, 2));

    console.log();
    console.log('='.repeat(70));
    console.log('PERFORMANCE TARGETS');
    console.log('='.repeat(70));

    const checks = [
      {
        metric: 'Lock Acquisition P95',
        value: parseFloat(this.results.acquisitionLatency.p95),
        target: 120,
        unit: 'ms',
        pass: parseFloat(this.results.acquisitionLatency.p95) < 120
      },
      {
        metric: 'Throughput',
        value: parseFloat(this.results.throughput.opsPerSec),
        target: 50,
        unit: 'ops/sec',
        pass: parseFloat(this.results.throughput.opsPerSec) > 50
      },
      {
        metric: 'Contention Success Rate',
        value: parseFloat(this.results.contention.successRate),
        target: 80,
        unit: '%',
        pass: parseFloat(this.results.contention.successRate) > 80
      },
      {
        metric: 'Memory Per Lock',
        value: parseFloat(this.results.memoryUsage.memoryPerLockKB),
        target: 10,
        unit: 'KB',
        pass: parseFloat(this.results.memoryUsage.memoryPerLockKB) < 10
      },
      {
        metric: 'Health Check Time',
        value: parseFloat(this.results.healthCheck.avg),
        target: 100,
        unit: 'ms',
        pass: parseFloat(this.results.healthCheck.avg) < 100
      }
    ];

    console.log();
    checks.forEach(check => {
      const status = check.pass ? '✓ PASS' : '✗ FAIL';
      console.log(`${status} | ${check.metric}: ${check.value}${check.unit} (target: ${check.target}${check.unit})`);
    });

    const allPassed = checks.every(c => c.pass);
    console.log();
    console.log('='.repeat(70));
    console.log(allPassed ? '✓ ALL BENCHMARKS PASSED' : '✗ SOME BENCHMARKS FAILED');
    console.log('='.repeat(70));
    console.log();
  }

  async cleanup() {
    if (this.lockManager) {
      await this.lockManager.cleanup();
    }
  }

  async run() {
    try {
      await this.initialize();

      await this.benchmarkAcquisitionLatency();
      await this.benchmarkThroughput();
      await this.benchmarkContention();
      await this.benchmarkLockExtension();
      await this.benchmarkNodeFailure();
      await this.benchmarkMemoryUsage();
      await this.benchmarkHealthCheck();

      this.generateReport();

      await this.cleanup();

    } catch (error) {
      console.error('Benchmark failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Run if executed directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const benchmark = new DistributedLockBenchmark();
  benchmark.run().catch(console.error);
}

export default DistributedLockBenchmark;
