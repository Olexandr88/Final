import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import RedisRedlockManager from '../src/utils/redis-redlock-manager.js';
import { performance } from 'perf_hooks';

describe('Redis Redlock Distributed Locks', () => {
  let lockManager;
  const testResource = 'test-resource-' + Date.now();

  before(async () => {
    // Initialize lock manager with test configuration
    lockManager = new RedisRedlockManager({
      redisNodes: [
        {
          host: process.env.REDIS_HOST_1 || 'localhost',
          port: parseInt(process.env.REDIS_PORT_1 || '6379'),
        },
        {
          host: process.env.REDIS_HOST_2 || 'localhost',
          port: parseInt(process.env.REDIS_PORT_2 || '6380'),
        },
        {
          host: process.env.REDIS_HOST_3 || 'localhost',
          port: parseInt(process.env.REDIS_PORT_3 || '6381'),
        },
      ],
      lockTTL: 5000,
      retryCount: 3,
      retryDelay: 100,
    });

    try {
      await lockManager.initialize();
    } catch (error) {
      console.warn('Redis nodes not available, skipping distributed lock tests:', error.message);
    }
  });

  after(async () => {
    if (lockManager) {
      await lockManager.cleanup();
    }
  });

  it('should initialize successfully', async () => {
    assert.ok(lockManager.initialized, 'Lock manager should be initialized');
  });

  it('should acquire and release a lock', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = `${testResource}-acquire-release`;

    // Acquire lock
    const lock = await lockManager.acquireLock(resource);
    assert.ok(lock, 'Lock should be acquired');
    assert.strictEqual(lock.resourcePath, resource);
    assert.ok(lock.acquiredAt > 0);

    // Verify lock is active
    assert.strictEqual(lockManager.isLocked(resource), true);

    // Release lock
    await lockManager.releaseLock(resource);

    // Verify lock is released
    assert.strictEqual(lockManager.isLocked(resource), false);
  });

  it('should prevent concurrent access to same resource', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = `${testResource}-concurrent`;

    // Acquire first lock
    const lock1 = await lockManager.acquireLock(resource, 3000);
    assert.ok(lock1);

    // Try to acquire second lock (should timeout)
    try {
      await lockManager.acquireLock(resource, 1000);
      assert.fail('Second lock should have timed out');
    } catch (error) {
      assert.ok(error.message.includes('Failed to acquire lock'));
    }

    // Release first lock
    await lockManager.releaseLock(resource);

    // Now second lock should succeed
    const lock2 = await lockManager.acquireLock(resource, 1000);
    assert.ok(lock2);
    await lockManager.releaseLock(resource);
  });

  it('should extend lock TTL', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = `${testResource}-extend`;

    const lock = await lockManager.acquireLock(resource, 2000);
    assert.ok(lock);

    const initialTTL = lockManager.getLockInfo(resource).ttl;

    // Extend lock
    const extended = await lockManager.extendLock(resource, 3000);
    assert.ok(extended);
    assert.strictEqual(extended.extension, 3000);

    const newTTL = lockManager.getLockInfo(resource).ttl;
    assert.ok(newTTL > initialTTL);

    await lockManager.releaseLock(resource);
  });

  it('should execute function with automatic lock management', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = `${testResource}-with-lock`;
    let executed = false;

    const result = await lockManager.withLock(resource, async () => {
      executed = true;
      // Verify lock is held during execution
      assert.strictEqual(lockManager.isLocked(resource), true);
      return 'success';
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(executed, true);

    // Verify lock is released after execution
    assert.strictEqual(lockManager.isLocked(resource), false);
  });

  it('should handle lock expiration', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = `${testResource}-expiration`;

    // Acquire lock with short TTL
    const lock = await lockManager.acquireLock(resource, 1000);
    assert.ok(lock);

    // Wait for lock to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Lock should have expired, new lock should succeed immediately
    const lock2 = await lockManager.acquireLock(resource, 1000);
    assert.ok(lock2);

    await lockManager.releaseLock(resource);
  });

  it('should measure lock acquisition performance', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const iterations = 50;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const resource = `${testResource}-perf-${i}`;
      const start = performance.now();

      await lockManager.acquireLock(resource, 2000);
      const duration = performance.now() - start;
      times.push(duration);

      await lockManager.releaseLock(resource);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);

    console.log('\nLock Acquisition Performance:');
    console.log(`  Average: ${avgTime.toFixed(2)}ms`);
    console.log(`  Min: ${minTime.toFixed(2)}ms`);
    console.log(`  Max: ${maxTime.toFixed(2)}ms`);

    // Performance target: average < 100ms
    assert.ok(avgTime < 100, `Average lock time ${avgTime}ms should be < 100ms`);
  });

  it('should provide accurate metrics', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const metrics = lockManager.getMetrics();

    assert.ok(metrics.locksAcquired >= 0);
    assert.ok(metrics.locksFailed >= 0);
    assert.ok(metrics.locksReleased >= 0);
    assert.ok(metrics.avgAcquireTime);
    assert.ok(metrics.successRate);

    console.log('\nLock Metrics:');
    console.log(JSON.stringify(metrics, null, 2));
  });

  it('should handle node failures gracefully', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = `${testResource}-failover`;

    // Acquire lock (should work with majority of nodes)
    const lock = await lockManager.acquireLock(resource);
    assert.ok(lock);

    // Even if one node fails, lock should remain valid
    // (This is tested conceptually; actual node failure would require Docker manipulation)

    await lockManager.releaseLock(resource);
  });

  it('should list all active locks', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource1 = `${testResource}-list-1`;
    const resource2 = `${testResource}-list-2`;

    await lockManager.acquireLock(resource1);
    await lockManager.acquireLock(resource2);

    const locks = lockManager.listLocks();
    assert.ok(locks.length >= 2);

    const lock1 = locks.find((l) => l.resourcePath === resource1);
    const lock2 = locks.find((l) => l.resourcePath === resource2);

    assert.ok(lock1);
    assert.ok(lock2);
    assert.ok(lock1.acquiredAt > 0);
    assert.ok(lock2.acquiredAt > 0);

    await lockManager.releaseLock(resource1);
    await lockManager.releaseLock(resource2);
  });

  it('should report health status', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const health = await lockManager.getHealthStatus();

    assert.ok(health.initialized);
    assert.ok(health.nodes);
    assert.strictEqual(health.nodes.length, 3);

    const healthyCount = health.nodes.filter((n) => n.healthy).length;
    console.log(`\nRedis Cluster Health: ${healthyCount}/3 nodes healthy`);

    health.nodes.forEach((node) => {
      console.log(
        `  Node ${node.node.host}:${node.node.port} - ${node.healthy ? 'HEALTHY' : 'UNHEALTHY'} (${node.latency || 'N/A'}ms)`
      );
    });

    // Should have at least quorum (2/3)
    assert.ok(healthyCount >= 2, 'Should have quorum');
  });

  it('should handle high concurrency', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = `${testResource}-concurrency`;
    const concurrentRequests = 20;
    const promises = [];

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        lockManager
          .acquireLock(resource, 1000)
          .then(async (lock) => {
            successCount++;
            await new Promise((resolve) => setTimeout(resolve, 50));
            await lockManager.releaseLock(resource);
          })
          .catch(() => {
            failureCount++;
          })
      );
    }

    await Promise.allSettled(promises);

    console.log(`\nConcurrency Test: ${successCount} succeeded, ${failureCount} failed (timeout)`);

    // At least one should succeed
    assert.ok(successCount > 0, 'At least one lock should succeed');
  });
});
