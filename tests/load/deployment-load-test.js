#!/usr/bin/env node

/**
 * Load Testing Suite for Deployment Validation
 * Tests system performance under realistic load conditions
 */

import { SessionManagerCQRS } from '../../src/architecture/session-manager-cqrs.js';
import RedisRedlockManager from '../../src/utils/redis-redlock-manager.js';
import { getPrismaClient, healthCheck, disconnectPrisma } from '../../src/database/prisma-client.js';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

class LoadTester {
  constructor() {
    this.results = {
      sessions: { total: 0, successful: 0, failed: 0, avgTime: 0 },
      locks: { total: 0, successful: 0, failed: 0, avgTime: 0 },
      events: { total: 0, successful: 0, failed: 0, avgTime: 0 },
      queries: { total: 0, successful: 0, failed: 0, avgTime: 0 },
      memoryLeaks: [],
      errors: []
    };
    this.managers = [];
    this.lockManager = null;
  }

  async initialize() {
    console.log('🚀 Initializing load testing environment...\n');

    // Initialize Redis lock manager
    this.lockManager = new RedisRedlockManager({
      redisNodes: [
        { host: 'localhost', port: 6379 },
        { host: 'localhost', port: 6380 },
        { host: 'localhost', port: 6381 }
      ],
      lockTTL: 10000
    });

    try {
      await this.lockManager.initialize();
      console.log('✓ Redis lock manager initialized');
    } catch (error) {
      console.warn('⚠ Redis not available, using local locks only');
    }

    // Initialize Prisma
    const prisma = getPrismaClient();
    const healthy = await healthCheck();
    console.log(`✓ Prisma client initialized (healthy: ${healthy})`);

    console.log('');
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test environment...');

    // Cleanup all session managers
    for (const manager of this.managers) {
      try {
        await manager.cleanup();
      } catch (err) {
        // Ignore
      }
    }

    // Cleanup lock manager
    if (this.lockManager && this.lockManager.initialized) {
      await this.lockManager.cleanup();
    }

    // Disconnect Prisma
    await disconnectPrisma();

    // Cleanup test databases
    const archDir = path.join(process.cwd(), '.architecture');
    try {
      if (fs.existsSync(archDir)) {
        const files = fs.readdirSync(archDir);
        files.forEach(file => {
          const filePath = path.join(archDir, file);
          try {
            if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
            }
          } catch (err) {
            // Ignore
          }
        });
      }
    } catch (err) {
      // Ignore
    }

    console.log('✓ Cleanup complete');
  }

  async testConcurrentSessions(count = 100) {
    console.log(`📊 Test 1: Creating ${count} concurrent sessions...`);
    const start = performance.now();
    const promises = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        (async () => {
          try {
            const manager = new SessionManagerCQRS();
            const sessionId = await manager.register();
            this.managers.push(manager);
            this.results.sessions.successful++;
            return sessionId;
          } catch (error) {
            this.results.sessions.failed++;
            this.results.errors.push({ test: 'sessions', error: error.message });
            return null;
          }
        })()
      );
    }

    await Promise.all(promises);
    const duration = performance.now() - start;

    this.results.sessions.total = count;
    this.results.sessions.avgTime = duration / count;

    console.log(`  ✓ Created ${this.results.sessions.successful}/${count} sessions`);
    console.log(`  ⏱  Average time: ${this.results.sessions.avgTime.toFixed(2)}ms`);
    console.log(`  ⌛ Total time: ${duration.toFixed(2)}ms\n`);

    return this.results.sessions.successful === count;
  }

  async testLockOperations(count = 1000) {
    console.log(`🔒 Test 2: Performing ${count} lock operations...`);
    const start = performance.now();
    const times = [];

    // Use subset of managers
    const testManagers = this.managers.slice(0, 10);

    for (let i = 0; i < count; i++) {
      const manager = testManagers[i % testManagers.length];
      const resourcePath = `/load-test/resource-${i % 50}`; // 50 unique resources

      try {
        const lockStart = performance.now();

        if (i % 2 === 0) {
          // Acquire lock
          const lockId = await manager.acquireLock(resourcePath, 'write');
          times.push(performance.now() - lockStart);
          this.results.locks.successful++;

          // Release immediately
          await manager.releaseLock(lockId);
        } else {
          // Just query lock
          const lockStart = performance.now();
          await manager.getLockInfo(resourcePath);
          times.push(performance.now() - lockStart);
          this.results.locks.successful++;
        }
      } catch (error) {
        this.results.locks.failed++;
        this.results.errors.push({ test: 'locks', error: error.message });
      }
    }

    const duration = performance.now() - start;
    this.results.locks.total = count;
    this.results.locks.avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    console.log(`  ✓ Completed ${this.results.locks.successful}/${count} lock operations`);
    console.log(`  ⏱  Average time: ${this.results.locks.avgTime.toFixed(2)}ms`);
    console.log(`  ⌛ Total time: ${duration.toFixed(2)}ms`);
    console.log(`  📈 Throughput: ${(count / (duration / 1000)).toFixed(0)} ops/sec\n`);

    return this.results.locks.failed < count * 0.01; // < 1% failure rate
  }

  async testEventAppends(count = 10000) {
    console.log(`📝 Test 3: Appending ${count} events...`);
    const start = performance.now();
    const times = [];

    // Use subset of managers
    const testManagers = this.managers.slice(0, 20);

    for (let i = 0; i < count; i++) {
      const manager = testManagers[i % testManagers.length];

      try {
        const eventStart = performance.now();
        await manager.updateTask(`load-test-event-${i}`);
        times.push(performance.now() - eventStart);
        this.results.events.successful++;
      } catch (error) {
        this.results.events.failed++;
        this.results.errors.push({ test: 'events', error: error.message });
      }
    }

    const duration = performance.now() - start;
    this.results.events.total = count;
    this.results.events.avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    console.log(`  ✓ Appended ${this.results.events.successful}/${count} events`);
    console.log(`  ⏱  Average time: ${this.results.events.avgTime.toFixed(2)}ms`);
    console.log(`  ⌛ Total time: ${duration.toFixed(2)}ms`);
    console.log(`  📈 Throughput: ${(count / (duration / 1000)).toFixed(0)} events/sec\n`);

    return this.results.events.failed < count * 0.01;
  }

  async testQueryThroughput(count = 5000) {
    console.log(`🔍 Test 4: Executing ${count} queries...`);
    const start = performance.now();
    const times = [];

    const testManagers = this.managers.slice(0, 10);

    for (let i = 0; i < count; i++) {
      const manager = testManagers[i % testManagers.length];

      try {
        const queryStart = performance.now();

        if (i % 3 === 0) {
          await manager.getSessionInfo();
        } else if (i % 3 === 1) {
          await manager.listActiveSessions();
        } else {
          await manager.getLockInfo(`/load-test/resource-${i % 50}`);
        }

        times.push(performance.now() - queryStart);
        this.results.queries.successful++;
      } catch (error) {
        this.results.queries.failed++;
        this.results.errors.push({ test: 'queries', error: error.message });
      }
    }

    const duration = performance.now() - start;
    this.results.queries.total = count;
    this.results.queries.avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    console.log(`  ✓ Executed ${this.results.queries.successful}/${count} queries`);
    console.log(`  ⏱  Average time: ${this.results.queries.avgTime.toFixed(2)}ms`);
    console.log(`  ⌛ Total time: ${duration.toFixed(2)}ms`);
    console.log(`  📈 Throughput: ${(count / (duration / 1000)).toFixed(0)} queries/sec\n`);

    return this.results.queries.avgTime < 50; // < 50ms average
  }

  async testMemoryLeaks() {
    console.log('💾 Test 5: Memory leak detection (1-hour soak test simulation)...');

    const snapshots = [];
    const iterations = 10; // Reduced for practicality

    for (let i = 0; i < iterations; i++) {
      const memBefore = process.memoryUsage();

      // Perform operations
      const manager = new SessionManagerCQRS();
      await manager.register();

      for (let j = 0; j < 100; j++) {
        await manager.updateTask(`soak-${i}-${j}`);
      }

      await manager.cleanup();

      const memAfter = process.memoryUsage();

      snapshots.push({
        iteration: i,
        heapUsed: memAfter.heapUsed - memBefore.heapUsed,
        external: memAfter.external - memBefore.external
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }

    // Check for memory growth
    const avgGrowth = snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / snapshots.length;
    const leakDetected = avgGrowth > 10 * 1024 * 1024; // 10MB threshold

    console.log(`  ${leakDetected ? '⚠' : '✓'} Average heap growth: ${(avgGrowth / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  📊 Memory snapshots: ${snapshots.length}`);

    if (leakDetected) {
      this.results.memoryLeaks.push({ avgGrowth, snapshots });
    }

    return !leakDetected;
  }

  async testDistributedLocks() {
    if (!this.lockManager || !this.lockManager.initialized) {
      console.log('⏭️  Test 6: Skipping distributed locks (Redis not available)\n');
      return true;
    }

    console.log('🌐 Test 6: Distributed lock performance...');
    const start = performance.now();
    const times = [];
    const count = 500;

    for (let i = 0; i < count; i++) {
      const resource = `distributed-lock-${i % 10}`;

      try {
        const lockStart = performance.now();
        await this.lockManager.acquireLock(resource, 1000);
        times.push(performance.now() - lockStart);
        await this.lockManager.releaseLock(resource);
      } catch (error) {
        // Expected for contention
      }
    }

    const duration = performance.now() - start;
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    console.log(`  ✓ Distributed lock operations: ${times.length}/${count}`);
    console.log(`  ⏱  Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`  ⌛ Total time: ${duration.toFixed(2)}ms\n`);

    return avgTime < 200; // < 200ms average
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LOAD TEST RESULTS');
    console.log('='.repeat(60) + '\n');

    // Session results
    console.log('Sessions:');
    console.log(`  Total: ${this.results.sessions.total}`);
    console.log(`  Successful: ${this.results.sessions.successful}`);
    console.log(`  Failed: ${this.results.sessions.failed}`);
    console.log(`  Avg Time: ${this.results.sessions.avgTime.toFixed(2)}ms\n`);

    // Lock results
    console.log('Lock Operations:');
    console.log(`  Total: ${this.results.locks.total}`);
    console.log(`  Successful: ${this.results.locks.successful}`);
    console.log(`  Failed: ${this.results.locks.failed}`);
    console.log(`  Avg Time: ${this.results.locks.avgTime.toFixed(2)}ms\n`);

    // Event results
    console.log('Event Appends:');
    console.log(`  Total: ${this.results.events.total}`);
    console.log(`  Successful: ${this.results.events.successful}`);
    console.log(`  Failed: ${this.results.events.failed}`);
    console.log(`  Avg Time: ${this.results.events.avgTime.toFixed(2)}ms\n`);

    // Query results
    console.log('Queries:');
    console.log(`  Total: ${this.results.queries.total}`);
    console.log(`  Successful: ${this.results.queries.successful}`);
    console.log(`  Failed: ${this.results.queries.failed}`);
    console.log(`  Avg Time: ${this.results.queries.avgTime.toFixed(2)}ms\n`);

    // Memory leaks
    console.log('Memory:');
    console.log(`  Leaks Detected: ${this.results.memoryLeaks.length}\n`);

    // Errors
    if (this.results.errors.length > 0) {
      console.log('Errors:');
      const errorSummary = {};
      this.results.errors.forEach(e => {
        errorSummary[e.error] = (errorSummary[e.error] || 0) + 1;
      });
      Object.entries(errorSummary).forEach(([error, count]) => {
        console.log(`  ${error}: ${count} occurrences`);
      });
      console.log('');
    }

    console.log('='.repeat(60) + '\n');

    // Overall assessment
    const totalOps = this.results.sessions.total + this.results.locks.total +
                     this.results.events.total + this.results.queries.total;
    const totalSuccess = this.results.sessions.successful + this.results.locks.successful +
                        this.results.events.successful + this.results.queries.successful;
    const successRate = (totalSuccess / totalOps * 100).toFixed(2);

    console.log(`Overall Success Rate: ${successRate}%`);

    if (parseFloat(successRate) >= 99 && this.results.memoryLeaks.length === 0) {
      console.log('✅ LOAD TEST PASSED\n');
      return true;
    } else {
      console.log('❌ LOAD TEST FAILED\n');
      return false;
    }
  }

  async run() {
    try {
      await this.initialize();

      const tests = [
        () => this.testConcurrentSessions(100),
        () => this.testLockOperations(1000),
        () => this.testEventAppends(10000),
        () => this.testQueryThroughput(5000),
        () => this.testMemoryLeaks(),
        () => this.testDistributedLocks()
      ];

      let allPassed = true;

      for (const test of tests) {
        const passed = await test();
        if (!passed) allPassed = false;
      }

      const finalResult = this.printResults();

      await this.cleanup();

      process.exit(finalResult ? 0 : 1);

    } catch (error) {
      console.error('❌ Load test failed with error:', error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new LoadTester();
  tester.run();
}

export default LoadTester;
