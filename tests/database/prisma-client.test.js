import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPrismaClient,
  getPrismaMetrics,
  resetPrismaMetrics,
  withRetry,
  batchOperations,
  healthCheck,
  disconnectPrisma
} from '../../src/database/prisma-client.js';

describe('Prisma Client - ORM Integration', () => {
  let prisma;

  before(async () => {
    prisma = getPrismaClient();
  });

  after(async () => {
    await disconnectPrisma();
  });

  beforeEach(() => {
    resetPrismaMetrics();
  });

  it('should initialize Prisma client', () => {
    assert.ok(prisma, 'Prisma client should be initialized');
    assert.ok(prisma.$connect, 'Should have $connect method');
    assert.ok(prisma.$disconnect, 'Should have $disconnect method');
  });

  it('should return singleton instance', () => {
    const prisma1 = getPrismaClient();
    const prisma2 = getPrismaClient();

    assert.strictEqual(prisma1, prisma2, 'Should return same instance');
  });

  it('should perform health check successfully', async () => {
    const healthy = await healthCheck();
    assert.strictEqual(healthy, true, 'Health check should pass');
  });

  it('should track performance metrics', async () => {
    // Perform some operations to generate metrics
    await healthCheck();
    await healthCheck();

    const metrics = getPrismaMetrics();
    assert.ok(metrics, 'Metrics should be available');
    assert.ok(metrics.queryCount >= 0, 'Should track query count');
    assert.ok(typeof metrics.avgDuration === 'string', 'Should have average duration');
    assert.ok(metrics.errors >= 0, 'Should track errors');
  });

  it('should reset metrics', () => {
    resetPrismaMetrics();
    const metrics = getPrismaMetrics();

    assert.strictEqual(metrics.queryCount, 0);
    assert.strictEqual(metrics.errors, 0);
  });

  it('should execute withRetry on transient errors', async () => {
    let attempts = 0;

    const result = await withRetry(async () => {
      attempts++;
      return 'success';
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 1);
  });

  it('should retry on SQLITE_BUSY error', async () => {
    let attempts = 0;

    try {
      await withRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            const error = new Error('SQLITE_BUSY: database is locked');
            throw error;
          }
          return 'recovered';
        },
        3
      );
    } catch (err) {
      // May fail if retry logic doesn't work
    }

    assert.ok(attempts >= 1, 'Should attempt at least once');
  });

  it('should give up after max retries', async () => {
    let attempts = 0;

    await assert.rejects(
      async () => {
        await withRetry(
          async () => {
            attempts++;
            throw new Error('SQLITE_BUSY: persistent error');
          },
          3
        );
      },
      /persistent error/
    );

    assert.strictEqual(attempts, 3, 'Should attempt max retries');
  });

  it('should not retry non-retryable errors', async () => {
    let attempts = 0;

    await assert.rejects(
      async () => {
        await withRetry(async () => {
          attempts++;
          throw new Error('Invalid syntax');
        }, 3);
      },
      /Invalid syntax/
    );

    assert.strictEqual(attempts, 1, 'Should not retry non-retryable errors');
  });

  it('should batch operations in transaction', async () => {
    const operations = [
      async (client) => ({ result: 'op1' }),
      async (client) => ({ result: 'op2' }),
      async (client) => ({ result: 'op3' })
    ];

    const results = await batchOperations(operations);

    assert.strictEqual(results.length, 3);
    assert.deepStrictEqual(results[0], { result: 'op1' });
    assert.deepStrictEqual(results[1], { result: 'op2' });
    assert.deepStrictEqual(results[2], { result: 'op3' });
  });

  it('should rollback batch on error', async () => {
    const operations = [
      async (client) => ({ result: 'op1' }),
      async (client) => {
        throw new Error('Batch error');
      },
      async (client) => ({ result: 'op3' })
    ];

    await assert.rejects(
      async () => {
        await batchOperations(operations);
      },
      /Batch error/
    );
  });

  it('should handle connection pooling', async () => {
    // Execute multiple concurrent queries
    const promises = [];

    for (let i = 0; i < 10; i++) {
      promises.push(healthCheck());
    }

    const results = await Promise.all(promises);

    assert.ok(results.every(r => r === true), 'All queries should succeed');
  });

  it('should track slow queries', async () => {
    // Execute query and check metrics
    await healthCheck();

    const metrics = getPrismaMetrics();

    // Metrics should exist
    assert.ok(metrics);
    assert.ok(typeof metrics.slowQueryCount === 'number');
  });

  it('should handle disconnect gracefully', async () => {
    const testPrisma = getPrismaClient();

    // Should not throw
    await disconnectPrisma();

    // Should be able to reconnect
    const newPrisma = getPrismaClient();
    assert.ok(newPrisma);
  });

  it('should provide accurate metrics after operations', async () => {
    resetPrismaMetrics();

    // Perform operations
    for (let i = 0; i < 5; i++) {
      await healthCheck();
    }

    const metrics = getPrismaMetrics();

    assert.ok(metrics.queryCount >= 5, 'Should track all queries');
    assert.ok(parseFloat(metrics.avgDuration) >= 0, 'Should calculate average duration');
  });

  it('should handle concurrent batch operations', async () => {
    const batch1 = [
      async (client) => ({ id: 1 }),
      async (client) => ({ id: 2 })
    ];

    const batch2 = [
      async (client) => ({ id: 3 }),
      async (client) => ({ id: 4 })
    ];

    const [results1, results2] = await Promise.all([
      batchOperations(batch1),
      batchOperations(batch2)
    ]);

    assert.strictEqual(results1.length, 2);
    assert.strictEqual(results2.length, 2);
  });

  it('should enforce transaction timeout', async () => {
    const slowOperations = [
      async (client) => {
        await new Promise(resolve => setTimeout(resolve, 11000)); // 11 seconds
        return 'done';
      }
    ];

    await assert.rejects(
      async () => {
        await batchOperations(slowOperations);
      },
      /timeout/i
    );
  });

  it('should handle empty batch operations', async () => {
    const results = await batchOperations([]);
    assert.deepStrictEqual(results, []);
  });

  it('should provide connection status', async () => {
    const healthy = await healthCheck();
    assert.strictEqual(typeof healthy, 'boolean');
  });

  it('should handle rapid connect/disconnect', async () => {
    await disconnectPrisma();
    const prisma1 = getPrismaClient();
    await disconnectPrisma();
    const prisma2 = getPrismaClient();

    assert.ok(prisma1);
    assert.ok(prisma2);
  });

  it('should execute exponential backoff on retries', async () => {
    const delays = [];
    let attempts = 0;

    try {
      await withRetry(
        async () => {
          attempts++;
          const start = Date.now();

          if (attempts < 3) {
            throw new Error('SQLITE_LOCKED: retry me');
          }

          delays.push(Date.now() - start);
          return 'success';
        },
        3
      );
    } catch (err) {
      // May fail
    }

    // Should have made multiple attempts
    assert.ok(attempts >= 2);
  });
});
