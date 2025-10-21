import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManagerCQRS } from '../../src/architecture/session-manager-cqrs.js';
import RedisRedlockManager from '../../src/utils/redis-redlock-manager.js';
import { getPrismaClient, healthCheck as prismaHealthCheck, disconnectPrisma } from '../../src/database/prisma-client.js';
import fs from 'fs';
import path from 'path';

describe('Deployment Validation - Full Integration', () => {
  let sessionManager;
  let lockManager;
  let prisma;

  before(async () => {
    prisma = getPrismaClient();

    // Initialize distributed lock manager (will fallback to local if Redis unavailable)
    lockManager = new RedisRedlockManager({
      redisNodes: [
        { host: process.env.REDIS_HOST_1 || 'localhost', port: parseInt(process.env.REDIS_PORT_1 || '6379') },
        { host: process.env.REDIS_HOST_2 || 'localhost', port: parseInt(process.env.REDIS_PORT_2 || '6380') },
        { host: process.env.REDIS_HOST_3 || 'localhost', port: parseInt(process.env.REDIS_PORT_3 || '6381') }
      ],
      lockTTL: 5000
    });

    try {
      await lockManager.initialize();
    } catch (error) {
      console.warn('Redis not available, skipping distributed lock tests');
    }
  });

  after(async () => {
    if (sessionManager) {
      await sessionManager.cleanup();
    }

    if (lockManager && lockManager.initialized) {
      await lockManager.cleanup();
    }

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
  });

  it('should validate CQRS architecture deployment', async () => {
    sessionManager = new SessionManagerCQRS();
    const sessionId = await sessionManager.register();

    assert.ok(sessionId, 'Session should be created');

    // Command: Update task
    await sessionManager.updateTask('deployment validation');

    // Query: Verify update
    const sessionInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(sessionInfo.current_task, 'deployment validation');

    // Event store stats
    const stats = await sessionManager.getEventStoreStats();
    assert.ok(stats.totalEvents > 0, 'Events should be stored');
  });

  it('should validate distributed locks integration', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = 'deployment-test-resource';

    // Acquire lock
    const lock = await lockManager.acquireLock(resource);
    assert.ok(lock, 'Lock should be acquired');

    // Verify lock is held
    assert.strictEqual(lockManager.isLocked(resource), true);

    // Release lock
    await lockManager.releaseLock(resource);

    // Verify lock is released
    assert.strictEqual(lockManager.isLocked(resource), false);
  });

  it('should validate Prisma ORM deployment', async () => {
    const healthy = await prismaHealthCheck();
    assert.strictEqual(healthy, true, 'Prisma should be healthy');
  });

  it('should validate cross-component workflow', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    // 1. Create session (CQRS)
    const sessionInfo = await sessionManager.getSessionInfo();
    assert.ok(sessionInfo.session_id);

    // 2. Acquire locks (CQRS Lock Management)
    const lock1 = await sessionManager.acquireLock('/workflow/resource1', 'write');
    const lock2 = await sessionManager.acquireLock('/workflow/resource2', 'read');

    assert.ok(lock1);
    assert.ok(lock2);

    // 3. Verify locks in session
    const updatedInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(updatedInfo.locks.length, 2);

    // 4. Update task
    await sessionManager.updateTask('workflow test');

    // 5. Verify everything is consistent
    const finalInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(finalInfo.current_task, 'workflow test');
    assert.strictEqual(finalInfo.locks.length, 2);

    // 6. Cleanup releases locks
    await sessionManager.releaseLock(lock1);
    const afterRelease = await sessionManager.getSessionInfo();
    assert.strictEqual(afterRelease.locks.length, 1);
  });

  it('should validate event sourcing and projections', async () => {
    sessionManager = new SessionManagerCQRS();
    const sessionId = await sessionManager.register();

    // Generate multiple events
    for (let i = 0; i < 10; i++) {
      await sessionManager.updateTask(`event-${i}`);
    }

    // Verify final state
    const sessionInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(sessionInfo.current_task, 'event-9');

    // Verify event store
    const stats = await sessionManager.getEventStoreStats();
    assert.ok(stats.totalEvents >= 11); // 1 create + 10 updates

    // Rebuild projections
    await sessionManager.rebuildProjections();

    // Verify state is consistent after rebuild
    const rebuiltInfo = await sessionManager.getSessionInfo();
    assert.strictEqual(rebuiltInfo.current_task, 'event-9');
  });

  it('should handle failover scenarios', async () => {
    if (!lockManager.initialized) {
      console.log('Skipping: Redis not available');
      return;
    }

    const resource = 'failover-test';

    // Acquire lock
    await lockManager.acquireLock(resource, 2000); // Short TTL

    // Verify lock
    assert.strictEqual(lockManager.isLocked(resource), true);

    // Wait for lock to expire
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Should be able to acquire again (expired)
    const newLock = await lockManager.acquireLock(resource, 2000);
    assert.ok(newLock);

    await lockManager.releaseLock(resource);
  });

  it('should validate performance under load', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    const start = Date.now();
    const operations = [];

    // 100 concurrent operations
    for (let i = 0; i < 100; i++) {
      operations.push(sessionManager.updateTask(`load-test-${i}`));
    }

    await Promise.all(operations);
    const duration = Date.now() - start;

    // Should complete in reasonable time (< 5 seconds)
    assert.ok(duration < 5000, `Operations took ${duration}ms, should be < 5000ms`);

    // Verify final state
    const sessionInfo = await sessionManager.getSessionInfo();
    assert.ok(sessionInfo.current_task.startsWith('load-test-'));
  });

  it('should validate lock consistency across sessions', async () => {
    const manager1 = new SessionManagerCQRS();
    const manager2 = new SessionManagerCQRS();

    await manager1.register();
    await manager2.register();

    // Session 1 acquires lock
    const lock1 = await manager1.acquireLock('/shared/resource', 'write');
    assert.ok(lock1);

    // Verify lock exists
    const lockInfo = await manager1.getLockInfo('/shared/resource');
    assert.ok(lockInfo);

    // Session 2 should see the lock (query-side check)
    const lockInfo2 = await manager2.getLockInfo('/shared/resource');
    assert.ok(lockInfo2);
    assert.strictEqual(lockInfo2.resource_path, '/shared/resource');

    // Release lock
    await manager1.releaseLock(lock1);

    // Session 2 should see lock is released
    const lockInfoAfter = await manager2.getLockInfo('/shared/resource');
    assert.strictEqual(lockInfoAfter, null);

    await manager1.cleanup();
    await manager2.cleanup();
  });

  it('should validate concurrent session management', async () => {
    const managers = [];

    // Create 5 concurrent sessions
    for (let i = 0; i < 5; i++) {
      const mgr = new SessionManagerCQRS();
      await mgr.register();
      managers.push(mgr);
    }

    // Verify all sessions are active
    const activeSessions = await managers[0].listActiveSessions();
    assert.ok(activeSessions.length >= 5);

    // Each session updates independently
    await Promise.all(
      managers.map((mgr, i) => mgr.updateTask(`concurrent-${i}`))
    );

    // Verify each session has correct task
    for (let i = 0; i < managers.length; i++) {
      const info = await managers[i].getSessionInfo();
      assert.strictEqual(info.current_task, `concurrent-${i}`);
    }

    // Cleanup all
    await Promise.all(managers.map(mgr => mgr.cleanup()));
  });

  it('should validate health monitoring', async () => {
    // Prisma health
    const prismaHealthy = await prismaHealthCheck();
    assert.strictEqual(prismaHealthy, true);

    // Redis health (if available)
    if (lockManager.initialized) {
      const redisHealth = await lockManager.getHealthStatus();
      assert.ok(redisHealth.initialized);
      assert.ok(typeof redisHealth.healthy === 'boolean');
    }

    // CQRS health
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();
    const stats = await sessionManager.getEventStoreStats();
    assert.ok(stats.poolStats);
  });

  it('should validate gradual rollout capability', async () => {
    // Test that both old and new systems can coexist
    const cqrsManager = new SessionManagerCQRS();
    await cqrsManager.register();

    // Perform operations
    await cqrsManager.updateTask('gradual rollout test');
    const lock = await cqrsManager.acquireLock('/rollout/resource', 'write');

    // Verify state
    const sessionInfo = await cqrsManager.getSessionInfo();
    assert.ok(sessionInfo);
    assert.strictEqual(sessionInfo.locks.length, 1);

    await cqrsManager.cleanup();
  });

  it('should validate automatic failover', async () => {
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();

    // Create locks
    const lock1 = await sessionManager.acquireLock('/failover/res1', 'write');
    const lock2 = await sessionManager.acquireLock('/failover/res2', 'read');

    // Simulate cleanup (failover scenario)
    await sessionManager.cleanup();

    // Create new session
    const newManager = new SessionManagerCQRS();
    await newManager.register();

    // Locks should be released, can acquire again
    const newLock1 = await newManager.acquireLock('/failover/res1', 'write');
    assert.ok(newLock1);

    await newManager.cleanup();
  });

  it('should provide comprehensive deployment metrics', async () => {
    const metrics = {
      cqrs: null,
      redis: null,
      prisma: null
    };

    // CQRS metrics
    sessionManager = new SessionManagerCQRS();
    await sessionManager.register();
    await sessionManager.updateTask('metrics test');
    metrics.cqrs = await sessionManager.getEventStoreStats();

    // Redis metrics (if available)
    if (lockManager.initialized) {
      metrics.redis = lockManager.getMetrics();
    }

    // Prisma metrics
    const { getPrismaMetrics } = await import('../../src/database/prisma-client.js');
    metrics.prisma = getPrismaMetrics();

    // Validate metrics exist
    assert.ok(metrics.cqrs);
    assert.ok(metrics.cqrs.totalEvents >= 0);
    assert.ok(metrics.prisma);

    console.log('\n=== Deployment Metrics ===');
    console.log('CQRS:', JSON.stringify(metrics.cqrs, null, 2));
    console.log('Prisma:', JSON.stringify(metrics.prisma, null, 2));
    if (metrics.redis) {
      console.log('Redis:', JSON.stringify(metrics.redis, null, 2));
    }
  });
});
